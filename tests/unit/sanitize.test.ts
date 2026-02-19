import { describe, it, expect } from "vitest";
import {
	sanitizeUrl,
	redactPaths,
	scrubEmails,
	scrubIPs,
	scrubSecrets,
	filterExcludedDomains,
	isExcludedDomain,
	sanitizeCollectedData,
} from "../../src/sanitize";
import { BrowserVisit, SanitizeConfig } from "../../src/types";

// ── Secret Scrubbing ────────────────────────────────────

describe("scrubSecrets", () => {
	it("redacts GitHub PAT (classic)", () => {
		const text = "Use token ghp_ABCDEFghijklmnopqrstuvwxyz1234567890";
		expect(scrubSecrets(text)).toContain("[GITHUB_TOKEN_REDACTED]");
		expect(scrubSecrets(text)).not.toContain("ghp_");
	});

	it("redacts GitHub fine-grained token", () => {
		const token = "github_pat_" + "A".repeat(22) + "_" + "B".repeat(59);
		expect(scrubSecrets(`token: ${token}`)).toContain("[GITHUB_TOKEN_REDACTED]");
	});

	it("redacts GitHub OAuth token", () => {
		expect(scrubSecrets("gho_ABCDEFghijklmnopqrstuvwxyz1234567890"))
			.toContain("[GITHUB_TOKEN_REDACTED]");
	});

	it("redacts Anthropic API key", () => {
		expect(scrubSecrets("key: sk-ant-api03-abc123def456ghi789jklmnopqrst"))
			.toContain("[ANTHROPIC_KEY_REDACTED]");
	});

	it("redacts OpenAI API key", () => {
		const result = scrubSecrets("Token is sk-1234567890abcdefghijklmn here");
		expect(result).toContain("[OPENAI_KEY_REDACTED]");
		expect(result).not.toContain("sk-1234");
	});

	it("redacts Slack tokens", () => {
		expect(scrubSecrets("xoxb-1234-5678-abcdef")).toContain("[SLACK_TOKEN_REDACTED]");
		expect(scrubSecrets("xoxp-1234-5678-abcdef")).toContain("[SLACK_TOKEN_REDACTED]");
	});

	it("redacts npm tokens", () => {
		const token = "npm_" + "a".repeat(36);
		expect(scrubSecrets(token)).toContain("[NPM_TOKEN_REDACTED]");
	});

	it("redacts Stripe secret keys", () => {
		expect(scrubSecrets("sk_live_abcdefghijklmnopqrstuvwxyz"))
			.toContain("[STRIPE_KEY_REDACTED]");
	});

	it("redacts Stripe publishable keys", () => {
		expect(scrubSecrets("pk_live_abcdefghijklmnopqrstuvwxyz"))
			.toContain("[STRIPE_KEY_REDACTED]");
	});

	it("redacts JWTs", () => {
		const jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
		expect(scrubSecrets(jwt)).toContain("[JWT_REDACTED]");
	});

	it("redacts SendGrid keys", () => {
		const sg = "SG." + "a".repeat(22) + "." + "b".repeat(43);
		expect(scrubSecrets(sg)).toContain("[SENDGRID_KEY_REDACTED]");
	});

	it("redacts private key headers", () => {
		expect(scrubSecrets("-----BEGIN PRIVATE KEY-----")).toContain("[PRIVATE_KEY_REDACTED]");
		expect(scrubSecrets("-----BEGIN RSA PRIVATE KEY-----")).toContain("[PRIVATE_KEY_REDACTED]");
	});

	it("redacts AWS AKIA keys", () => {
		expect(scrubSecrets("AKIAIOSFODNN7EXAMPLE1")).toContain("[AWS_KEY_REDACTED]");
	});

	it("redacts hex tokens ≥40 chars", () => {
		const hex = "a".repeat(40);
		expect(scrubSecrets(hex)).toContain("[HEX_TOKEN_REDACTED]");
	});

	it("redacts env var assignments with secret names", () => {
		expect(scrubSecrets("export API_KEY=myvalue")).toContain("[REDACTED]");
		expect(scrubSecrets("SECRET_TOKEN=abc123")).toContain("[REDACTED]");
		expect(scrubSecrets("BEARER_AUTH=xyz")).toContain("[REDACTED]");
	});

	it("redacts Authorization headers", () => {
		expect(scrubSecrets("Authorization: Bearer abc123def")).toContain("[REDACTED]");
		expect(scrubSecrets("authorization: basic dXNlcjpwYXNz")).toContain("[REDACTED]");
	});

	it("redacts database connection strings", () => {
		expect(scrubSecrets("postgres://admin:secretpass@db.host:5432/mydb"))
			.toContain("[REDACTED]");
		expect(scrubSecrets("postgres://admin:secretpass@db.host:5432/mydb"))
			.not.toContain("secretpass");
	});

	it("does NOT redact normal text", () => {
		const normal = "git commit -m 'fix authentication bug in login flow'";
		expect(scrubSecrets(normal)).toBe(normal);
	});

	it("handles text with multiple secrets", () => {
		const text = "export API_KEY=sk-1234567890abcdefghijklmn && curl -H 'Authorization: Bearer abc'";
		const result = scrubSecrets(text);
		expect(result).not.toContain("sk-1234");
		expect(result).toContain("[REDACTED]");
	});
});

