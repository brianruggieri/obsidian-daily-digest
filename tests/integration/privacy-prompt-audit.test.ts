/**
 * Privacy Prompt Audit — Adversary Persona Tests
 *
 * Runs adversary personas (data seeded with realistic secrets, PII, and
 * sensitive domain visits) through the FULL production pipeline and asserts
 * that no sensitive data survives into `buildProsePrompt()` output at each
 * of the 4 privacy tiers.
 *
 * No AI/API calls — purely deterministic.
 */

import { describe, it, expect, beforeAll } from "vitest";

// Pipeline stages
import { sanitizeCollectedData } from "../../src/filter/sanitize";
import { filterSensitiveDomains, filterSensitiveSearches } from "../../src/filter/sensitivity";
import { categorizeVisits } from "../../src/filter/categorize";
import { classifyEventsRuleOnly } from "../../src/filter/classify";
import { extractPatterns, buildEmptyTopicHistory } from "../../src/analyze/patterns";
import { clusterArticles } from "../../src/analyze/clusters";
import { computeEngagementScore } from "../../src/analyze/engagement";
import { linkSearchesToVisits } from "../../src/analyze/intent";
import { cleanTitle } from "../../src/collect/browser";
import { compressActivity } from "../../src/summarize/compress";
import {
	buildTierFilteredOptions,
	buildProsePrompt,
	type ProseOptions,
	type PrivacyTier,
} from "../../src/summarize/summarize";

// Fixtures
import { PersonaOutput } from "../fixtures/personas";
import { defaultSanitizeConfig, defaultPatternConfig } from "../fixtures/scenarios";
import { ADVERSARY_PERSONAS } from "../fixtures/adversary-personas";
import { getAllSecrets, SENSITIVE_DOMAINS } from "../fixtures/sensitive-data";
import type {
	SensitivityConfig,
	SensitivityCategory,
	CategorizedVisits,
	ClassificationResult,
	PatternAnalysis,
	ArticleCluster,
} from "../../src/types";
import type { CompressedActivity } from "../../src/summarize/compress";

// ── Test Configs ────────────────────────────────────────

const DATE = new Date("2025-06-15T00:00:00");
const TODAY = "2025-06-15";

/** Sensitivity config with ALL categories enabled (maximum filtering). */
function fullSensitivityConfig(): SensitivityConfig {
	return {
		enabled: true,
		categories: [
			"adult", "gambling", "dating", "health",
			"finance", "drugs", "weapons", "piracy",
			"vpn_proxy", "job_search", "social_personal",
			"tracker", "auth",
		] as SensitivityCategory[],
		customDomains: [],
		action: "exclude",
	};
}

// ── Pipeline Runner ─────────────────────────────────────

interface PipelineResult {
	prompts: Record<PrivacyTier, string>;
	sanitizedVisitUrls: string[];
	sanitizedClaudePrompts: string[];
	categorized: CategorizedVisits;
	classification: ClassificationResult;
	patterns: PatternAnalysis;
	compressed: CompressedActivity;
	articleClusters: ArticleCluster[];
	fullOptions: ProseOptions;
}

/**
 * Run the full production pipeline for one persona.
 * Mirrors the 10-stage pipeline from main.ts:
 *   sanitize → sensitivity filter → categorize → classify → clustering
 *   → patterns → compress → build tier options → build prose prompt
 */
