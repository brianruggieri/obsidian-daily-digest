import { describe, it, expect } from "vitest";
import {
	sanitizeUrl,
	redactPaths,
	scrubEmails,
	scrubIPs,
	scrubSecrets,
	sanitizeCollectedData,
} from "../../../src/filter/sanitize";
import { BrowserVisit } from "../../../src/types";

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
		expect(scrubSecrets("sk_test_abcdefghijklmnopqrstuvwxyz"))
			.toContain("[STRIPE_KEY_REDACTED]");
	});

	it("redacts Stripe publishable keys", () => {
		expect(scrubSecrets("pk_test_abcdefghijklmnopqrstuvwxyz"))
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
	it("always strips to protocol + host + path", () => {
		const url = "https://example.com/callback?code=abc123&state=xyz&name=test";
		const result = sanitizeUrl(url);
		expect(result).toBe("https://example.com/callback");
	});

	it("strips query params entirely", () => {
		const result = sanitizeUrl("https://api.example.com?access_token=secret123");
		expect(result).toBe("https://api.example.com/");
		expect(result).not.toContain("secret123");
	});

	it("strips userinfo (user:pass@host)", () => {
		const result = sanitizeUrl("https://admin:password@example.com/path");
		expect(result).not.toContain("password");
		expect(result).not.toContain("admin");
		expect(result).toBe("https://example.com/path");
	});

	it("strips fragments", () => {
		const result = sanitizeUrl("https://example.com/page#access_token=abc");
		expect(result).toBe("https://example.com/page");
	});

	it("strips all query strings including tracking params", () => {
		const url = "https://example.com/page?utm_source=email&utm_medium=newsletter&page=2";
		const result = sanitizeUrl(url);
		expect(result).not.toContain("utm_source");
		expect(result).toBe("https://example.com/page");
	});

	it("strips LinkedIn tracking params", () => {
		const url = "https://www.linkedin.com/jobs/view/123/?trk=eml-digest&trackingId=abc";
		const result = sanitizeUrl(url);
		expect(result).toBe("https://www.linkedin.com/jobs/view/123/");
	});

	it("strips ad click IDs", () => {
		const url = "https://example.com/product?fbclid=IwAR0abc&gclid=Cj0abc&color=blue";
		const result = sanitizeUrl(url);
		expect(result).not.toContain("fbclid");
		expect(result).not.toContain("gclid");
		expect(result).toBe("https://example.com/product");
	});

	it("returns clean URLs unchanged", () => {
		const clean = "https://github.com/myorg/repo";
		const result = sanitizeUrl(clean);
		expect(result).toBe("https://github.com/myorg/repo");
	});

	it("preserves non-default ports (e.g. local model servers)", () => {
		const result = sanitizeUrl("http://localhost:11434/v1/chat/completions?model=qwen");
		expect(result).toBe("http://localhost:11434/v1/chat/completions");
	});

	it("handles invalid URLs", () => {
		expect(sanitizeUrl("not-a-url")).toBe("[INVALID_URL]");
	});

	it("strips all params from complex URLs", () => {
		const url = "https://auth.example.com/cb?code=abc&state=def&token=ghi&csrf=jkl&page=1";
		const result = sanitizeUrl(url);
		expect(result).toBe("https://auth.example.com/cb");
	});
});

// ── Path Redaction ──────────────────────────────────────

