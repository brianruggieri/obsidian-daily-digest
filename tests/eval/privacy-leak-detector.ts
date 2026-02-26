/**
 * Privacy Leak Detector Module
 *
 * Validates AI model outputs for privacy leaks before expensive Claude API calls.
 * Tier-specific validation ensures compliance with privacy escalation rules.
 *
 * Supported privacy tiers:
 * - tier-1-standard: Full context allowed if secrets are stripped
 * - tier-2-rag: Retrieved chunks only
 * - tier-3-classified: Abstractions only (no raw commands/files)
 * - tier-4-deidentified: Aggregates and patterns only (strict)
 */

export type PrivacyTier =
	| "tier-1-standard"
	| "tier-2-rag"
	| "tier-3-classified"
	| "tier-4-deidentified";

/**
 * Privacy leak detection report.
 */
export interface LeakReport {
	/** Privacy tier that was validated */
	tier: PrivacyTier;
	/** Whether validation passed */
	passed: boolean;
	/** List of violations found */
	violations: string[];
	/** Secrets detected (real secrets only, not test/fake data) */
	secrets_found: string[];
	/** URLs found in output */
	urls_found: string[];
	/** Commands found in output */
	commands_found: string[];
}

/**
 * Detects privacy leaks in AI model outputs based on tier-specific rules.
 */
export class PrivacyLeakDetector {
	private tier: PrivacyTier;

	constructor(tier: PrivacyTier) {
		this.tier = tier;
	}

	/**
	 * Validate output against tier-specific privacy rules.
	 */
	validate(output: string): LeakReport {
		const report: LeakReport = {
			tier: this.tier,
			passed: true,
			violations: [],
			secrets_found: [],
			urls_found: [],
			commands_found: [],
		};

		// Always check for secrets first (zero tolerance)
		this.detectSecrets(output, report);

		// Check tier-specific violations
		switch (this.tier) {
			case "tier-4-deidentified":
				this.validateTier4(output, report);
				break;
			case "tier-3-classified":
				this.validateTier3(output, report);
				break;
			case "tier-2-rag":
				this.validateTier2(output, report);
				break;
			case "tier-1-standard":
				this.validateTier1(output, report);
				break;
		}

		report.passed = report.violations.length === 0 && report.secrets_found.length === 0;
		return report;
	}

	// ── Secret Detection ─────────────────────────────────────

