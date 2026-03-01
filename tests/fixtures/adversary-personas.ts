/**
 * Adversary personas — 3 privacy-hostile test profiles that inject realistic
 * secrets, PII, and sensitive domain visits into all data sources.
 *
 * Every piece of injected data references a named constant from
 * `sensitive-data.ts` so test assertions can deterministically verify
 * that each hazard was scrubbed.
 *
 * Fully deterministic: fixed dates, no Math.random().
 */

import {
	BrowserVisit,
	SearchQuery,
	ClaudeSession,
	GitCommit,
} from "../../src/types";
import { PersonaOutput } from "./personas";
import {
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
	URL_USER,
	URL_PASSWORD,
	OAUTH_CODE,
	SESSION_TOKEN,
	USER_EMAIL,
	COWORKER_EMAIL,
	HOME_DIR,
	INTERNAL_IP,
	CREDIT_CARD,
	SSN,
	ENV_PASSWORD,
	PROJECT_CODENAME,
	INTERNAL_HOSTNAME,
	INTERNAL_ORG,
	SSH_PRIVATE_KEY_HEADER,
	DB_CONNECTION_STRING,
} from "./sensitive-data";

// ── Helpers ─────────────────────────────────────────────

function ts(date: Date, hour: number, minute: number): Date {
	const d = new Date(date);
	d.setHours(hour, minute, 0, 0);
	return d;
}

function visit(url: string, title: string, time: Date): BrowserVisit {
	let domain = "";
	try { domain = new URL(url).hostname.replace(/^www\./, ""); } catch { /* */ }
	return { url, title, time, domain, visitCount: 1 };
}

function search(query: string, time: Date, engine = "google.com"): SearchQuery {
	return { query, time, engine };
}

function claude(prompt: string, time: Date, project: string, file: string, turnCount = 1, isOpener = true): ClaudeSession {
	return { prompt, time, project, isConversationOpener: isOpener, conversationFile: file, conversationTurnCount: turnCount };
}

function commit(hash: string, message: string, time: Date, repo: string): GitCommit {
	return { hash, message, time, repo, filesChanged: 3, insertions: 20, deletions: 5 };
}

// ── Persona A: Careless Developer ───────────────────────
// A developer who copies secrets into everything — URLs, searches, prompts.