// ── URL Sanitization ────────────────────────────────────

describe("sanitizeUrl", () => {
	it("strips sensitive query params (standard)", () => {
		const url = "https://example.com/callback?code=abc123&state=xyz&name=test";
		const result = sanitizeUrl(url, "standard");
		// URL API encodes brackets: [REDACTED] → %5BREDACTED%5D
		expect(result).not.toContain("abc123");
		expect(result).not.toContain("xyz");
		expect(result).toContain("name=test"); // non-sensitive param kept
		expect(result).toContain("REDACTED");
	});

	it("strips access_token param", () => {
		const result = sanitizeUrl("https://api.example.com?access_token=secret123", "standard");
		expect(result).not.toContain("secret123");
		expect(result).toContain("REDACTED");
	});

	it("strips userinfo (user:pass@host)", () => {
		const result = sanitizeUrl("https://admin:password@example.com/path", "standard");
		expect(result).not.toContain("password");
	});

	it("strips fragments with tokens", () => {
		const result = sanitizeUrl("https://example.com/page#access_token=abc", "standard");
		expect(result).not.toContain("access_token=abc");
	});

	it("aggressive mode reduces to protocol+host+path", () => {
		const result = sanitizeUrl("https://example.com/path?q=hello&page=2", "aggressive");
		expect(result).toBe("https://example.com/path");
	});

	it("returns clean URLs unchanged (standard)", () => {
		const clean = "https://github.com/myorg/repo";
		const result = sanitizeUrl(clean, "standard");
		expect(result).toContain("github.com/myorg/repo");
	});

	it("handles invalid URLs", () => {
		expect(sanitizeUrl("not-a-url", "standard")).toBe("[INVALID_URL]");
	});

	it("handles URLs with multiple sensitive params", () => {
		const url = "https://auth.example.com/cb?code=abc&state=def&token=ghi&csrf=jkl&page=1";
		const result = sanitizeUrl(url, "standard");
		expect(result).not.toContain("=abc");
		expect(result).not.toContain("=def");
		expect(result).not.toContain("=ghi");
		expect(result).not.toContain("=jkl");
		expect(result).toContain("page=1");
		// Count REDACTED occurrences (URL-encoded as %5BREDACTED%5D)
		expect((result.match(/REDACTED/g) || []).length).toBe(4);
	});
});

// ── Path Redaction ──────────────────────────────────────

describe("redactPaths", () => {
	it("redacts /Users/name paths", () => {
		expect(redactPaths("/Users/brianruggieri/project/src/main.ts"))
			.toBe("~/project/src/main.ts");
	});

	it("redacts /home/name paths", () => {
		expect(redactPaths("/home/ubuntu/app/server.py"))
			.toBe("~/app/server.py");
	});

	it("redacts paths in middle of text", () => {
		expect(redactPaths("File at /Users/john/docs/file.md was modified"))
			.toBe("File at ~/docs/file.md was modified");
	});

	it("leaves text without paths unchanged", () => {
		expect(redactPaths("npm run build")).toBe("npm run build");
	});

	it("handles multiple paths", () => {
		const text = "cp /Users/alice/a.txt /Users/bob/b.txt";
		const result = redactPaths(text);
		expect(result).not.toContain("/Users/alice");
		expect(result).not.toContain("/Users/bob");
	});
});

// ── Email Scrubbing ─────────────────────────────────────

describe("scrubEmails", () => {
	it("replaces email addresses", () => {
		expect(scrubEmails("contact john.doe@company.com for details"))
			.toBe("contact [EMAIL] for details");
	});

	it("handles multiple emails", () => {
		const text = "cc: alice@example.com, bob@example.org";
		const result = scrubEmails(text);
		expect(result).not.toContain("alice@");
		expect(result).not.toContain("bob@");
		expect(result.match(/\[EMAIL\]/g)?.length).toBe(2);
	});

	it("leaves non-emails alone", () => {
		expect(scrubEmails("@mention in slack")).toBe("@mention in slack");
	});
});

