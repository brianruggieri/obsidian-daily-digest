/**
 * Core data generators for mock test data.
 * Produces typed arrays matching the plugin's interfaces.
 */

import {
	BrowserVisit,
	SearchQuery,
	ShellCommand,
	ClaudeSession,
} from "../../src/types";
import { TimeConfig, generateTimeSeries } from "./time-utils";

// ── Domain Specification ────────────────────────────────

export interface DomainSpec {
	domain: string;
	titlePatterns: string[];
	category: string;
	weight: number;
}

// ── Pre-built Domain Sets ───────────────────────────────

export const DOMAIN_SETS: Record<string, DomainSpec[]> = {
	webdev: [
		{ domain: "github.com", titlePatterns: ["Fix auth middleware in express-app", "Pull Request #42: Add OAuth flow", "Issues · myorg/webapp"], category: "dev", weight: 5 },
		{ domain: "stackoverflow.com", titlePatterns: ["useEffect cleanup function not called", "React 18 Suspense boundary error handling", "TypeScript generic constraints"], category: "dev", weight: 4 },
		{ domain: "developer.mozilla.org", titlePatterns: ["Fetch API - Web APIs | MDN", "CSS Grid Layout - MDN", "Promise.allSettled() - MDN"], category: "dev", weight: 3 },
		{ domain: "docs.anthropic.com", titlePatterns: ["Messages API | Anthropic", "Tool use (function calling) | Anthropic"], category: "dev", weight: 2 },
		{ domain: "npmjs.com", titlePatterns: ["zod - npm", "vitest - npm", "esbuild - npm"], category: "dev", weight: 2 },
		{ domain: "vercel.com", titlePatterns: ["Dashboard – Vercel", "Deployments – webapp – Vercel"], category: "dev", weight: 1 },
	],
	communication: [
		{ domain: "mail.google.com", titlePatterns: ["Inbox (3)", "RE: Sprint Planning Notes", "RE: Design Review Tomorrow"], category: "work", weight: 3 },
		{ domain: "slack.com", titlePatterns: ["#engineering - Acme Workspace - Slack", "#general - Acme Workspace - Slack", "DM with Sarah"], category: "work", weight: 4 },
		{ domain: "calendar.google.com", titlePatterns: ["Google Calendar - June 2025", "1:1 with Manager"], category: "work", weight: 1 },
		{ domain: "zoom.us", titlePatterns: ["Zoom Meeting", "Sprint Retrospective - Zoom"], category: "work", weight: 1 },
	],
	research: [
		{ domain: "arxiv.org", titlePatterns: ["Attention Is All You Need | arXiv:1706.03762", "Scaling Laws for Neural Language Models"], category: "research", weight: 3 },
		{ domain: "en.wikipedia.org", titlePatterns: ["Consensus (computer science) - Wikipedia", "Raft (algorithm) - Wikipedia", "Distributed hash table - Wikipedia"], category: "research", weight: 2 },
		{ domain: "medium.com", titlePatterns: ["Understanding CRDT: A Gentle Introduction | by Alex Chen", "Building Event-Driven Microservices"], category: "research", weight: 2 },
		{ domain: "scholar.google.com", titlePatterns: ["Google Scholar - distributed consensus", "Google Scholar - vector clocks"], category: "research", weight: 1 },
	],
	news: [
		{ domain: "news.ycombinator.com", titlePatterns: ["Hacker News", "Show HN: New SQLite extension for vector search"], category: "news", weight: 3 },
		{ domain: "arstechnica.com", titlePatterns: ["New AI model achieves breakthrough in code generation", "Apple announces M5 chip"], category: "news", weight: 2 },
		{ domain: "techcrunch.com", titlePatterns: ["Startup raises $50M for developer tools", "GitHub Copilot gets major upgrade"], category: "news", weight: 1 },
	],
	social: [
		{ domain: "reddit.com", titlePatterns: ["r/programming - Daily Discussion Thread", "r/typescript - Best practices for monorepo", "r/rust - Learning Rust Coming from TypeScript"], category: "social", weight: 2 },
		{ domain: "x.com", titlePatterns: ["Home / X", "@dhh on X: New Rails 8 features"], category: "social", weight: 2 },
		{ domain: "linkedin.com", titlePatterns: ["Feed | LinkedIn", "John Doe posted about AI"], category: "social", weight: 1 },
	],
	shopping: [
		{ domain: "amazon.com", titlePatterns: ["Amazon.com: Mechanical Keyboard", "Amazon.com Shopping Cart"], category: "shopping", weight: 2 },
		{ domain: "bestbuy.com", titlePatterns: ["4K Monitors - Best Buy"], category: "shopping", weight: 1 },
	],
	finance: [
		{ domain: "chase.com", titlePatterns: ["Chase Online Banking", "Account Summary | Chase"], category: "finance", weight: 1 },
	],
	ai_tools: [
		{ domain: "claude.ai", titlePatterns: ["Claude - New Conversation", "Claude - Debug auth middleware"], category: "ai_tools", weight: 3 },
		{ domain: "chat.openai.com", titlePatterns: ["ChatGPT", "ChatGPT - Python data analysis"], category: "ai_tools", weight: 1 },
	],
	media: [
		{ domain: "youtube.com", titlePatterns: ["Fireship: Rust in 100 Seconds", "ThePrimeagen: Vim Is Actually Good", "Tech Conference Keynote 2025"], category: "media", weight: 2 },
		{ domain: "open.spotify.com", titlePatterns: ["Spotify - Deep Focus Playlist", "Spotify - Lo-fi Beats"], category: "media", weight: 1 },
	],
	personal: [
		{ domain: "strava.com", titlePatterns: ["Morning Run - Strava", "Activity Feed | Strava"], category: "personal", weight: 1 },
		{ domain: "duolingo.com", titlePatterns: ["Duolingo - Japanese Lesson 42"], category: "personal", weight: 1 },
	],
	devops: [
		{ domain: "console.aws.amazon.com", titlePatterns: ["EC2 Instances | AWS Console", "CloudWatch Logs | AWS Console", "RDS Dashboard | AWS Console"], category: "dev", weight: 4 },
		{ domain: "grafana.com", titlePatterns: ["Grafana Dashboard - Production Metrics", "Grafana - API Latency"], category: "dev", weight: 3 },
		{ domain: "cloudflare.com", titlePatterns: ["Cloudflare Dashboard", "DNS Records | Cloudflare"], category: "dev", weight: 2 },
	],
	work_tools: [
		{ domain: "notion.so", titlePatterns: ["Sprint Planning - Notion", "Engineering Handbook - Notion", "Meeting Notes - Notion"], category: "work", weight: 3 },
		{ domain: "linear.app", titlePatterns: ["Linear - ENG-142: Fix auth bug", "Linear - My Issues", "Linear - Cycle 12"], category: "work", weight: 3 },
		{ domain: "figma.com", titlePatterns: ["Figma - Dashboard Redesign", "Figma - Component Library"], category: "work", weight: 2 },
		{ domain: "docs.google.com", titlePatterns: ["RFC: Authentication Redesign - Google Docs", "Tech Spec: API Gateway"], category: "work", weight: 2 },
		{ domain: "confluence.atlassian.net", titlePatterns: ["Architecture Decision Records - Confluence", "Runbook: Database Migration"], category: "work", weight: 1 },
	],
};

