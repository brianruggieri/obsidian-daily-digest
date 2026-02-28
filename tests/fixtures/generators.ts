/**
 * Core data generators for mock test data.
 * Produces typed arrays matching the plugin's interfaces.
 */

import {
	BrowserVisit,
	SearchQuery,
	ClaudeSession,
	GitCommit,
} from "../../src/types";

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
		{ domain: "github.com", titlePatterns: ["Fix auth middleware in express-app", "Pull Request #42: Add OAuth flow", "Issues · myorg/webapp", "Compare · main...feature/auth-refactor", "Actions · myorg/webapp CI"], category: "dev", weight: 5 },
		{ domain: "stackoverflow.com", titlePatterns: ["useEffect cleanup function not called", "React 18 Suspense boundary error handling", "TypeScript generic constraints", "Express middleware error: next() called twice", "Vitest: how to mock ESM modules?"], category: "dev", weight: 4 },
		{ domain: "developer.mozilla.org", titlePatterns: ["Fetch API - Web APIs | MDN", "CSS Grid Layout - MDN", "Promise.allSettled() - MDN", "SubtleCrypto.digest() - MDN", "HTTP 401 Unauthorized - MDN"], category: "dev", weight: 3 },
		{ domain: "docs.anthropic.com", titlePatterns: ["Messages API | Anthropic", "Tool use (function calling) | Anthropic", "Streaming | Anthropic"], category: "dev", weight: 2 },
		{ domain: "npmjs.com", titlePatterns: ["zod - npm", "vitest - npm", "esbuild - npm", "@tanstack/react-query - npm", "express-rate-limit - npm"], category: "dev", weight: 2 },
		{ domain: "vercel.com", titlePatterns: ["Dashboard – Vercel", "Deployments – webapp – Vercel", "Edge Config: Rate Limiting – Vercel Docs"], category: "dev", weight: 1 },
		{ domain: "typescriptlang.org", titlePatterns: ["TypeScript: Documentation - Narrowing", "TypeScript: Playground", "TypeScript 5.5 Release Notes"], category: "dev", weight: 2 },
	],
	communication: [
		{ domain: "mail.google.com", titlePatterns: ["Inbox (3)", "RE: Sprint Planning Notes", "RE: Design Review Tomorrow", "Inbox (7) - Unread", "RE: Q3 Roadmap Feedback"], category: "work", weight: 3 },
		{ domain: "slack.com", titlePatterns: ["#engineering - Acme Workspace - Slack", "#general - Acme Workspace - Slack", "DM with Sarah", "#incidents - Acme Workspace - Slack", "Thread: API latency spike"], category: "work", weight: 4 },
		{ domain: "calendar.google.com", titlePatterns: ["Google Calendar - June 2025", "1:1 with Manager", "Sprint Planning", "Architecture Review"], category: "work", weight: 2 },
		{ domain: "zoom.us", titlePatterns: ["Zoom Meeting", "Sprint Retrospective - Zoom", "Team Standup - Zoom"], category: "work", weight: 1 },
		{ domain: "meet.google.com", titlePatterns: ["1:1 with Tech Lead", "Cross-team Sync", "Sprint Planning - Q3"], category: "work", weight: 2 },
	],
	research: [
		{ domain: "arxiv.org", titlePatterns: ["Attention Is All You Need | arXiv:1706.03762", "Scaling Laws for Neural Language Models", "Chain-of-Thought Prompting Elicits Reasoning", "Constitutional AI: Harmlessness from AI Feedback"], category: "research", weight: 3 },
		{ domain: "en.wikipedia.org", titlePatterns: ["Consensus (computer science) - Wikipedia", "Raft (algorithm) - Wikipedia", "Distributed hash table - Wikipedia", "MapReduce - Wikipedia", "B-tree - Wikipedia"], category: "research", weight: 2 },
		{ domain: "medium.com", titlePatterns: ["Understanding CRDT: A Gentle Introduction | by Alex Chen", "Building Event-Driven Microservices", "The Complete Guide to OAuth 2.0 and PKCE for SPAs", "Token Storage in React: Cookies vs Memory vs LocalStorage"], category: "research", weight: 2 },
		{ domain: "scholar.google.com", titlePatterns: ["Google Scholar - distributed consensus", "Google Scholar - vector clocks", "Google Scholar - transformer architectures", "Google Scholar - prompt engineering techniques"], category: "research", weight: 1 },
	],
	news: [
		{ domain: "news.ycombinator.com", titlePatterns: ["Hacker News", "Show HN: New SQLite extension for vector search", "Ask HN: Best practices for monorepo CI?", "Show HN: Open-source OAuth 2.1 library"], category: "news", weight: 3 },
		{ domain: "arstechnica.com", titlePatterns: ["New AI model achieves breakthrough in code generation", "Apple announces M5 chip", "The state of web auth in 2025"], category: "news", weight: 2 },
		{ domain: "techcrunch.com", titlePatterns: ["Startup raises $50M for developer tools", "GitHub Copilot gets major upgrade", "GitHub launches native OIDC support"], category: "news", weight: 1 },
	],
	social: [
		{ domain: "reddit.com", titlePatterns: ["r/programming - Daily Discussion Thread", "r/typescript - Best practices for monorepo", "r/rust - Learning Rust Coming from TypeScript", "r/reactjs - Auth token refresh best practices 2025", "r/webdev - What's your testing strategy?"], category: "social", weight: 2 },
		{ domain: "x.com", titlePatterns: ["Home / X", "@dhh on X: New Rails 8 features", "@dan_abramov on X: React Server Components update"], category: "social", weight: 2 },
		{ domain: "linkedin.com", titlePatterns: ["Feed | LinkedIn", "John Doe posted about AI", "New connections | LinkedIn"], category: "social", weight: 1 },
		{ domain: "discord.com", titlePatterns: ["#general - Study Group - Discord", "#help - TypeScript Community - Discord"], category: "social", weight: 1 },
	],
	shopping: [
		{ domain: "amazon.com", titlePatterns: ["Amazon.com: Mechanical Keyboard", "Amazon.com Shopping Cart", "Amazon.com: Standing Desk", "Amazon.com: USB-C Hub"], category: "shopping", weight: 2 },
		{ domain: "bestbuy.com", titlePatterns: ["4K Monitors - Best Buy", "Webcams - Best Buy"], category: "shopping", weight: 1 },
	],
	finance: [
		{ domain: "chase.com", titlePatterns: ["Chase Online Banking", "Account Summary | Chase"], category: "finance", weight: 1 },
	],
	ai_tools: [
		{ domain: "claude.ai", titlePatterns: ["Claude - New Conversation", "Claude - Debug auth middleware", "Claude - Architecture discussion", "Claude - Code review session"], category: "ai_tools", weight: 3 },
		{ domain: "chat.openai.com", titlePatterns: ["ChatGPT", "ChatGPT - Python data analysis", "ChatGPT - Explain this error"], category: "ai_tools", weight: 1 },
	],
	media: [
		{ domain: "youtube.com", titlePatterns: ["Fireship: Rust in 100 Seconds", "ThePrimeagen: Vim Is Actually Good", "Tech Conference Keynote 2025", "KubeCon 2025: eBPF Observability", "3Blue1Brown: Neural Networks"], category: "media", weight: 2 },
		{ domain: "open.spotify.com", titlePatterns: ["Spotify - Deep Focus Playlist", "Spotify - Lo-fi Beats", "Spotify - Classical Concentration"], category: "media", weight: 1 },
	],
	personal: [
		{ domain: "strava.com", titlePatterns: ["Morning Run - Strava", "Activity Feed | Strava"], category: "personal", weight: 1 },
	],
	devops: [
		{ domain: "console.aws.amazon.com", titlePatterns: ["EC2 Instances | AWS Console", "CloudWatch Logs | AWS Console", "RDS Dashboard | AWS Console", "ECS Clusters | AWS Console", "IAM Roles | AWS Console"], category: "dev", weight: 4 },
		{ domain: "grafana.com", titlePatterns: ["Grafana Dashboard - Production Metrics", "Grafana - API Latency", "Grafana - Error Rate Dashboard", "Grafana Tempo: Distributed Tracing"], category: "dev", weight: 3 },
		{ domain: "cloudflare.com", titlePatterns: ["Cloudflare Dashboard", "DNS Records | Cloudflare", "WAF Rules | Cloudflare"], category: "dev", weight: 2 },
	],
	work_tools: [
		{ domain: "notion.so", titlePatterns: ["Sprint Planning - Notion", "Engineering Handbook - Notion", "Meeting Notes - Notion", "Q3 Roadmap - Notion", "Architecture Decision Records - Notion"], category: "work", weight: 3 },
		{ domain: "linear.app", titlePatterns: ["Linear - ENG-142: Fix auth bug", "Linear - My Issues", "Linear - Cycle 12", "Linear - Backlog Grooming", "Linear - Sprint Board"], category: "work", weight: 3 },
		{ domain: "figma.com", titlePatterns: ["Figma - Dashboard Redesign", "Figma - Component Library", "Figma - Mobile App Wireframes", "Figma - Design System v3"], category: "work", weight: 2 },
		{ domain: "docs.google.com", titlePatterns: ["RFC: Authentication Redesign - Google Docs", "Tech Spec: API Gateway", "Meeting Notes: Architecture Review", "Quarterly OKRs - Google Docs"], category: "work", weight: 2 },
		{ domain: "confluence.atlassian.net", titlePatterns: ["Architecture Decision Records - Confluence", "Runbook: Database Migration", "Onboarding Guide - Confluence"], category: "work", weight: 1 },
	],

	// ── New Domain Sets for Full-Day Personas ──────────────

	academic: [
		{ domain: "arxiv.org", titlePatterns: ["Attention Is All You Need | arXiv", "BERT: Pre-training of Deep Bidirectional Transformers", "Language Models are Few-Shot Learners (GPT-3)", "Retrieval-Augmented Generation for Knowledge-Intensive Tasks", "Constitutional AI: Harmlessness from AI Feedback", "Scaling Data-Constrained Language Models"], category: "research", weight: 5 },
		{ domain: "scholar.google.com", titlePatterns: ["Google Scholar - transformer attention mechanism", "Google Scholar - retrieval augmented generation", "Google Scholar - RLHF alignment", "Google Scholar - prompt engineering survey", "Google Scholar - knowledge distillation"], category: "research", weight: 4 },
		{ domain: "semanticscholar.org", titlePatterns: ["Semantic Scholar - Attention mechanism survey", "Semantic Scholar - BERT fine-tuning strategies", "Semantic Scholar - In-context learning analysis", "Semantic Scholar - Chain of thought reasoning"], category: "research", weight: 3 },
		{ domain: "jstor.org", titlePatterns: ["JSTOR: Information Retrieval Systems", "JSTOR: Computational Linguistics Quarterly", "JSTOR: Natural Language Processing Survey"], category: "research", weight: 2 },
		{ domain: "overleaf.com", titlePatterns: ["Overleaf - Literature Review Draft", "Overleaf - Thesis Chapter 3", "Overleaf - Conference Paper Submission"], category: "research", weight: 3 },
		{ domain: "zotero.org", titlePatterns: ["Zotero - My Library", "Zotero - Transformer Papers Collection", "Zotero - RAG Reading List"], category: "research", weight: 2 },
		{ domain: "en.wikipedia.org", titlePatterns: ["Transformer (machine learning model) - Wikipedia", "Attention (machine learning) - Wikipedia", "Word embedding - Wikipedia", "Recurrent neural network - Wikipedia", "Natural language processing - Wikipedia"], category: "research", weight: 2 },
		{ domain: "huggingface.co", titlePatterns: ["Hugging Face - Models", "Hugging Face - BERT base uncased", "Hugging Face - Datasets: Common Crawl"], category: "research", weight: 2 },
	],
	student: [
		{ domain: "khanacademy.org", titlePatterns: ["Khan Academy - Big O Notation", "Khan Academy - Algorithms", "Khan Academy - Graph Algorithms", "Khan Academy - Recursion"], category: "education", weight: 4 },
		{ domain: "chegg.com", titlePatterns: ["Chegg Study - Data Structures Textbook", "Chegg Study - Algorithm Design Manual"], category: "research", weight: 2 },
		{ domain: "quizlet.com", titlePatterns: ["Quizlet - CS 301 Data Structures Flashcards", "Quizlet - Algorithm Complexity Cheat Sheet", "Quizlet - Operating Systems Final Review"], category: "research", weight: 3 },
		{ domain: "geeksforgeeks.org", titlePatterns: ["Binary Search Tree - GeeksforGeeks", "Dijkstra's Algorithm - GeeksforGeeks", "Dynamic Programming - GeeksforGeeks", "Red-Black Tree Insertion - GeeksforGeeks", "Topological Sort - GeeksforGeeks"], category: "research", weight: 4 },
		{ domain: "leetcode.com", titlePatterns: ["LeetCode - Two Sum", "LeetCode - Merge k Sorted Lists", "LeetCode - Valid Parentheses", "LeetCode - Maximum Subarray", "LeetCode - Binary Tree Level Order"], category: "dev", weight: 3 },
		{ domain: "coursera.org", titlePatterns: ["Coursera - Algorithms Part I (Princeton)", "Coursera - Stanford Machine Learning", "Coursera - Data Structures Specialization"], category: "research", weight: 2 },
		{ domain: "youtube.com", titlePatterns: ["MIT 6.006: Introduction to Algorithms Lecture 12", "Abdul Bari: Dijkstra's Algorithm", "CS Dojo: Dynamic Programming Explained", "Neetcode: Blind 75 - Trees", "3Blue1Brown: Neural Networks Ch. 1"], category: "media", weight: 3 },
		{ domain: "en.wikipedia.org", titlePatterns: ["Dijkstra's algorithm - Wikipedia", "Binary search tree - Wikipedia", "Hash table - Wikipedia", "Breadth-first search - Wikipedia", "NP-completeness - Wikipedia"], category: "research", weight: 2 },
		{ domain: "reddit.com", titlePatterns: ["r/cs50 - Week 5 Problem Set Help", "r/learnprogramming - How to study for coding interviews", "r/csMajors - Internship prep advice"], category: "social", weight: 2 },
		{ domain: "discord.com", titlePatterns: ["#algorithms - CS Study Group - Discord", "#general - CS 301 Class - Discord", "#exam-prep - Finals Week - Discord"], category: "social", weight: 2 },
	],
	product: [
		{ domain: "figma.com", titlePatterns: ["Figma - Dashboard Redesign v3", "Figma - Mobile Onboarding Flow", "Figma - Component Library Audit", "Figma - User Journey Map", "Figma - Wireframes Sprint 12"], category: "work", weight: 4 },
		{ domain: "miro.com", titlePatterns: ["Miro - Product Roadmap 2025", "Miro - User Story Mapping", "Miro - Competitive Analysis Board", "Miro - Retrospective Board"], category: "work", weight: 3 },
		{ domain: "amplitude.com", titlePatterns: ["Amplitude - Funnel Analysis: Onboarding", "Amplitude - Retention Dashboard", "Amplitude - Feature Adoption Metrics"], category: "work", weight: 3 },
		{ domain: "mixpanel.com", titlePatterns: ["Mixpanel - User Engagement Report", "Mixpanel - A/B Test Results: Checkout Flow"], category: "work", weight: 2 },
		{ domain: "productboard.com", titlePatterns: ["Productboard - Feature Voting", "Productboard - Roadmap Q3", "Productboard - Customer Feedback Insights"], category: "work", weight: 2 },
		{ domain: "notion.so", titlePatterns: ["PRD: Search Redesign - Notion", "Meeting Notes: Design Review - Notion", "Sprint Retro Notes - Notion", "Competitive Analysis - Notion", "OKR Tracking Q3 - Notion"], category: "work", weight: 3 },
		{ domain: "linear.app", titlePatterns: ["Linear - PROD-847: Search UX improvement", "Linear - Sprint Board", "Linear - Roadmap View", "Linear - Bug Triage"], category: "work", weight: 2 },
	],
	incident: [
		{ domain: "pagerduty.com", titlePatterns: ["PagerDuty - Incident #4521: API Latency Spike", "PagerDuty - On-Call Schedule", "PagerDuty - Incident Timeline", "PagerDuty - Escalation Policy"], category: "dev", weight: 4 },
		{ domain: "statuspage.io", titlePatterns: ["Status Page - Current Incidents", "Status Page - Update Incident #4521", "Status Page - Scheduled Maintenance"], category: "dev", weight: 2 },
		{ domain: "grafana.com", titlePatterns: ["Grafana - Production API Latency", "Grafana - Error Rate Dashboard", "Grafana - Pod Memory Usage", "Grafana - Database Connection Pool", "Grafana - Request Queue Depth"], category: "dev", weight: 5 },
		{ domain: "sentry.io", titlePatterns: ["Sentry - TypeError: Cannot read property of undefined", "Sentry - Issue #12847: OOMKilled in api-server", "Sentry - Performance: /api/users endpoint", "Sentry - Error Spike: 500 Internal Server Error"], category: "dev", weight: 3 },
		{ domain: "datadog.com", titlePatterns: ["Datadog - APM Traces: /api/checkout", "Datadog - Infrastructure Map", "Datadog - Log Explorer: Error"], category: "dev", weight: 2 },
		{ domain: "console.aws.amazon.com", titlePatterns: ["CloudWatch Alarms | AWS Console", "ECS Service Events | AWS Console", "RDS Performance Insights | AWS Console", "EC2 Instance Status | AWS Console", "Route 53 Health Checks | AWS Console"], category: "dev", weight: 4 },
	],
	freelance: [
		{ domain: "freshbooks.com", titlePatterns: ["FreshBooks - Invoice #1047 for Client A", "FreshBooks - Time Tracking", "FreshBooks - Expense Report Q2", "FreshBooks - Revenue Dashboard"], category: "finance", weight: 3 },
		{ domain: "stripe.com", titlePatterns: ["Stripe Dashboard - Payments", "Stripe - Customer Portal Settings", "Stripe - Subscription Overview", "Stripe - Webhook Events"], category: "finance", weight: 2 },
		{ domain: "upwork.com", titlePatterns: ["Upwork - My Jobs", "Upwork - Proposals", "Upwork - Earnings Summary"], category: "work", weight: 2 },
		{ domain: "wordpress.org", titlePatterns: ["WordPress Developer Resources", "WordPress Plugin Handbook", "WordPress REST API Reference", "WordPress Theme Development"], category: "dev", weight: 3 },
		{ domain: "github.com", titlePatterns: ["client-a/react-dashboard: Fix SSR hydration", "client-b/wp-theme: Update header component", "my-blog/gatsby-site: New post draft", "client-c/landing-page: Add analytics"], category: "dev", weight: 4 },
		{ domain: "slack.com", titlePatterns: ["#project - Client A Workspace - Slack", "#general - Client B Workspace - Slack", "DM with Client C - Slack"], category: "work", weight: 3 },
	],
	education: [
		{ domain: "coursera.org", titlePatterns: ["Coursera - Algorithms Part I (Princeton)", "Coursera - Stanford Machine Learning", "Coursera - Data Structures Specialization"], category: "education", weight: 3 },
		{ domain: "edx.org", titlePatterns: ["edX - MIT: Introduction to Computer Science", "edX - Linear Algebra Foundations", "edX - Data Science MicroMasters"], category: "education", weight: 2 },
		{ domain: "khanacademy.org", titlePatterns: ["Khan Academy - Big O Notation", "Khan Academy - Algorithms", "Khan Academy - Graph Algorithms", "Khan Academy - Recursion"], category: "education", weight: 3 },
		{ domain: "duolingo.com", titlePatterns: ["Duolingo - Spanish Lesson 42", "Duolingo - Daily Streak 120", "Duolingo - Japanese Practice"], category: "education", weight: 2 },
		{ domain: "chegg.com", titlePatterns: ["Chegg Study - Data Structures Textbook", "Chegg Study - Algorithm Design Manual"], category: "education", weight: 2 },
		{ domain: "quizlet.com", titlePatterns: ["Quizlet - CS 301 Data Structures Flashcards", "Quizlet - Algorithm Complexity Cheat Sheet", "Quizlet - OS Finals Review"], category: "education", weight: 2 },
		{ domain: "leetcode.com", titlePatterns: ["LeetCode - Two Sum", "LeetCode - Merge k Sorted Lists", "LeetCode - Valid Parentheses", "LeetCode - Maximum Subarray"], category: "education", weight: 3 },
	],
	gaming: [
		{ domain: "store.steampowered.com", titlePatterns: ["Steam Store - Hades II", "Steam - Library", "Steam - Recent Activity", "Steam Workshop"], category: "gaming", weight: 3 },
		{ domain: "epicgames.com", titlePatterns: ["Epic Games Store - Free Games", "Epic Games Launcher - Library"], category: "gaming", weight: 2 },
		{ domain: "itch.io", titlePatterns: ["itch.io - Indie Games", "itch.io - Game Jam Results", "itch.io - Top Rated Games"], category: "gaming", weight: 2 },
		{ domain: "igdb.com", titlePatterns: ["IGDB - Hollow Knight", "IGDB - Upcoming Releases", "IGDB - Top Rated 2025"], category: "gaming", weight: 1 },
		{ domain: "ign.com", titlePatterns: ["IGN - Game Reviews", "IGN - Nintendo Direct Summary", "IGN - Best RPGs 2025"], category: "gaming", weight: 2 },
	],
	writing: [
		{ domain: "grammarly.com", titlePatterns: ["Grammarly - My Documents", "Grammarly Editor - Draft: Blog Post", "Grammarly - Weekly Writing Stats"], category: "writing", weight: 3 },
		{ domain: "hemingwayapp.com", titlePatterns: ["Hemingway Editor", "Hemingway App - Chapter 3 Draft"], category: "writing", weight: 2 },
		{ domain: "overleaf.com", titlePatterns: ["Overleaf - Literature Review Draft", "Overleaf - Thesis Chapter 3", "Overleaf - Conference Paper"], category: "writing", weight: 3 },
		{ domain: "nanowrimo.org", titlePatterns: ["NaNoWriMo - My Novel", "NaNoWriMo - Word Count Dashboard", "NaNoWriMo - Write-In Events"], category: "writing", weight: 1 },
	],
	pkm: [
		{ domain: "forum.obsidian.md", titlePatterns: ["Obsidian Forum - Plugin Development", "Obsidian Forum - Showcase: Daily Notes Setup", "Obsidian Forum - Help: Dataview query", "Obsidian Forum - Templates"], category: "pkm", weight: 4 },
		{ domain: "logseq.com", titlePatterns: ["Logseq - My Graph", "Logseq Docs - Queries", "Logseq - Community Forum"], category: "pkm", weight: 2 },
		{ domain: "readwise.io", titlePatterns: ["Readwise - Daily Review", "Readwise - Highlights from Atomic Habits", "Readwise Reader - Inbox"], category: "pkm", weight: 3 },
		{ domain: "raindrop.io", titlePatterns: ["Raindrop.io - Reading List", "Raindrop.io - #pkm Collection", "Raindrop.io - Developer Resources"], category: "pkm", weight: 2 },
		{ domain: "remnote.com", titlePatterns: ["RemNote - CS 301 Notes", "RemNote - Algorithms Flashcards", "RemNote - Spaced Repetition Queue"], category: "pkm", weight: 2 },
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
		"There's a race condition in the token refresh. Two concurrent requests both detect an expired token and try to refresh simultaneously. How do I implement a mutex/lock pattern in React?",
		"Review this Express middleware stack for the auth flow. I'm getting 'next() called multiple times' in production.",
		"Write comprehensive tests for the token refresh race condition fix. Mock timers and concurrent requests.",
		"Generate OpenAPI 3.1 spec for our /v2/users endpoints. Include OAuth2 security scheme and error schemas.",
		"Set up GitHub Actions OIDC for deploying to AWS without long-lived credentials.",
		"Help me debug this TypeScript compiler error: 'Type instantiation is excessively deep and possibly infinite'",
		"Write rate limiting middleware using a sliding window algorithm with Redis backing.",
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
	conversational: [
		"build, test, lint, deploy",
		"yeah go ahead",
		"keep them local for now",
		"review open github issues, check for the next biggest impact",
		"commit and push, then cleanup stale branches and worktrees",
		"review the copilot comments on this PR and fix as needed",
		"give me some stats here, what's fresh and what's stale?",
		"do these changes hit any documentation or claude notes",
		"1, 2 and remove the old prototype repos",
		"review for frontend usability",
		"confirm fixes, then merge PR",
		"clean up unused worktrees",
		"leave good documentation so this project can be picked up by a new agent",
		"what can we learn from these tests and analysis",
		"review all documentation in .claude directory, investigate for cleanup",
	],
	academic: [
		"Summarize this paper's methodology section and explain the experimental setup: 'Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks'",
		"Compare BERT and GPT architectures. When should I use each for my NLP research?",
		"Help me write a related work section for my thesis. The topic is attention mechanisms in transformer models.",
		"Explain the difference between pre-training and fine-tuning in the context of large language models",
		"What are the main evaluation metrics for text generation? BLEU, ROUGE, BERTScore — when to use each?",
		"Help me design an ablation study to test which components of my model architecture matter most",
		"Critique the experimental methodology in this paper. What are the potential confounds?",
		"Generate LaTeX for a comparison table of transformer variants: BERT, GPT-2, T5, and their parameter counts",
	],
	student: [
		"Explain dynamic programming with a simple example — I understand recursion but not memoization",
		"Help me understand Big-O notation. Why is O(n log n) better than O(n^2) for sorting?",
		"Walk me through Dijkstra's algorithm step by step with this graph: A→B(4), A→C(2), B→D(3), C→B(1), C→D(5)",
		"I'm getting a segfault in my C binary search tree implementation. Here's the insert function...",
		"Explain the difference between a stack and a queue. When would I use each in a real application?",
		"Help me solve this recurrence relation: T(n) = 2T(n/2) + n. Use the Master Theorem.",
		"What's the difference between BFS and DFS? When should I use each?",
		"I don't understand Red-Black trees. Can you explain the rotations with a visual example?",
		"Help me prepare for my algorithms final. What are the top 10 concepts I need to know?",
		"Explain how hash tables handle collisions. Compare chaining vs open addressing.",
		"Why is quicksort O(n^2) worst case but O(n log n) average? When does the worst case happen?",
		"Help me implement a priority queue using a min-heap in Python for my homework",
		"I'm stuck on this LeetCode problem: 'Merge k Sorted Lists'. Can you walk me through the approach?",
		"Explain amortized analysis. Why is ArrayList.add() O(1) amortized even though it sometimes resizes?",
		"What's the difference between P, NP, and NP-complete? Explain it like I'm a sophomore CS student.",
	],
	product: [
		"Draft a PRD for a search redesign feature. We want to add filters, autocomplete, and recent searches.",
		"Write user stories for the checkout flow improvement. Key metrics: reduce cart abandonment by 15%.",
		"Help me analyze this funnel data: 1000 → 750 → 200 → 80. Where's the biggest drop-off?",
		"Compare product analytics tools: Amplitude vs Mixpanel vs PostHog. We have 50K MAU.",
		"Draft talking points for tomorrow's cross-team meeting about the mobile app performance issues.",
		"Write a one-pager about why we should invest in a design system instead of building ad-hoc components.",
	],
	incident: [
		"Analyze this error trace from our API server. We're seeing OOMKilled on pods that were stable yesterday.",
		"Write a postmortem template for a production outage. Include: timeline, root cause, impact, and action items.",
		"Our API latency spiked from 200ms to 3s. Here are the Grafana metrics. What should I check first?",
		"Help me write an internal status update for the ongoing outage. Tone: calm, factual, include ETA.",
		"We're seeing connection pool exhaustion on our PostgreSQL database. What are the most common causes?",
		"Draft a customer-facing incident communication for a 2-hour checkout outage. Keep it professional.",
		"Our Kubernetes pods keep getting OOMKilled. Current limit is 512Mi. Here's the memory profile...",
		"Review our alerting rules. We got paged at 3am for a non-critical metric. How should I tune the thresholds?",
		"Help me write a runbook for 'API latency > 1s for 5 minutes'. Include diagnostic steps and remediation.",
		"Analyze these database slow query logs and suggest index optimizations.",
	],
	freelance: [
		"Review this client proposal for a React dashboard project. Budget is $15K, timeline is 6 weeks.",
		"Help me fix this SSR hydration mismatch in Next.js. The server renders different HTML than the client.",
		"Write a WordPress custom block for a testimonials carousel. Use the Block Editor API.",
		"Draft an invoice email to Client A for the May milestone. Include a summary of deliverables.",
		"Help me set up Google Analytics 4 with custom events for this client's landing page.",
		"I need to migrate this client's WordPress site from shared hosting to a VPS. What's the checklist?",
		"Write a blog post outline about React Server Components for my personal blog.",
		"Debug this WooCommerce checkout issue — the payment gateway returns a 422 but no error message.",
		"Help me create a project timeline in Notion for juggling 3 client projects simultaneously.",
		"Review my freelance contract template. Are there any clauses I'm missing for IP ownership?",
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
		"react-query invalidateQueries vs refetchQueries",
		"openapi 3.1 security scheme oauth2 example",
		"rate limiting express middleware sliding window",
		"vitest mock timer race condition testing",
		"github actions OIDC token federated credentials",
		"typescript 5.5 inferred type predicates",
		"react server components data fetching patterns",
		"next.js app router vs pages router migration",
		"tailwind v4 migration guide dark mode",
		"zustand vs jotai state management comparison 2025",
		"bun vs node.js performance benchmarks 2025",
		"turborepo monorepo setup guide",
	],
	devops: [
		"kubernetes pod crashloopbackoff oomkilled fix",
		"terraform rds multi-az configuration",
		"grafana dashboard prometheus query rate",
		"aws ecs service discovery setup",
		"helm chart values override production",
		"docker compose health check configuration",
		"opentelemetry collector kubernetes helm chart",
		"grafana tempo vs jaeger distributed tracing 2025",
		"eBPF observability kubernetes production",
		"kubernetes horizontal pod autoscaler custom metrics",
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
	academic: [
		"transformer attention mechanism paper 2017",
		"BERT vs GPT architecture comparison survey",
		"retrieval augmented generation RAG survey 2024",
		"prompt engineering techniques for large language models",
		"knowledge distillation transformer models",
		"RLHF reinforcement learning human feedback alignment",
		"in-context learning few-shot prompting analysis",
		"scaling laws neural language models chinchilla",
		"chain of thought prompting reasoning LLMs",
		"mixture of experts architecture transformer",
		"attention mechanism variants linear attention",
		"contrastive learning self-supervised NLP",
		"model evaluation metrics text generation BLEU ROUGE",
		"position encoding transformer sinusoidal rotary",
		"tokenization BPE sentencepiece comparison",
		"instruction tuning FLAN T5 fine-tuning",
		"hallucination detection large language models",
		"multimodal transformer vision language models",
		"efficient attention mechanisms flash attention",
		"knowledge graph embedding techniques",
		"neural architecture search transformer variants",
		"federated learning NLP privacy preserving",
		"cross-lingual transfer multilingual BERT",
		"reward modeling RLHF preference learning",
		"retrieval augmented generation dense passage retrieval",
		"constitutional AI harmlessness training",
		"parameter efficient fine-tuning LoRA adapters",
		"semantic similarity sentence embeddings comparison",
		"causal language model vs masked language model",
		"LLM evaluation benchmarks MMLU HellaSwag",
		"emergent abilities large language models",
		"long context transformers rope alibi",
		"speculative decoding inference optimization",
		"structured prediction sequence labeling NER",
		"data augmentation techniques NLP",
	],
	student: [
		"binary search tree time complexity explained",
		"dijkstra's algorithm step by step example",
		"dynamic programming fibonacci memoization",
		"big O notation cheat sheet comparison",
		"breadth first search vs depth first search when to use",
		"red-black tree rotations explained",
		"hash table collision resolution chaining vs open addressing",
		"master theorem recurrence relation examples",
		"quicksort worst case analysis pivot selection",
		"graph adjacency list vs adjacency matrix",
		"topological sort algorithm applications",
		"amortized analysis dynamic array",
		"minimum spanning tree kruskal vs prim",
		"AVL tree balance factor insertion",
		"NP complete problems examples explained",
		"heap sort vs merge sort stability comparison",
		"trie data structure autocomplete implementation",
		"bellman-ford algorithm negative weights",
		"strongly connected components tarjan's algorithm",
		"B-tree database index explained",
		"counting sort radix sort bucket sort comparison",
		"disjoint set union-find path compression",
		"traveling salesman problem approximation algorithms",
		"segment tree range query tutorial",
		"backtracking algorithm n-queens sudoku",
		"greedy algorithm vs dynamic programming when to use",
		"cache friendly data structures spatial locality",
		"bloom filter probabilistic data structure",
		"skip list vs balanced BST comparison",
		"ford-fulkerson maximum flow algorithm",
		"suffix array substring search",
		"convex hull algorithm comparison",
		"fibonacci heap amortized complexity",
		"matrix chain multiplication dynamic programming",
		"string matching KMP algorithm tutorial",
		"algorithm complexity classes P NP NP-hard",
		"randomized algorithms quickselect median",
		"external sorting merge sort disk",
		"parallel algorithms MapReduce sorting",
		"approximation algorithms vertex cover",
	],
	product: [
		"product metrics framework 2025 north star metric",
		"figma component library best practices auto layout",
		"user retention analysis cohort tables",
		"A/B testing statistical significance calculator",
		"competitive analysis template product management",
		"product roadmap prioritization frameworks RICE MoSCoW",
		"customer journey mapping tools comparison",
		"product requirements document template 2025",
		"mobile app performance metrics benchmarks",
		"design system component documentation best practices",
		"user onboarding flow optimization funnel analysis",
		"product analytics amplitude vs mixpanel vs posthog",
		"jobs to be done framework examples",
		"OKR examples product management quarterly",
		"user interview techniques best practices",
	],
	incident: [
		"kubernetes OOMKilled remediation memory limits",
		"grafana alert rule configuration thresholds",
		"postgresql connection pool exhaustion diagnosis",
		"API latency spike troubleshooting checklist",
		"kubernetes pod eviction priority class",
		"redis memory fragmentation ratio fix",
		"docker container memory limit best practices",
		"aws ECS task definition memory allocation",
		"prometheus alertmanager notification routing",
		"postmortem template blameless incident review",
		"database slow query optimization index tuning",
		"kubernetes horizontal pod autoscaler troubleshooting",
		"nginx 502 bad gateway upstream timeout",
		"connection leak detection java spring boot",
		"circuit breaker pattern resilience4j configuration",
		"load balancer health check configuration best practices",
		"kubernetes node pressure eviction thresholds",
		"aws cloudwatch anomaly detection alarms",
		"distributed tracing root cause analysis",
		"chaos engineering game day planning",
	],
	freelance: [
		"react SSR hydration mismatch next.js debugging",
		"wordpress custom block development gutenberg",
		"google analytics 4 custom events setup",
		"freelance contract template IP ownership clause",
		"stripe payment integration react checkout",
		"wordpress site migration checklist VPS",
		"next.js incremental static regeneration ISR",
		"tailwind css responsive design mobile first",
		"SEO optimization react single page application",
		"vercel deployment environment variables production",
		"wordpress REST API custom endpoints",
		"react testing library user events best practices",
		"gatsby to next.js migration guide 2025",
		"web vitals core performance optimization",
		"client project management notion template freelancer",
		"woocommerce payment gateway 422 error",
		"SSL certificate renewal lets encrypt automation",
		"react server components vs client components when to use",
		"wordpress security hardening checklist 2025",
		"freelance rate calculator hourly to project",
	],
};

// ── Git Commit Templates ────────────────────────────────

export const GIT_COMMIT_TEMPLATES: Record<string, { messages: string[]; repo: string }[]> = {
	webdev: [
		{
			repo: "express-app",
			messages: [
				"feat: Add OAuth PKCE flow for Google provider",
				"fix: Handle null token in auth middleware",
				"test: Add unit tests for token refresh",
				"refactor: Extract validation into middleware",
				"chore: Update dependencies",
				"docs: Add API authentication guide",
				"fix: Race condition in concurrent token refresh",
				"feat: Add rate limiting to auth endpoints",
			],
		},
		{
			repo: "webapp-frontend",
			messages: [
				"feat: Implement search autocomplete component",
				"fix: SSR hydration mismatch in nav bar",
				"style: Update dark mode color tokens",
				"refactor: Migrate to React Server Components",
				"test: Add integration tests for checkout flow",
				"fix: Memory leak in useEffect cleanup",
			],
		},
	],
	devops: [
		{
			repo: "infra-terraform",
			messages: [
				"feat: Add RDS multi-AZ configuration",
				"fix: ECS task memory limits too low",
				"chore: Upgrade provider versions",
				"feat: Add CloudWatch alarm for API latency",
				"fix: Security group ingress rules",
			],
		},
		{
			repo: "k8s-manifests",
			messages: [
				"feat: Add HPA for api-server deployment",
				"fix: Pod disruption budget too restrictive",
				"chore: Update nginx ingress chart version",
				"feat: Add Prometheus scrape annotations",
			],
		},
	],
	academic: [
		{
			repo: "thesis",
			messages: [
				"feat: Draft literature review section 3.2",
				"fix: BibTeX citation formatting",
				"feat: Add attention mechanism comparison table",
				"chore: Regenerate figures for chapter 3",
				"fix: Duplicate references in bibliography",
			],
		},
		{
			repo: "experiment-runner",
			messages: [
				"feat: Add ablation study for attention heads",
				"fix: Data loader memory issue with large batches",
				"refactor: Simplify training loop",
				"feat: Add wandb logging integration",
			],
		},
	],
	general: [
		{
			repo: "my-project",
			messages: [
				"feat: Add user registration endpoint",
				"fix: Email validation regex too strict",
				"test: Add unit tests for user service",
				"refactor: Extract database queries into repository",
				"docs: Update README with setup instructions",
			],
		},
	],
	multiRepo: [
		{
			repo: "obsidian-daily-digest",
			messages: [
				"feat: three-layer digest layout with collapsed callouts",
				"feat: add semantic context Layer 0 to prose prompt",
				"feat: hybrid prose prompt strategy with learnings rendering",
				"fix: reorder note layout, remove tldr callout, collapse work patterns",
				"fix: filter claude code noise prompts and add conversation identity",
				"fix: improve entity extraction with stopwords and domain gating",
				"fix: clean tracking URLs and collapse redirect wrappers",
				"fix: add canonical-key URL dedup and per-domain cap",
				"Merge pull request #31 from devuser/feat/article-first-browsing",
				"Merge pull request #30 from devuser/fix/tracking-url-display",
				"Merge pull request #29 from devuser/fix/note-layout-reorder",
				"Merge pull request #28 from devuser/fix/entity-extraction-quality",
			],
		},
		{
			repo: "prompt-review",
			messages: [
				"Consolidate PR #1 + PR #2: hardening, test suites, and gap coverage",
			],
		},
		{
			repo: "arc",
			messages: [
				"Add CLAUDE.md and .claude/ARCHITECTURE.md for agent handoff",
				"Strip ANTHROPIC_API_KEY from subprocess env",
				"Fix setuptools build backend for Python 3.10 compatibility",
				"Initial arc implementation",
			],
		},
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
			isConversationOpener: i === 0,
			conversationFile: `session-${options.projectName}-${i}.jsonl`,
			conversationTurnCount: 1,
		});
	}
	return sessions;
}