export function carelessDeveloper(date?: Date): PersonaOutput {
	const d = date ?? new Date("2025-06-15T00:00:00");

	const visits: BrowserVisit[] = [
		// GitHub PAT leaked in query string
		visit(`https://github.com/myorg/repo?access_token=${GITHUB_PAT}&ref=main`, "Pull Request #42 - myorg/repo", ts(d, 9, 0)),
		// OAuth callback with auth code
		visit(`https://app.example.com/callback?code=${OAUTH_CODE}&state=abc123`, "OAuth Callback", ts(d, 9, 15)),
		// Userinfo credentials in URL
		visit(`https://${URL_USER}:${URL_PASSWORD}@${INTERNAL_HOSTNAME}/admin`, "Admin Dashboard", ts(d, 9, 30)),
		// JWT in URL fragment
		visit(`https://dashboard.example.com/auth#access_token=${JWT_TOKEN}`, "Dashboard Auth", ts(d, 9, 45)),
		// Stripe key in query param
		visit(`https://dashboard.stripe.com/test/apikeys?key=${STRIPE_SECRET}`, "Stripe API Keys", ts(d, 10, 0)),
		// Session token in query param
		visit(`https://internal-tool.example.com/report?session=${SESSION_TOKEN}`, "Internal Report", ts(d, 10, 15)),
		// SendGrid key accidentally in URL
		visit(`https://app.sendgrid.com/settings?apikey=${SENDGRID_KEY}`, "SendGrid Settings", ts(d, 10, 30)),
		// Normal dev visits (no secrets)
		visit("https://github.com/anthropics/claude-code", "claude-code - GitHub", ts(d, 10, 45)),
		visit("https://docs.github.com/en/rest/pulls", "Pull Requests - GitHub Docs", ts(d, 11, 0)),
		visit("https://stackoverflow.com/questions/12345/node-typescript-error", "TypeScript error - Stack Overflow", ts(d, 11, 30)),
		visit("https://developer.mozilla.org/en-US/docs/Web/API/fetch", "Fetch API - MDN", ts(d, 12, 0)),
		visit("https://www.npmjs.com/package/vitest", "vitest - npm", ts(d, 14, 0)),
	];

	const searches: SearchQuery[] = [
		// Anthropic key pasted into search bar
		search(`how to use ${ANTHROPIC_KEY} in node`, ts(d, 9, 5)),
		// Email in search
		search(`${USER_EMAIL} account recovery`, ts(d, 10, 20)),
		// AWS key in search
		search(`fix ${AWS_ACCESS_KEY} permission denied s3`, ts(d, 11, 15)),
		// Clean search
		search("vitest mock patterns typescript", ts(d, 14, 10)),
	];

	const claudeSessions: ClaudeSession[] = [
		// AWS env var dump
		claude(
			`Here are my env vars:\nexport AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY}\nexport AWS_SECRET_ACCESS_KEY=${AWS_SECRET_KEY}\nWhy is my S3 upload failing?`,
			ts(d, 9, 10), "aws-project", "aws-debug.jsonl", 4
		),
		// SSH private key fragment
		claude(
			`I have this SSH key:\n${SSH_PRIVATE_KEY_HEADER}\nMIIEpAIBAAKCAQEA...\nHow do I add it to GitHub?`,
			ts(d, 10, 5), "devops", "ssh-setup.jsonl", 2
		),
		// DB connection string with password
		claude(
			`My database connection string is ${DB_CONNECTION_STRING}\nI'm getting connection timeout errors. The ${ENV_PASSWORD} env var is set.`,
			ts(d, 11, 0), "backend", "db-debug.jsonl", 3
		),
		// Internal IP + coworker email
		claude(
			`I need to SSH to ${INTERNAL_IP} — ${COWORKER_EMAIL} said the service is running on port 8080. The file is at ${HOME_DIR}/projects/secret-app/config.yaml`,
			ts(d, 13, 0), "infra", "infra-setup.jsonl", 2
		),
		// Clean prompt
		claude(
			"How do I write a vitest mock for an async function that returns a stream?",
			ts(d, 14, 30), "obsidian-daily-digest", "testing.jsonl", 5
		),
	];

	const gitCommits: GitCommit[] = [
		commit("a".repeat(40), `fix: deploy to ${INTERNAL_HOSTNAME} with new config`, ts(d, 15, 0), "infra-tools"),
		commit("b".repeat(40), `chore: update monitoring for ${INTERNAL_IP} health checks`, ts(d, 15, 30), "infra-tools"),
		commit("c".repeat(40), `feat(${PROJECT_CODENAME}): add webhook handler`, ts(d, 16, 0), "secret-project"),
	];

	return {
		name: "Careless Developer",
		description: "Developer who copies secrets into URLs, searches, and prompts",
		visits,
		searches,
		claude: claudeSessions,
		codex: [],
		git: gitCommits,
		expectedThemes: ["development", "infrastructure"],
		expectedActivityTypes: ["implementation", "debugging", "infrastructure"],
		expectedFocusRange: [0.3, 0.8],
		narrative: "A careless developer leaking API keys, credentials, and internal hostnames across all data sources.",
	};
}

// ── Persona B: Sensitive Life Day ───────────────────────
// A user visiting health, finance, dating, and job search sites.
// Tests the sensitivity filter rather than secret scrubbing.