// ── Shell Command Templates ─────────────────────────────

export const SHELL_WORKFLOWS: Record<string, string[]> = {
	webdev: [
		"git status",
		"git pull origin main",
		"npm install",
		"npm run dev",
		"npm run test -- --watch",
		"git checkout -b feature/oauth-flow",
		"git add src/auth.ts src/middleware.ts",
		'git commit -m "Add OAuth PKCE flow"',
		"git push origin feature/oauth-flow",
		"npm run build",
		"npm run lint",
		"npx vitest run",
		"curl -s http://localhost:3000/api/health | jq .",
		"docker compose up -d",
		"docker logs webapp-api-1 --tail 50",
	],
	backend: [
		"git status",
		"git diff HEAD~3",
		"python -m pytest tests/ -v",
		"python manage.py migrate",
		"python manage.py runserver",
		"pip install -r requirements.txt",
		"docker build -t api:latest .",
		"docker compose up -d postgres redis",
		'curl -X POST http://localhost:8000/api/auth/token -d \'{"username":"test"}\'',
		"redis-cli ping",
		"psql -U postgres -d myapp -c 'SELECT count(*) FROM users'",
	],
	devops: [
		"kubectl get pods -n production",
		"kubectl logs deploy/api-server -n production --tail=100",
		"kubectl describe pod api-server-7d4f8b9c5-x2j4k -n production",
		"terraform plan -var-file=prod.tfvars",
		"terraform apply -auto-approve",
		"aws ec2 describe-instances --filters 'Name=tag:Environment,Values=prod'",
		"ssh bastion.example.com",
		"docker pull nginx:latest",
		"helm upgrade --install monitoring prometheus-community/kube-prometheus-stack",
		"kubectl rollout status deploy/api-server -n production",
		"aws cloudwatch get-metric-statistics --namespace AWS/ECS --metric-name CPUUtilization",
	],
	data_science: [
		"jupyter notebook",
		"python train_model.py --epochs 50 --lr 0.001",
		"python evaluate.py --model checkpoints/best.pt",
		"pip install torch transformers datasets",
		"dvc pull",
		"dvc push",
		"git add dvc.lock",
		'git commit -m "Update model training pipeline"',
		"wandb login",
		"python scripts/preprocess_data.py --input data/raw --output data/processed",
	],
	writing: [
		"git status",
		"git add content/posts/new-article.md",
		'git commit -m "Draft: distributed systems overview"',
		"hugo server -D",
		"pandoc draft.md -o output.pdf",
		"wc -w content/posts/*.md",
		"grep -r 'TODO' content/",
	],
};