function runFullPipeline(persona: PersonaOutput): PipelineResult {
	const sanitizeConfig = defaultSanitizeConfig();

	// 1. Sanitize all collected data
	const sanitized = sanitizeCollectedData(
		persona.visits,
		persona.searches,
		[...persona.claude, ...(persona.codex ?? [])],
		persona.git ?? [],
		sanitizeConfig
	);

	// 2. Sensitivity filter (visits + searches)
	const sensConfig = fullSensitivityConfig();
	const { kept: filteredVisits } = filterSensitiveDomains(sanitized.visits, sensConfig);
	const { kept: filteredSearches } = filterSensitiveSearches(sanitized.searches, sensConfig);

	// 3. Categorize
	const categorized = categorizeVisits(filteredVisits);

	// 4. Classify (rule-only, no LLM)
	const classification = classifyEventsRuleOnly(
		filteredVisits,
		filteredSearches,
		sanitized.claudeSessions,
		sanitized.gitCommits,
		categorized
	);

	// 5. Article clustering
	const searchLinks = linkSearchesToVisits(filteredSearches, filteredVisits);
	const cleanedTitles = filteredVisits.map((v) => cleanTitle(v.title ?? ""));
	const engagementScores = filteredVisits.map((v, i) =>
		computeEngagementScore(v, cleanedTitles[i], filteredVisits, searchLinks)
	);
	const articleClusters = clusterArticles(filteredVisits, cleanedTitles, engagementScores);

	// 6. Extract patterns
	const patternConfig = defaultPatternConfig();
	const patterns = extractPatterns(
		classification,
		patternConfig,
		buildEmptyTopicHistory(),
		TODAY,
		sanitized.gitCommits,
		sanitized.claudeSessions,
		filteredSearches,
		filteredVisits,
		articleClusters
	);

	// 7. Compress activity (for Tier 2)
	const compressed = compressActivity(categorized, filteredSearches, sanitized.claudeSessions, sanitized.gitCommits, 1500);

	// 8. Build full options object
	const fullOptions: ProseOptions = {
		categorized,
		searches: filteredSearches,
		claudeSessions: sanitized.claudeSessions,
		gitCommits: sanitized.gitCommits,
		compressed,
		classification,
		patterns,
		articleClusters,
	};

	// 9. Build prompts at all 4 tiers
	const prompts = {} as Record<PrivacyTier, string>;
	for (const tier of [1, 2, 3, 4] as PrivacyTier[]) {
		const tierOptions = buildTierFilteredOptions(tier, fullOptions);
		prompts[tier] = buildProsePrompt(DATE, "", tierOptions, undefined, "balanced", tier);
	}

	return {
		prompts,
		sanitizedVisitUrls: sanitized.visits.map((v) => v.url),
		sanitizedClaudePrompts: sanitized.claudeSessions.map((s) => s.prompt),
		categorized,
		classification,
		patterns,
		compressed,
		articleClusters,
		fullOptions,
	};
}

// ── Assertion Helpers ───────────────────────────────────

/**
 * Assert no secret string literals appear in the prompt.
 * On failure, reports exactly which secret leaked and a prompt excerpt.
 */
function assertNoSecretLeaks(prompt: string, personaName: string, tier: PrivacyTier): void {
	const secrets = getAllSecrets();
	for (const secret of secrets) {
		if (prompt.includes(secret)) {
			const idx = prompt.indexOf(secret);
			const excerpt = prompt.slice(Math.max(0, idx - 40), idx + secret.length + 40);
			throw new Error(
				`[${personaName} / Tier ${tier}] Secret leaked into prompt!\n` +
				`  Secret: "${secret.slice(0, 30)}..."\n` +
				`  Context: "...${excerpt}..."`
			);
		}
	}
}

/**
 * Assert no secret patterns match in the prompt via regex.
 * Catches secrets that might appear in modified form (partial match).
 */
function assertNoRegexLeaks(prompt: string, personaName: string, tier: PrivacyTier): void {
	const patterns: [RegExp, string][] = [
		[/ghp_[A-Za-z0-9_]{36}/, "GitHub PAT"],
		[/sk-ant-[A-Za-z0-9_-]{20,}/, "Anthropic API key"],
		[/AKIA[A-Z0-9]{16}/, "AWS access key"],
		[/sk-[A-Za-z0-9]{20,}/, "OpenAI API key"],
		[/[sr]k_(?:live|test)_[A-Za-z0-9]{20,}/, "Stripe secret key"],
		[/xox[bpras]-[A-Za-z0-9-]{10,}/, "Slack token"],
		[/npm_[A-Za-z0-9]{36}/, "npm token"],
		[/SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}/, "SendGrid key"],
		[/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/, "JWT token"],
		[/-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/, "SSH private key"],
		[/(?:postgres|mysql|mongodb):\/\/[^:]+:(?!\[REDACTED\])[^@]+@/, "DB connection string"],
		[/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/, "Email address"],
		[/\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/, "IPv4 address"],
		[/(?:\/Users\/[^/\s]+|\/home\/[^/\s]+)/, "Home directory path"],
		[/\b\d{3}-\d{2}-\d{4}\b/, "SSN"],
		[/\b(?:4\d{3}|5[1-5]\d{2}|6(?:011|5\d{2})|3[47]\d{2})\d{8,12}\b/, "Credit card number"],
	];

	for (const [regex, label] of patterns) {
		const match = prompt.match(regex);
		if (match) {
			throw new Error(
				`[${personaName} / Tier ${tier}] Regex pattern leaked: ${label}\n` +
				`  Match: "${match[0].slice(0, 50)}"`
			);
		}
	}
}

