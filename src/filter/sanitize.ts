import {
	BrowserVisit,
	SearchQuery,
	ClaudeSession,
	GitCommit,
	SanitizeConfig,
} from "../types";
import { stripAnsi } from "../render/escape";

// ── Expanded Secret Patterns ─────────────────────────────
// Supersedes the 5 patterns in categorize.ts with broader coverage.

const SECRET_PATTERNS: [RegExp, string][] = [
	// Environment variable assignments with secret-like names
	[
		/(?:export\s+)?(\w*(?:password|passwd|secret|token|key|api_?key|auth|bearer|credential)\w*)\s*=\s*\S+/gi,
		"$1=[REDACTED]",
	],
	// Authorization headers
	[
		/(authorization:\s*(?:bearer|basic|token)\s+)\S+/gi,
		"$1[REDACTED]",
	],
	// Database connection strings with credentials
	[
		/((?:postgres|mysql|mongodb|redis):\/\/[^:]+:)[^@]+(@)/gi,
		"$1[REDACTED]$2",
	],
	// AWS access keys
	[
		/AKIA[A-Z0-9]{16}/g,
		"[AWS_KEY_REDACTED]",
	],
	// GitHub Personal Access Tokens (classic)
	[
		/ghp_[A-Za-z0-9_]{36}/g,
		"[GITHUB_TOKEN_REDACTED]",
	],
	// GitHub fine-grained tokens
	[
		/github_pat_[A-Za-z0-9_]{22}_[A-Za-z0-9_]{59}/g,
		"[GITHUB_TOKEN_REDACTED]",
	],
	// GitHub OAuth tokens
	[
		/gho_[A-Za-z0-9_]{36}/g,
		"[GITHUB_TOKEN_REDACTED]",
	],
	// Anthropic API keys
	[
		/sk-ant-[A-Za-z0-9_-]{20,}/g,
		"[ANTHROPIC_KEY_REDACTED]",
	],
	// OpenAI API keys
	[
		/sk-[A-Za-z0-9]{20,}/g,
		"[OPENAI_KEY_REDACTED]",
	],
	// Slack tokens (bot, user, app, etc.)
	[
		/xox[bpras]-[A-Za-z0-9-]{10,}/g,
		"[SLACK_TOKEN_REDACTED]",
	],
	// npm tokens
	[
		/npm_[A-Za-z0-9]{36}/g,
		"[NPM_TOKEN_REDACTED]",
	],
	// Stripe secret/publishable keys
	[
		/[sr]k_(?:live|test)_[A-Za-z0-9]{20,}/g,
		"[STRIPE_KEY_REDACTED]",
	],
	[
		/pk_(?:live|test)_[A-Za-z0-9]{20,}/g,
		"[STRIPE_KEY_REDACTED]",
	],
	// JSON Web Tokens (header.payload.signature)
	[
		/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/g,
		"[JWT_REDACTED]",
	],
	// SendGrid API keys
	[
		/SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}/g,
		"[SENDGRID_KEY_REDACTED]",
	],
	// Private key blocks
	[
		/-----BEGIN\s+(?:RSA\s+|EC\s+|DSA\s+)?PRIVATE\s+KEY-----/g,
		"[PRIVATE_KEY_REDACTED]",
	],
	// Hex tokens (≥40 chars, likely API keys or hashes)
	[
		/\b[0-9a-f]{40,}\b/gi,
		"[HEX_TOKEN_REDACTED]",
	],
];

// ── URL Sanitization ─────────────────────────────────────

export function sanitizeUrl(rawUrl: string): string {
	try {
		const url = new URL(rawUrl);

		// Reduce to protocol + host (includes port) + path only.
		// Query strings never carry useful signal after collection (search queries
		// are extracted earlier from raw URLs), and stripping them removes tracking
		// params, auth tokens, and session IDs in one shot.
		// Userinfo (user:password@host) is also dropped since we build from parts.
		return `${url.protocol}//${url.host}${url.pathname}`;
	} catch {
		// Invalid URL — return redacted placeholder
		return "[INVALID_URL]";
	}
}

// ── Path Redaction ───────────────────────────────────────

const HOME_PATH_PATTERN = /(?:\/Users\/[^/\s]+|\/home\/[^/\s]+)/g;

export function redactPaths(text: string): string {
	return text.replace(HOME_PATH_PATTERN, "~");
}

// ── Email Scrubbing ──────────────────────────────────────

const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

export function scrubEmails(text: string): string {
	return text.replace(EMAIL_PATTERN, "[EMAIL]");
}

// ── IP Address Scrubbing ─────────────────────────────────

const IPV4_PATTERN = /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g;

export function scrubIPs(text: string): string {
	return text.replace(IPV4_PATTERN, "[IP_REDACTED]");
}

// ── Master Text Scrubber ─────────────────────────────────

