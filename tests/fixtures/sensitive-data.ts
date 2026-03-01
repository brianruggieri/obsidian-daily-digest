/**
 * Named constants for every injected secret used by adversary personas.
 * Single source of truth — both personas and test assertions import from here.
 *
 * Every value is a realistic-looking credential that the sanitization pipeline
 * MUST scrub before it reaches any AI prompt.
 */

// ── API Tokens ──────────────────────────────────────────

/**
 * GitHub Personal Access Token (classic format: ghp_ + 36 alphanumeric).
 * Built via concatenation to avoid triggering GitHub push protection / secret scanning.
 */
export const GITHUB_PAT = "ghp_" + "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8";

/** Anthropic API key (sk-ant- prefix) */
export const ANTHROPIC_KEY = "sk-ant-" + "api03-FAKE1234abcd5678efgh9012ijkl3456mnop7890qrst";

/** AWS access key (AKIA prefix + 16 uppercase alphanumeric) */
export const AWS_ACCESS_KEY = "AKIA" + "IOSFODNN7EXAMPLE";

/** AWS secret key (40 chars, used in env var assignments). Built via concatenation to avoid push protection. */
export const AWS_SECRET_KEY = "wJalrXUtnFEMI/" + "K7MDENG/bPxRfiCYEXAMPLEKEY";

/** OpenAI API key (sk- prefix + 48 alphanumeric) */
export const OPENAI_KEY = "sk-" + "proj1234abcdef5678ghijklmnopqrstuvwxyz90ABCDEF12";

/** Stripe secret key (sk_test_ prefix) */
export const STRIPE_SECRET = "sk_test_" + "51abcdef2345ghij6789klmnopqrstuv";

/** Slack bot token (xoxb- prefix). Built via concatenation to avoid push protection. */
export const SLACK_BOT_TOKEN = "xoxb-" + "not-a-real-slack-token-abcdefghij";

/** npm token (npm_ + 36 alphanumeric) */
export const NPM_TOKEN = "npm_" + "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8";

/** SendGrid API key */
export const SENDGRID_KEY = "SG." + "abcdefghijklmnopqrstuv" + "." + "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcde";

// ── JWTs ────────────────────────────────────────────────

/** Realistic JWT with header.payload.signature */
export const JWT_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4iLCJpYXQiOjE1MTYyMzkwMjJ9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";

// ── URL Credentials ─────────────────────────────────────

/** Plaintext userinfo in a URL */
export const URL_USER = "admin";
export const URL_PASSWORD = "s3cretP@ssw0rd";

/** OAuth authorization code in query string */
export const OAUTH_CODE = "auth_4f6g7h8i9j0k_callback_secret";

/** Session token in query string */
export const SESSION_TOKEN = "sess_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6";

// ── PII ─────────────────────────────────────────────────

/** User's own email address */
export const USER_EMAIL = "brian.testuser@gmail.com";

/** Coworker's email */
export const COWORKER_EMAIL = "alice.colleague@megacorp.com";

/** Home directory path */
export const HOME_DIR = "/Users/briantestuser";

/** Internal network IP */
export const INTERNAL_IP = "192.168.1.42";

/** Social Security Number */
export const SSN = "123-45-6789";

/** Phone number */
export const PHONE_NUMBER = "555-867-5309";

/** Credit card number (fake Visa) */
export const CREDIT_CARD = "4111111111111111";

// ── Passwords ───────────────────────────────────────────

/** Plaintext password that might appear in a search query */
export const SEARCH_PASSWORD = "MyS3cretPassw0rd!";

/** Env var password assignment */
export const ENV_PASSWORD = "DB_PASSWORD=hunter2secret";

// ── Internal Artifacts ──────────────────────────────────

/** Internal project codename (not a real secret, but leaks org info) */
export const PROJECT_CODENAME = "project-moonshot-alpha";

/** Internal hostname */
export const INTERNAL_HOSTNAME = "jenkins.internal.megacorp.net";

/** Internal org name */
export const INTERNAL_ORG = "MegaCorp-Internal";

// ── SSH ─────────────────────────────────────────────────

/** SSH private key header (the real danger sign) */
export const SSH_PRIVATE_KEY_HEADER = "-----BEGIN RSA PRIVATE KEY-----";

// ── Database Connection Strings ─────────────────────────

/** Postgres connection string with embedded password */
export const DB_CONNECTION_STRING = "postgres://dbadmin:hunter2secret@db.megacorp.net:5432/production";

// ── Aggregated Exports ──────────────────────────────────

/**
 * All secret values that must NEVER appear in any prompt at any tier.
 * These are scrubbed by sanitize.ts (SECRET_PATTERNS, scrubEmails,
 * scrubIPs, redactPaths, sanitizeUrl).
 */
export function getAllSecrets(): string[] {
	return [
		GITHUB_PAT,
		ANTHROPIC_KEY,
		AWS_ACCESS_KEY,
		AWS_SECRET_KEY,
		OPENAI_KEY,
		STRIPE_SECRET,
		SLACK_BOT_TOKEN,
		NPM_TOKEN,
		SENDGRID_KEY,
		JWT_TOKEN,
		URL_PASSWORD,
		OAUTH_CODE,
		SESSION_TOKEN,
		USER_EMAIL,
		COWORKER_EMAIL,
		HOME_DIR,
		INTERNAL_IP,
		SSN,
		CREDIT_CARD,
		SSH_PRIVATE_KEY_HEADER,
		DB_CONNECTION_STRING,
	];
}

/**
 * Sensitive domain names used in adversary personas.
 * These must not appear in prompts at Tiers 3-4 (where only
 * abstractions and statistics are sent).
 *
 * Sourced from the sensitivity filter's built-in domain lists:
 * dating, health, finance, job_search categories.
 */
export const SENSITIVE_DOMAINS: string[] = [
	// Dating
	"tinder.com",
	"hinge.co",
	"bumble.com",
	// Health
	"webmd.com",
	"mayoclinic.org",
	"patient.info",
	// Finance
	"wellsfargo.com",
	"fidelity.com",
	"chase.com",
	// Job search
	"glassdoor.com",
];