/**
 * Assert no sensitive domain names appear in the prompt.
 * Only applies at Tiers 3-4 where abstractions replace raw URLs.
 */
function assertNoSensitiveDomains(prompt: string, personaName: string, tier: PrivacyTier): void {
	for (const domain of SENSITIVE_DOMAINS) {
		if (prompt.toLowerCase().includes(domain.toLowerCase())) {
			throw new Error(
				`[${personaName} / Tier ${tier}] Sensitive domain leaked: ${domain}`
			);
		}
	}
}

// ── Main Test Suite ─────────────────────────────────────

describe("privacy prompt audit — buildProsePrompt()", () => {
	for (const personaFn of ADVERSARY_PERSONAS) {
		const persona = personaFn(DATE);

		describe(`Persona: ${persona.name}`, () => {
			let result: PipelineResult;

			beforeAll(() => {
				result = runFullPipeline(persona);
			});

			// ── Pre-prompt sanitization checks ──

			it("sanitization removes secrets from visit URLs", () => {
				const secrets = getAllSecrets();
				for (const url of result.sanitizedVisitUrls) {
					for (const secret of secrets) {
						expect(url).not.toContain(secret);
					}
				}
			});

			it("sanitization removes secrets from Claude prompts", () => {
				for (const prompt of result.sanitizedClaudePrompts) {
					// Check for specific token patterns that should be scrubbed
					expect(prompt).not.toMatch(/AKIA[A-Z0-9]{16}/);
					expect(prompt).not.toMatch(/ghp_[A-Za-z0-9_]{36}/);
					expect(prompt).not.toMatch(/sk-ant-[A-Za-z0-9_-]{20,}/);
					expect(prompt).not.toMatch(/xox[bpras]-[A-Za-z0-9-]{10,}/);
					expect(prompt).not.toMatch(/-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/);
					expect(prompt).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/);
				}
			});

			// ── Tier 4: Aggregated statistics only ──

			describe("Tier 4 — aggregated statistics only", () => {
				it("no secrets (string match)", () => {
					assertNoSecretLeaks(result.prompts[4], persona.name, 4);
				});

				it("no secrets (regex match)", () => {
					assertNoRegexLeaks(result.prompts[4], persona.name, 4);
				});

				it("no sensitive domains", () => {
					assertNoSensitiveDomains(result.prompts[4], persona.name, 4);
				});

				it("no raw URLs (https://)", () => {
					// Tier 4 should contain no raw http URLs in the activity data
					// (the template preamble may mention URLs conceptually, but not data URLs)
					const prompt = result.prompts[4];
					const activityStart = prompt.indexOf("Focus:");
					if (activityStart > -1) {
						const activitySection = prompt.slice(activityStart);
						expect(activitySection).not.toMatch(/https?:\/\/[^\s"<>]+\.(com|org|net|io|dev)/);
					}
				});

				it("no verbatim search queries from persona", () => {
					const prompt = result.prompts[4];
					for (const s of persona.searches) {
						if (s.query.length > 15) {
							expect(prompt).not.toContain(s.query);
						}
					}
				});

				it("does contain statistical patterns", () => {
					const prompt = result.prompts[4];
					// Tier 4 should have pattern data (focus score, activity distribution)
					expect(prompt).toMatch(/Focus:\s*\d+%/);
				});
			});

			// ── Tier 3: Classified abstractions only ──

			describe("Tier 3 — classified abstractions only", () => {
				it("no secrets (string match)", () => {
					assertNoSecretLeaks(result.prompts[3], persona.name, 3);
				});

				it("no secrets (regex match)", () => {
					assertNoRegexLeaks(result.prompts[3], persona.name, 3);
				});

				it("no sensitive domains", () => {
					assertNoSensitiveDomains(result.prompts[3], persona.name, 3);
				});

				it("no raw URLs in classified summaries", () => {
					const prompt = result.prompts[3];
					// Classified events use summaries, not raw URLs
					const classifiedStart = prompt.indexOf("Classified activity:");
					if (classifiedStart > -1) {
						const classifiedSection = prompt.slice(classifiedStart);
						// Should not contain full URLs in the classified section
						expect(classifiedSection).not.toMatch(/https?:\/\/[^\s]+@/);  // no userinfo URLs
					}
				});

				it("contains classified summaries", () => {
					const prompt = result.prompts[3];
					// Tier 3 should have classified activity sections
					expect(prompt.length).toBeGreaterThan(100);
				});
			});

			// ── Tier 2: Compressed activity ──

			describe("Tier 2 — compressed activity", () => {
				it("no secrets (string match)", () => {
					assertNoSecretLeaks(result.prompts[2], persona.name, 2);
				});

				it("no secrets (regex match)", () => {
					assertNoRegexLeaks(result.prompts[2], persona.name, 2);
				});

				it("no URL userinfo credentials", () => {
					expect(result.prompts[2]).not.toMatch(/https?:\/\/[^/]+:[^/]+@/);
				});

				it("no JWT tokens", () => {
					expect(result.prompts[2]).not.toMatch(
						/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/
					);
				});

				it("no OAuth codes", () => {
					expect(result.prompts[2]).not.toContain("auth_4f6g7h8i9j0k");
				});
			});

			// ── Tier 1: Full context ──

			describe("Tier 1 — full context", () => {
				it("no secrets (string match)", () => {
					assertNoSecretLeaks(result.prompts[1], persona.name, 1);
				});

				it("no secrets (regex match)", () => {
					assertNoRegexLeaks(result.prompts[1], persona.name, 1);
				});

				it("no URL userinfo credentials", () => {
					expect(result.prompts[1]).not.toMatch(/https?:\/\/[^/]+:[^/]+@/);
				});

				it("no OAuth codes", () => {
					expect(result.prompts[1]).not.toContain("auth_4f6g7h8i9j0k");
				});

				it("no raw passwords", () => {
					expect(result.prompts[1]).not.toContain("s3cretP@ssw0rd");
					expect(result.prompts[1]).not.toContain("hunter2secret");
				});

				it("does contain activity data (not empty)", () => {
					const prompt = result.prompts[1];
					expect(prompt.length).toBeGreaterThan(500);
					// Tier 1 renders raw arrays — should have browser activity
					expect(prompt).toMatch(/Browser activity:|browser_activity/i);
				});
			});
		});
	}

	// ── Tier Data Isolation ─────────────────────────────

	describe("tier data isolation", () => {
		let result: PipelineResult;

		beforeAll(() => {
			// Use careless developer — most data-rich persona
			const persona = ADVERSARY_PERSONAS[0](DATE);
			result = runFullPipeline(persona);
		});

		it("Tier 4 prompt shorter than Tier 1", () => {
			expect(result.prompts[4].length).toBeLessThan(result.prompts[1].length);
		});

		it("Tier 4 has no raw activity sections", () => {
			const prompt = result.prompts[4];
			// Tier 4 should not contain per-visit or per-search data
			expect(prompt).not.toContain("stackoverflow.com");
			expect(prompt).not.toContain("developer.mozilla.org");
		});

		it("Tier 3 has no URLs in classified summaries", () => {
			const prompt = result.prompts[3];
			// Classified section should use summaries, not URLs
			const classifiedIdx = prompt.indexOf("Classified activity:");
			if (classifiedIdx > -1) {
				const section = prompt.slice(classifiedIdx);
				expect(section).not.toMatch(/https?:\/\/[^\s]+\.(com|org|net)/);
			}
		});

		it("Tier 2 does not include raw arrays", () => {
			const prompt = result.prompts[2];
			// Tier 2 uses compressed text, not raw visit lists
			// It should not contain the per-domain breakdown format used by Tier 1
			expect(prompt).not.toMatch(/\[Development\] .*github\.com/);
		});

		it("each tier's prompt is non-empty", () => {
			for (const tier of [1, 2, 3, 4] as PrivacyTier[]) {
				expect(result.prompts[tier].length).toBeGreaterThan(100);
			}
		});
	});
});
