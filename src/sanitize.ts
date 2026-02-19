import {
	BrowserVisit,
	SearchQuery,
	ShellCommand,
	ClaudeSession,
	SanitizationLevel,
	SanitizeConfig,
} from "./types";

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

const SENSITIVE_URL_PARAMS = new Set([
	"token", "key", "secret", "auth", "access_token", "refresh_token",
	"code", "state", "nonce", "password", "jwt", "session", "sessionid",
	"session_id", "api_key", "apikey", "client_secret", "redirect_uri",
	"samlrequest", "samlresponse", "id_token", "csrf", "xsrf",
	"authorization", "bearer", "credential",
]);

export function sanitizeUrl(rawUrl: string, level: SanitizationLevel): string {
	try {
		const url = new URL(rawUrl);

		// Strip userinfo (user:password@host)
		if (url.username || url.password) {
			url.username = "";
			url.password = "[REDACTED]";
		}

		// Strip sensitive query params
		for (const param of [...url.searchParams.keys()]) {
			if (SENSITIVE_URL_PARAMS.has(param.toLowerCase())) {
				url.searchParams.set(param, "[REDACTED]");
			}
		}

		// Strip fragment if it contains token-like content
		if (url.hash && /(?:access_token|token|key|auth|secret)/i.test(url.hash)) {
			url.hash = "";
		}

		// Aggressive mode: reduce to protocol + host + path only
		if (level === "aggressive") {
			return `${url.protocol}//${url.hostname}${url.pathname}`;
		}

		return url.toString();
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
		url: sanitizeUrl(visit.url, config.level),
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

function sanitizeShellCommand(
	cmd: ShellCommand,
	config: SanitizeConfig
): ShellCommand {
	return {
		...cmd,
		cmd: scrubText(cmd.cmd, config),
	};
}

function sanitizeClaudeSession(
	session: ClaudeSession,
	config: SanitizeConfig
): ClaudeSession {
	return {
		...session,
		prompt: scrubText(session.prompt, config),
	};
}

// ── Master Orchestrator ──────────────────────────────────

export interface SanitizedOutput {
	visits: BrowserVisit[];
	searches: SearchQuery[];
	shellCommands: ShellCommand[];
	claudeSessions: ClaudeSession[];
	excludedVisitCount: number;
}

export function sanitizeCollectedData(
	visits: BrowserVisit[],
	searches: SearchQuery[],
	shellCommands: ShellCommand[],
	claudeSessions: ClaudeSession[],
	config: SanitizeConfig
): SanitizedOutput {
	if (!config.enabled) {
		return {
			visits,
			searches,
			shellCommands,
			claudeSessions,
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
	const sanitizedShell = shellCommands.map((c) => sanitizeShellCommand(c, config));
	const sanitizedClaude = claudeSessions.map((s) => sanitizeClaudeSession(s, config));

	return {
		visits: sanitizedVisits,
		searches: sanitizedSearches,
		shellCommands: sanitizedShell,
		claudeSessions: sanitizedClaude,
		excludedVisitCount: excludedCount,
	};
}