// ── Claude Prompt Templates ─────────────────────────────

export const CLAUDE_PROMPT_TEMPLATES: Record<string, string[]> = {
	coding: [
		"Fix the null pointer exception in the auth middleware. Here's the error: TypeError: Cannot read properties of undefined (reading 'token')",
		"Implement the OAuth PKCE flow for our React app. We need to support Google and GitHub providers.",
		"Write a unit test for the sanitizeUrl function that covers edge cases with fragment tokens",
		"Refactor this Express route handler to use async/await instead of callbacks",
		"Add TypeScript types for the API response. The shape is: { data: User[], pagination: { page, total } }",
	],
	research: [
		"Explain the difference between Raft and Paxos consensus algorithms. Which is better for a 5-node cluster?",
		"What are CRDTs and how do they compare to OT for collaborative editing?",
		"Outline a blog post about distributed consensus. Target audience: senior engineers who haven't worked with distributed systems.",
		"Summarize the key findings from the Attention Is All You Need paper",
	],
	devops: [
		"Write a Terraform module for an RDS PostgreSQL instance with read replicas and automated backups",
		"Debug this Kubernetes pod crash loop. Here's the describe output: CrashLoopBackOff, OOMKilled",
		"Create a Grafana dashboard JSON for monitoring API latency p50, p95, p99",
		"Write a GitHub Actions workflow for CI/CD: lint, test, build, deploy to staging on PR, deploy to prod on merge to main",
	],
	general: [
		"Help me plan my week. I need to finish the auth feature, write docs, and prepare for Thursday's presentation.",
		"Review this PR description and suggest improvements",
		"What's the best way to structure a monorepo for a TypeScript project with 3 packages?",
	],
};

// ── Search Query Templates ──────────────────────────────