export function sensitiveLifeDay(date?: Date): PersonaOutput {
	const d = date ?? new Date("2025-06-15T00:00:00");

	const visits: BrowserVisit[] = [
		// Dating apps
		visit("https://tinder.com/app/recs", "Tinder | Match. Chat. Date.", ts(d, 8, 0)),
		visit("https://hinge.co/app/discover", "Hinge - Designed to be deleted", ts(d, 8, 15)),
		visit("https://bumble.com/app", "Bumble - Make the first move", ts(d, 8, 30)),
		// Financial portals
		visit("https://www.wellsfargo.com/online-banking/", "Wells Fargo Online Banking", ts(d, 9, 0)),
		visit("https://www.fidelity.com/investments", "Fidelity Investments", ts(d, 9, 15)),
		visit("https://www.chase.com/personal/checking", "Chase Checking Account", ts(d, 9, 30)),
		// Health sites
		visit("https://www.webmd.com/cancer/default.htm", "Cancer Overview - WebMD", ts(d, 10, 0)),
		visit("https://www.mayoclinic.org/diseases-conditions/depression", "Depression - Mayo Clinic", ts(d, 10, 15)),
		visit("https://patient.info/mental-health/anxiety", "Anxiety - Patient.info", ts(d, 10, 30)),
		// Job search
		visit("https://www.linkedin.com/jobs/search/?keywords=senior+engineer", "Job Search - LinkedIn", ts(d, 11, 0)),
		visit("https://www.glassdoor.com/Salary/google-engineer-salary", "Google Engineer Salary - Glassdoor", ts(d, 11, 15)),
		// Normal dev visits
		visit("https://github.com/features/actions", "GitHub Actions", ts(d, 13, 0)),
		visit("https://docs.github.com/en/actions/learn-github-actions", "Learn GitHub Actions", ts(d, 13, 30)),
		visit("https://developer.mozilla.org/en-US/docs/Web/JavaScript", "JavaScript - MDN", ts(d, 14, 0)),
		visit("https://www.typescriptlang.org/docs/handbook", "TypeScript Handbook", ts(d, 14, 30)),
	];

	const searches: SearchQuery[] = [
		// Medical terms
		search("symptoms of stage 2 cancer treatment options", ts(d, 10, 5)),
		// Salary queries
		search("senior software engineer salary san francisco 2025", ts(d, 11, 5)),
		// Dating app comparisons
		search("tinder vs hinge vs bumble best dating app 2025", ts(d, 8, 10)),
		// Job negotiation
		search("how to negotiate salary offer google senior engineer", ts(d, 11, 20)),
		// Mental health
		search("anxiety medication side effects ssri vs snri", ts(d, 10, 35)),
		// Clean tech search
		search("github actions reusable workflow typescript", ts(d, 13, 15)),
	];

	const claudeSessions: ClaudeSession[] = [
		// Cover letter prompt with email address
		claude(
			`Write a cover letter for a senior engineer position at Google. My email is ${USER_EMAIL} and I have 8 years of experience in TypeScript and distributed systems.`,
			ts(d, 11, 30), "job-search", "cover-letter.jsonl", 3
		),
		// Clean prompt
		claude(
			"How do I set up GitHub Actions to run TypeScript tests on push?",
			ts(d, 13, 45), "obsidian-daily-digest", "actions.jsonl", 2
		),
	];

	const gitCommits: GitCommit[] = [
		commit("d".repeat(40), "feat: add reusable workflow for CI", ts(d, 14, 45), "obsidian-daily-digest"),
		commit("e".repeat(40), "test: add workflow dispatch tests", ts(d, 15, 0), "obsidian-daily-digest"),
	];

	return {
		name: "Sensitive Life Day",
		description: "User visiting health, finance, dating, and job search sites between dev work",
		visits,
		searches,
		claude: claudeSessions,
		codex: [],
		git: gitCommits,
		expectedThemes: ["development", "health", "career"],
		expectedActivityTypes: ["research", "browsing", "implementation"],
		expectedFocusRange: [0.2, 0.6],
		narrative: "A user blending sensitive personal browsing (health, dating, finance, job search) with normal development work.",
	};
}

// ── Persona C: Remote Worker Mixed ──────────────────────
// A remote worker blending personal and work contexts.
// Internal tool URLs, credit card in search, project codenames.