// ── IP Scrubbing ────────────────────────────────────────

describe("scrubIPs", () => {
	it("replaces IPv4 addresses", () => {
		expect(scrubIPs("connected to 192.168.1.100")).toContain("[IP_REDACTED]");
		expect(scrubIPs("connected to 192.168.1.100")).not.toContain("192.168");
	});

	it("handles multiple IPs", () => {
		const result = scrubIPs("10.0.0.1 → 172.16.0.1");
		expect(result.match(/\[IP_REDACTED\]/g)?.length).toBe(2);
	});
});

// ── Domain Exclusion ────────────────────────────────────

describe("isExcludedDomain", () => {
	it("matches exact domain", () => {
		expect(isExcludedDomain("mybank.com", ["mybank.com"])).toBe(true);
	});

	it("matches substring", () => {
		expect(isExcludedDomain("mybank.com", ["bank"])).toBe(true);
	});

	it("returns false for non-match", () => {
		expect(isExcludedDomain("github.com", ["bank"])).toBe(false);
	});

	it("is case-insensitive", () => {
		expect(isExcludedDomain("MyBank.COM", ["mybank"])).toBe(true);
	});
});

describe("filterExcludedDomains", () => {
	const visits: BrowserVisit[] = [
		{ url: "https://github.com/repo", title: "Repo", time: new Date(), domain: "github.com" },
		{ url: "https://mybank.com/account", title: "Account", time: new Date(), domain: "mybank.com" },
		{ url: "https://google.com/search?q=test", title: "Search", time: new Date(), domain: "google.com" },
	];

	it("filters matching domains", () => {
		const result = filterExcludedDomains(visits, ["bank"]);
		expect(result.kept).toHaveLength(2);
		expect(result.excludedCount).toBe(1);
	});

	it("returns all when no exclusions", () => {
		const result = filterExcludedDomains(visits, []);
		expect(result.kept).toHaveLength(3);
		expect(result.excludedCount).toBe(0);
	});

	it("handles multiple exclusion patterns", () => {
		const result = filterExcludedDomains(visits, ["bank", "google"]);
		expect(result.kept).toHaveLength(1);
		expect(result.excludedCount).toBe(2);
	});
});

// ── Master Orchestrator ─────────────────────────────────

describe("sanitizeCollectedData", () => {
	const disabledConfig: SanitizeConfig = {
		enabled: false,
		level: "standard",
		excludedDomains: [],
		redactPaths: true,
		scrubEmails: true,
	};

	const fullConfig: SanitizeConfig = {
		enabled: true,
		level: "standard",
		excludedDomains: ["bank"],
		redactPaths: true,
		scrubEmails: true,
	};

	const visits: BrowserVisit[] = [
		{ url: "https://mybank.com/account?token=abc", title: "Bank", time: new Date() },
		{ url: "https://github.com/repo", title: "Repo", time: new Date() },
	];

	it("returns input unchanged when disabled", () => {
		const result = sanitizeCollectedData(visits, [], [], [], disabledConfig);
		expect(result.visits).toBe(visits); // same reference
		expect(result.excludedVisitCount).toBe(0);
	});

	it("filters and sanitizes when enabled", () => {
		const result = sanitizeCollectedData(visits, [], [], [], fullConfig);
		expect(result.visits).toHaveLength(1); // bank filtered
		expect(result.excludedVisitCount).toBe(1);
		// Remaining URL should be sanitized
		expect(result.visits[0].url).toContain("github.com");
	});

	it("sanitizes shell commands", () => {
		const shell = [{ cmd: "export API_KEY=sk-1234567890abcdefghijklmn", time: new Date() }];
		const result = sanitizeCollectedData([], [], shell, [], fullConfig);
		expect(result.shellCommands[0].cmd).toContain("[REDACTED]");
	});

	it("redacts paths in Claude sessions", () => {
		const claude = [{
			prompt: "File at /Users/brian/secret.txt",
			time: new Date(),
			project: "test",
		}];
		const result = sanitizeCollectedData([], [], [], claude, fullConfig);
		expect(result.claudeSessions[0].prompt).not.toContain("/Users/brian");
		expect(result.claudeSessions[0].prompt).toContain("~");
	});

	it("scrubs emails in search queries", () => {
		const searches = [{ query: "settings for user@example.com", time: new Date(), engine: "google.com" }];
		const result = sanitizeCollectedData([], searches, [], [], fullConfig);
		expect(result.searches[0].query).toContain("[EMAIL]");
	});
});