export const SEARCH_TEMPLATES: Record<string, string[]> = {
	webdev: [
		"react useEffect cleanup function not called",
		"typescript generic constraints best practices",
		"oauth 2.0 PKCE flow react implementation",
		"express middleware error handling async",
		"vitest mock module import",
		"esbuild external dependencies obsidian plugin",
		"zod vs yup validation library comparison",
		"css grid responsive layout tutorial",
	],
	devops: [
		"kubernetes pod crashloopbackoff oomkilled fix",
		"terraform rds multi-az configuration",
		"grafana dashboard prometheus query rate",
		"aws ecs service discovery setup",
		"helm chart values override production",
		"docker compose health check configuration",
	],
	research: [
		"raft consensus algorithm explained",
		"paxos vs raft difference",
		"crdt collaborative editing real-time",
		"distributed systems cap theorem",
		"vector clock logical timestamp",
		"event sourcing vs cqrs pattern",
	],
	general: [
		"best mechanical keyboard for programming 2025",
		"standing desk ergonomic setup",
		"coffee shops near downtown with wifi",
	],
};

// ── Generator Functions ─────────────────────────────────

function pickRandom<T>(arr: T[]): T {
	return arr[Math.floor(Math.random() * arr.length)];
}

function pickWeighted(specs: DomainSpec[]): DomainSpec {
	const totalWeight = specs.reduce((s, d) => s + d.weight, 0);
	let r = Math.random() * totalWeight;
	for (const spec of specs) {
		r -= spec.weight;
		if (r <= 0) return spec;
	}
	return specs[specs.length - 1];
}

export function generateBrowserVisits(options: {
	count: number;
	domains: DomainSpec[];
	timestamps: Date[];
}): BrowserVisit[] {
	const visits: BrowserVisit[] = [];
	for (let i = 0; i < options.count; i++) {
		const spec = pickWeighted(options.domains);
		const title = pickRandom(spec.titlePatterns);
		const time = i < options.timestamps.length ? options.timestamps[i] : options.timestamps[options.timestamps.length - 1];
		const path = `/${Math.random().toString(36).slice(2, 8)}`;
		visits.push({
			url: `https://${spec.domain}${path}`,
			title,
			time,
			visitCount: Math.floor(Math.random() * 5) + 1,
			domain: spec.domain,
		});
	}
	return visits;
}

export function generateSearchQueries(options: {
	count: number;
	queries: string[];
	engines?: string[];
	timestamps: Date[];
}): SearchQuery[] {
	const engines = options.engines || ["google.com"];
	const searches: SearchQuery[] = [];
	for (let i = 0; i < Math.min(options.count, options.queries.length); i++) {
		searches.push({
			query: options.queries[i],
			time: i < options.timestamps.length ? options.timestamps[i] : options.timestamps[options.timestamps.length - 1],
			engine: pickRandom(engines),
		});
	}
	return searches;
}

export function generateShellCommands(options: {
	count: number;
	workflow: string;
	timestamps: Date[];
}): ShellCommand[] {
	const commands = SHELL_WORKFLOWS[options.workflow] || SHELL_WORKFLOWS.webdev;
	const shell: ShellCommand[] = [];
	for (let i = 0; i < options.count; i++) {
		const cmd = commands[i % commands.length];
		const time = i < options.timestamps.length ? options.timestamps[i] : options.timestamps[options.timestamps.length - 1];
		shell.push({ cmd, time });
	}
	return shell;
}

export function generateClaudeSessions(options: {
	count: number;
	promptCategory: string;
	projectName: string;
	timestamps: Date[];
}): ClaudeSession[] {
	const templates = CLAUDE_PROMPT_TEMPLATES[options.promptCategory] || CLAUDE_PROMPT_TEMPLATES.general;
	const sessions: ClaudeSession[] = [];
	for (let i = 0; i < options.count; i++) {
		const prompt = templates[i % templates.length];
		const time = i < options.timestamps.length ? options.timestamps[i] : options.timestamps[options.timestamps.length - 1];
		sessions.push({
			prompt,
			time,
			project: options.projectName,
		});
	}
	return sessions;
}