// Codex CLI prompt templates — reflect GPT-based coding assistant usage patterns
const CODEX_PROMPT_TEMPLATES: Record<string, string[]> = {
	coding: [
		"commit vCard changes, and clean unneeded screenshots",
		"gitignore .playwright-mcp folder and commit css change",
		"refactor the auth module to use the new token format",
		"add unit tests for the payment processor edge cases",
		"review this PR diff and suggest improvements",
		"fix the race condition in the session manager",
		"update the API client to handle rate limit retries",
		"extract the logging logic into a separate module",
	],
	general: [
		"help me understand this codebase structure",
		"what does this function do and how can I improve it",
		"write a script to batch rename these files",
		"review and clean up this configuration file",
		"explain the tradeoffs in this architecture decision",
	],
};

export function generateCodexSessions(options: {
	count: number;
	promptCategory?: string;
	projectName: string;
	timestamps: Date[];
}): ClaudeSession[] {
	const templates = CODEX_PROMPT_TEMPLATES[options.promptCategory ?? "coding"] ?? CODEX_PROMPT_TEMPLATES.coding;
	const sessions: ClaudeSession[] = [];
	for (let i = 0; i < options.count; i++) {
		const prompt = templates[i % templates.length];
		const time = i < options.timestamps.length ? options.timestamps[i] : options.timestamps[options.timestamps.length - 1];
		sessions.push({
			prompt,
			time,
			project: options.projectName,
			isConversationOpener: i === 0,
			conversationFile: `codex-${options.projectName}-${i}.jsonl`,
			conversationTurnCount: 1,
		});
	}
	return sessions;
}