	/**
	 * Detect real secrets in output. Fake/test data is allowed.
	 */
	private detectSecrets(output: string, report: LeakReport): void {
		// List of secret patterns: [regex, label]
		const secretPatterns: [RegExp, string][] = [
			// Anthropic API keys (real format: sk-ant-[20+ chars])
			[/sk-ant-[A-Za-z0-9_-]{20,}/g, "Anthropic API key"],
			// OpenAI project keys (sk-proj-[20+ chars])
			[/sk-proj-[A-Za-z0-9_-]{20,}/g, "OpenAI project key"],
			// GitHub PAT classic (ghp_[20+ chars])
			[/ghp_[A-Za-z0-9_]{20,}/g, "GitHub token"],
			// GitHub fine-grained tokens
			[/github_pat_[A-Za-z0-9_]{22}_[A-Za-z0-9_]{59}/g, "GitHub token"],
			// GitHub OAuth tokens
			[/gho_[A-Za-z0-9_]{36,}/g, "GitHub token"],
			// AWS Access keys (AKIA[16 uppercase/digits])
			[/AKIA[A-Z0-9]{16}/g, "AWS access key"],
			// Slack tokens (xox[bpras]-[10+ chars])
			[/xox[bpras]-[A-Za-z0-9_-]{10,}/g, "Slack token"],
			// npm tokens
			[/npm_[A-Za-z0-9]{36,}/g, "npm token"],
			// Stripe keys (sk/pk_live/test_[20+ chars])
			[/[sr]k_(?:live|test)_[A-Za-z0-9]{20,}/g, "Stripe key"],
			[/pk_(?:live|test)_[A-Za-z0-9]{20,}/g, "Stripe key"],
			// JWT tokens (header.payload.signature pattern)
			[/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/g, "JWT token"],
			// SendGrid API keys
			[/SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}/g, "SendGrid key"],
			// Private key blocks
			[/-----BEGIN\s+(?:RSA\s+|EC\s+|DSA\s+)?PRIVATE\s+KEY-----/g, "Private key"],
			// Email addresses
			[/\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g, "Email address"],
			// IP addresses (including private ranges for detection)
			[/\b(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g, "IP address"],
			// Password assignments (password/passwd/pwd = "xxx")
			[/\b(?:password|passwd|pwd)\s*=\s*["']?[^"'\s,;]+/gi, "Password assignment"],
			// API key assignments (excluding test data)
			[/\b(?:api_?key|apikey)\s*=\s*["']?[^"'\s,;]+/gi, "API key assignment"],
		];

		for (const [pattern, label] of secretPatterns) {
			const matches = [...output.matchAll(pattern)];
			for (const match of matches) {
				const matchText = match[0];
				// Skip clearly marked test/fake data
				if (matchText.toLowerCase().includes("test") ||
					matchText.toLowerCase().includes("fake")) {
					continue;
				}
				report.secrets_found.push(`${label}: ${matchText.substring(0, 30)}...`);
			}
		}
	}

	// ── Tier 4 Validation ────────────────────────────────────

	/**
	 * Tier 4 (Deidentified): Strict aggregates and patterns only.
	 * NO: URLs, file paths, tool names, raw commands
	 */
	private validateTier4(output: string, report: LeakReport): void {
		// Check for URLs (https://... or http://...)
		const urlPattern = /https?:\/\/[^\s]+/gi;
		const urls = [...output.matchAll(urlPattern)];
		if (urls.length > 0) {
			report.violations.push(`Tier 4 violation: Found ${urls.length} URL(s) - must use only aggregates`);
			for (const match of urls.slice(0, 3)) {
				report.urls_found.push(match[0]);
			}
		}

		// Check for file paths (Unix: /path/to/file or Windows: C:\path\to\file)
		const filePathPattern = /(?:\/[^\s]+|[A-Z]:\\[^\s]+)/g;
		const filePaths = [...output.matchAll(filePathPattern)];
		if (filePaths.length > 0) {
			report.violations.push(`Tier 4 violation: Found file path(s) - only aggregates allowed`);
		}

		// Check for tool names (github, npm, git, slack, aws, docker, etc.)
		const toolNames = [
			"github", "npm", "git", "slack", "aws", "docker", "kubernetes",
			"jenkins", "gitlab", "bitbucket", "jira", "notion", "asana",
			"postgresql", "mysql", "mongodb", "redis", "elasticsearch",
			"kubernetes", "terraform", "ansible", "vagrant", "docker-compose",
		];
		const toolPattern = new RegExp(`\\b(${toolNames.join("|")})\\b`, "gi");
		const toolMatches = [...output.matchAll(toolPattern)];
		if (toolMatches.length > 0) {
			const uniqueTools = [...new Set(toolMatches.map(m => m[1].toLowerCase()))];
			report.violations.push(
				`Tier 4 violation: Found tool name(s): ${uniqueTools.slice(0, 3).join(", ")} - only aggregates allowed`
			);
		}
	}

	// ── Tier 3 Validation ────────────────────────────────────

	/**
	 * Tier 3 (Classified): Abstractions only.
	 * NO: Raw commands, file paths, tool names
	 */
	private validateTier3(output: string, report: LeakReport): void {
		// Check for raw commands (git commit, npm run, curl, sqlite3, mysql, etc.)
		const commandPatterns: RegExp[] = [
			/\bgit\s+(?:commit|push|pull|branch|checkout|merge|rebase)/gi,
			/\bnpm\s+(?:run|install|start|test|build|publish)/gi,
			/\bcurl\s+-/gi,
			/\bsqlite3?\s+/gi,
			/\bmysql\s+-/gi,
			/\bdocker\s+(?:run|build|push|pull)/gi,
			/\bkubectl\s+/gi,
			/\brm\s+-rf|rm\s+-r/gi,
			/\bsudo\s+/gi,
		];

		for (const pattern of commandPatterns) {
			const matches = [...output.matchAll(pattern)];
			if (matches.length > 0) {
				report.violations.push(`Tier 3 violation: Found raw command(s) - use abstractions only`);
				for (const match of matches.slice(0, 2)) {
					report.commands_found.push(match[0]);
				}
				break; // Only report once
			}
		}

		// Check for file paths
		const filePathPattern = /(?:\/[^\s]+(?:\/|\.ts|\.js|\.py)|[A-Z]:\\[^\s]+)/g;
		const filePaths = [...output.matchAll(filePathPattern)];
		if (filePaths.length > 0) {
			report.violations.push(`Tier 3 violation: Found file path(s) - use abstractions only`);
		}
	}

	// ── Tier 2 Validation ────────────────────────────────────

	/**
	 * Tier 2 (RAG): Retrieved chunks are allowed, but not full context.
	 * Generally permissive - mainly ensures no unfiltered full prompts.
	 */
	private validateTier2(_output: string, _report: LeakReport): void {
		// Tier 2 is relatively permissive - allows RAG chunks.
		// No additional validation needed beyond secret detection which is already
		// handled in the main validate() method via detectSecrets().
	}

	// ── Tier 1 Validation ────────────────────────────────────

	/**
	 * Tier 1 (Standard): Full context allowed if secrets are stripped.
	 * Main constraint: secrets must be redacted.
	 * Already covered by secret detection above.
	 */
	private validateTier1(_output: string, _report: LeakReport): void {
		// Tier 1 is the most permissive - only secrets are forbidden.
		// Tier 1 validation relies solely on secret detection, which is already
		// handled in the main validate() method via detectSecrets().
	}
}