export function remoteWorkerMixed(date?: Date): PersonaOutput {
	const d = date ?? new Date("2025-06-15T00:00:00");

	const visits: BrowserVisit[] = [
		// Internal tool with session token in query
		visit(`https://${INTERNAL_HOSTNAME}/builds?session=${SESSION_TOKEN}`, "Jenkins Build Dashboard", ts(d, 9, 0)),
		// VPN domain
		visit("https://vpn.megacorp.net/portal", "MegaCorp VPN Portal", ts(d, 9, 5)),
		// HR portal
		visit("https://hr.megacorp.net/benefits/dental", "Benefits Portal - MegaCorp", ts(d, 9, 30)),
		// Financial site
		visit("https://www.chase.com/personal/savings", "Chase Savings - Personal Banking", ts(d, 10, 0)),
		// NPM token in URL (accidentally pasted)
		visit(`https://registry.npmjs.org/-/user/token/${NPM_TOKEN}`, "npm Registry Token", ts(d, 10, 15)),
		// OpenAI key in URL
		visit(`https://platform.openai.com/api-keys?reveal=${OPENAI_KEY}`, "API Keys - OpenAI", ts(d, 10, 30)),
		// Normal work visits
		visit("https://github.com/megacorp/api-gateway", "api-gateway - MegaCorp", ts(d, 11, 0)),
		visit("https://docs.aws.amazon.com/lambda/latest/dg/welcome.html", "AWS Lambda Docs", ts(d, 11, 30)),
		visit("https://stackoverflow.com/questions/67890/aws-lambda-timeout", "Lambda Timeout - Stack Overflow", ts(d, 12, 0)),
		visit("https://www.notion.so/megacorp/Sprint-Planning-abc123", "Sprint Planning - Notion", ts(d, 13, 0)),
		visit("https://slack.com/app/megacorp/channels/engineering", "Engineering Channel - Slack", ts(d, 13, 30)),
		visit("https://jira.megacorp.net/browse/API-1234", "API-1234: Fix gateway timeout - Jira", ts(d, 14, 0)),
	];

	const searches: SearchQuery[] = [
		// Accidental credit card number
		search(`${CREDIT_CARD} payment not going through`, ts(d, 10, 5)),
		// Internal codename reference
		search(`${PROJECT_CODENAME} deployment checklist`, ts(d, 11, 10)),
		// Salary negotiation with company name
		search(`${INTERNAL_ORG} senior engineer salary glassdoor`, ts(d, 12, 30)),
		// SSN accidentally pasted into search
		search(`verify SSN ${SSN} for W-2 form`, ts(d, 9, 45)),
		// Clean searches
		search("aws lambda cold start optimization 2025", ts(d, 11, 45)),
		search("typescript strict mode best practices", ts(d, 14, 15)),
	];

	const claudeSessions: ClaudeSession[] = [
		// Coworker name + codename + internal IP
		claude(
			`${COWORKER_EMAIL} said the ${PROJECT_CODENAME} service at ${INTERNAL_IP}:8080 is returning 500s. Here's the error log from ${HOME_DIR}/logs/error.log:\nConnection refused to postgres at ${INTERNAL_IP}:5432`,
			ts(d, 11, 0), "megacorp-api", "debug-session.jsonl", 6
		),
		// Slack bot token
		claude(
			`I need to configure our Slack integration. The bot token is ${SLACK_BOT_TOKEN}. How do I use the Slack API to post to #deployments?`,
			ts(d, 13, 15), "megacorp-api", "slack-integration.jsonl", 3
		),
		// Clean prompts
		claude(
			"What's the best way to implement circuit breaker pattern in TypeScript for AWS Lambda?",
			ts(d, 14, 30), "megacorp-api", "architecture.jsonl", 4
		),
		claude(
			"Review this TypeScript function for error handling best practices",
			ts(d, 15, 0), "megacorp-api", "review.jsonl", 2
		),
	];

	const gitCommits: GitCommit[] = [
		commit("f".repeat(40), `chore: deploy ${INTERNAL_ORG}/api-gateway to staging`, ts(d, 15, 30), "api-gateway"),
		commit("0".repeat(38) + "ab", `fix: remove ${NPM_TOKEN} from .env.example`, ts(d, 15, 45), "api-gateway"),
		commit("1".repeat(38) + "cd", `feat: add health check for ${INTERNAL_IP}:8080`, ts(d, 16, 0), "api-gateway"),
	];

	return {
		name: "Remote Worker Mixed",
		description: "Remote worker blending personal and work contexts with internal tool leaks",
		visits,
		searches,
		claude: claudeSessions,
		codex: [],
		git: gitCommits,
		expectedThemes: ["development", "infrastructure", "devops"],
		expectedActivityTypes: ["implementation", "debugging", "infrastructure"],
		expectedFocusRange: [0.3, 0.7],
		narrative: "A remote worker whose data contains internal hostnames, session tokens, credit card numbers, and codenames across all sources.",
	};
}

/** All adversary personas for iteration in tests. */
export const ADVERSARY_PERSONAS = [
	carelessDeveloper,
	sensitiveLifeDay,
	remoteWorkerMixed,
] as const;