export function generateGitCommits(options: {
	count: number;
	templateCategory: string;
	timestamps: Date[];
}): GitCommit[] {
	const templates = GIT_COMMIT_TEMPLATES[options.templateCategory] || GIT_COMMIT_TEMPLATES.general;
	const commits: GitCommit[] = [];
	// Flatten all repo/message combos
	const allMessages: { repo: string; message: string }[] = [];
	for (const t of templates) {
		for (const msg of t.messages) {
			allMessages.push({ repo: t.repo, message: msg });
		}
	}

	for (let i = 0; i < options.count; i++) {
		const entry = allMessages[i % allMessages.length];
		const time = i < options.timestamps.length ? options.timestamps[i] : options.timestamps[options.timestamps.length - 1];
		const hash = Math.random().toString(36).slice(2, 9);
		const isMerge = entry.message.startsWith("Merge pull request");
		// Log-normal distribution centered around ~150 lines for features, ~40 for fixes
		const isFeat = entry.message.startsWith("feat:");
		const baseInsertions = isMerge ? 0 : Math.round(Math.exp(Math.random() * 2 + (isFeat ? 4.5 : 3.5)));
		const baseDeletions = isMerge ? 0 : Math.round(baseInsertions * (0.1 + Math.random() * 0.4));
		commits.push({
			hash,
			message: entry.message,
			time,
			repo: entry.repo,
			filesChanged: isMerge ? 0 : Math.floor(Math.random() * 10) + 1,
			insertions: baseInsertions,
			deletions: baseDeletions,
		});
	}
	return commits;
}