describe("redactPaths", () => {
	it("redacts /Users/name paths", () => {
		expect(redactPaths("/Users/testuser/project/src/main.ts"))
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

// ── Master Orchestrator ─────────────────────────────────

describe("sanitizeCollectedData", () => {

	const visits: BrowserVisit[] = [
		{ url: "https://mybank.com/account?token=abc", title: "Bank", time: new Date() },
		{ url: "https://github.com/repo", title: "Repo", time: new Date() },
	];

	it("always sanitizes (sanitization is always on)", () => {
		const result = sanitizeCollectedData(visits, [], [], []);
		// URLs should be stripped to protocol+host+path
		expect(result.visits[0].url).toBe("https://mybank.com/account");
		expect(result.visits[0].url).not.toContain("token=abc");
	});

	it("sanitizes all visits (no domain exclusion — handled by sensitivity filter)", () => {
		const result = sanitizeCollectedData(visits, [], [], []);
		expect(result.visits).toHaveLength(2); // both kept
		expect(result.visits[0].url).toBe("https://mybank.com/account");
		expect(result.visits[1].url).toContain("github.com");
	});

	it("redacts paths in Claude sessions", () => {
		const claude = [{
			prompt: "File at /Users/brian/secret.txt",
			time: new Date(),
			project: "test",
		}];
		const result = sanitizeCollectedData([], [], claude, []);
		expect(result.claudeSessions[0].prompt).not.toContain("/Users/brian");
		expect(result.claudeSessions[0].prompt).toContain("~");
	});

	it("scrubs emails in search queries", () => {
		const searches = [{ query: "settings for user@example.com", time: new Date(), engine: "google.com" }];
		const result = sanitizeCollectedData([], searches, [], []);
		expect(result.searches[0].query).toContain("[EMAIL]");
	});
});

// ── Claude XML Artifact Stripping ────────────────────────

describe("sanitizeClaudeSession – XML artifact stripping", () => {
	function makeSession(prompt: string) {
		return [{ prompt, time: new Date(), project: "test-project", isConversationOpener: true, conversationFile: "session.jsonl", conversationTurnCount: 1 }];
	}

	it("strips <image>…</image> blocks entirely", () => {
		const prompt = "Here is my screenshot <image>base64dataabc123==</image> please review it";
		const result = sanitizeCollectedData([], [], makeSession(prompt), []);
		expect(result.claudeSessions[0].prompt).not.toContain("<image>");
		expect(result.claudeSessions[0].prompt).not.toContain("base64dataabc123==");
		expect(result.claudeSessions[0].prompt).not.toContain("</image>");
		expect(result.claudeSessions[0].prompt).toContain("Here is my screenshot");
		expect(result.claudeSessions[0].prompt).toContain("please review it");
	});

	it("strips multiline <image> blocks", () => {
		const prompt = "Before\n<image>\n/Users/brian/screenshots/screenshot.png\nsome-base64-data==\n</image>\nAfter";
		const result = sanitizeCollectedData([], [], makeSession(prompt), []);
		expect(result.claudeSessions[0].prompt).not.toContain("<image>");
		expect(result.claudeSessions[0].prompt).not.toContain("</image>");
		expect(result.claudeSessions[0].prompt).not.toContain("some-base64-data");
		expect(result.claudeSessions[0].prompt).toContain("Before");
		expect(result.claudeSessions[0].prompt).toContain("After");
	});

	it("strips <turn_aborted> tags", () => {
		const prompt = "Start of session <turn_aborted> rest of session";
		const result = sanitizeCollectedData([], [], makeSession(prompt), []);
		expect(result.claudeSessions[0].prompt).not.toContain("<turn_aborted>");
		expect(result.claudeSessions[0].prompt).toContain("Start of session");
		expect(result.claudeSessions[0].prompt).toContain("rest of session");
	});

	it("strips self-closing <turn_aborted/> variant", () => {
		const prompt = "Before<turn_aborted/>After";
		const result = sanitizeCollectedData([], [], makeSession(prompt), []);
		expect(result.claudeSessions[0].prompt).not.toContain("<turn_aborted/>");
		expect(result.claudeSessions[0].prompt).toContain("Before");
		expect(result.claudeSessions[0].prompt).toContain("After");
	});

	it("does not strip unrelated XML-like tags (e.g. <strong>)", () => {
		const prompt = "This is <strong>important</strong> content";
		const result = sanitizeCollectedData([], [], makeSession(prompt), []);
		expect(result.claudeSessions[0].prompt).toContain("<strong>important</strong>");
	});
});