export function scrubSecrets(text: string): string {
	for (const [pattern, replacement] of SECRET_PATTERNS) {
		text = text.replace(pattern, replacement);
	}
	return text;
}

function scrubText(
	text: string,
	config: SanitizeConfig
): string {
	// Always scrub secrets
	let result = scrubSecrets(text);

	// Scrub IPs
	result = scrubIPs(result);

	// Optional: redact file paths
	if (config.redactPaths) {
		result = redactPaths(result);
	}

	// Optional: scrub email addresses
	if (config.scrubEmails) {
		result = scrubEmails(result);
	}

	return result;
}

// ── Domain Exclusion ─────────────────────────────────────

export function isExcludedDomain(
	domain: string,
	excludedPatterns: string[]
): boolean {
	const d = domain.toLowerCase();
	return excludedPatterns.some((pattern) => d.includes(pattern.toLowerCase()));
}

export function filterExcludedDomains(
	visits: BrowserVisit[],
	excludedPatterns: string[]
): { kept: BrowserVisit[]; excludedCount: number } {
	if (excludedPatterns.length === 0) {
		return { kept: visits, excludedCount: 0 };
	}

	const kept: BrowserVisit[] = [];
	let excludedCount = 0;

	for (const visit of visits) {
		let domain = "";
		try {
			domain = new URL(visit.url).hostname.replace(/^www\./, "");
		} catch {
			// keep visits with unparseable URLs
			kept.push(visit);
			continue;
		}

		if (isExcludedDomain(domain, excludedPatterns)) {
			excludedCount++;
		} else {
			kept.push(visit);
		}
	}

	return { kept, excludedCount };
}

// ── Per-Type Sanitizers ──────────────────────────────────

function sanitizeBrowserVisit(
	visit: BrowserVisit,
	config: SanitizeConfig
): BrowserVisit {
	return {
		...visit,
		url: sanitizeUrl(visit.url),
		title: scrubText(visit.title || "", config),
	};
}

function sanitizeSearchQuery(
	query: SearchQuery,
	config: SanitizeConfig
): SearchQuery {
	return {
		...query,
		query: scrubText(query.query, config),
	};
}

/** Known XML artifact patterns injected by Claude Code UI events */
const CLAUDE_XML_ARTIFACTS: RegExp[] = [
	/<image>[\s\S]*?<\/image>/g,  // screenshot blocks (may contain base64 or paths)
	/<\/image>/g,                  // orphaned closing tag fallback
	/<turn_aborted\s*\/?>/g,       // turn abort markers (open or self-closing)
];

function stripClaudeXmlArtifacts(text: string): string {
	let result = text;
	for (const pattern of CLAUDE_XML_ARTIFACTS) {
		result = result.replace(pattern, "");
	}
	// Strip ANSI escape codes from terminal output (via centralized utility)
	result = stripAnsi(result);
	// Collapse multiple blank lines left by removal
	return result.replace(/\n{3,}/g, "\n\n").trim();
}

function sanitizeClaudeSession(
	session: ClaudeSession,
	config: SanitizeConfig
): ClaudeSession {
	return {
		...session,
		prompt: scrubText(stripClaudeXmlArtifacts(session.prompt), config),
	};
}

function sanitizeGitCommit(commit: GitCommit, _config: SanitizeConfig): GitCommit {
	return {
		...commit,
		message: scrubSecrets(commit.message),
	};
}

// ── Master Orchestrator ──────────────────────────────────

export interface SanitizedOutput {
	visits: BrowserVisit[];
	searches: SearchQuery[];
	claudeSessions: ClaudeSession[];
	gitCommits: GitCommit[];
	excludedVisitCount: number;
}

export function sanitizeCollectedData(
	visits: BrowserVisit[],
	searches: SearchQuery[],
	claudeSessions: ClaudeSession[],
	gitCommits: GitCommit[],
	config: SanitizeConfig
): SanitizedOutput {
	if (!config.enabled) {
		return {
			visits,
			searches,
			claudeSessions,
			gitCommits,
			excludedVisitCount: 0,
		};
	}

	// 1. Filter excluded domains
	const { kept, excludedCount } = filterExcludedDomains(
		visits,
		config.excludedDomains
	);

	// 2. Sanitize each data type
	const sanitizedVisits = kept.map((v) => sanitizeBrowserVisit(v, config));
	const sanitizedSearches = searches.map((s) => sanitizeSearchQuery(s, config));
	const sanitizedClaude = claudeSessions.map((s) => sanitizeClaudeSession(s, config));
	const sanitizedGit = gitCommits.map((c) => sanitizeGitCommit(c, config));

	return {
		visits: sanitizedVisits,
		searches: sanitizedSearches,
		claudeSessions: sanitizedClaude,
		gitCommits: sanitizedGit,
		excludedVisitCount: excludedCount,
	};
}
