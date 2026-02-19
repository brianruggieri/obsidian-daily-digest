import { describe, it, expect } from "vitest";
import { categorizeDomain, categorizeVisits, CATEGORY_LABELS } from "../../src/categorize";
import { BrowserVisit } from "../../src/types";

describe("categorizeDomain", () => {
	it("categorizes GitHub as dev", () => {
		expect(categorizeDomain("github.com")).toBe("dev");
	});

	it("categorizes Stack Overflow as dev", () => {
		expect(categorizeDomain("stackoverflow.com")).toBe("dev");
	});

	it("categorizes Slack as work", () => {
		expect(categorizeDomain("slack.com")).toBe("work");
	});

	it("categorizes Google Mail as work", () => {
		expect(categorizeDomain("mail.google.com")).toBe("work");
	});

	it("categorizes Google Docs as work", () => {
		expect(categorizeDomain("docs.google.com")).toBe("work");
	});

	it("categorizes Wikipedia as research", () => {
		expect(categorizeDomain("wikipedia.org")).toBe("research");
	});

	it("categorizes arxiv as research", () => {
		expect(categorizeDomain("arxiv.org")).toBe("research");
	});

	it("categorizes Hacker News as news", () => {
		expect(categorizeDomain("news.ycombinator.com")).toBe("news");
	});

	it("categorizes Twitter/X as social", () => {
		expect(categorizeDomain("x.com")).toBe("social");
		expect(categorizeDomain("twitter.com")).toBe("social");
	});

	it("categorizes YouTube as media", () => {
		expect(categorizeDomain("youtube.com")).toBe("media");
	});

	it("categorizes Amazon as shopping", () => {
		expect(categorizeDomain("amazon.com")).toBe("shopping");
	});

	it("categorizes Claude.ai as ai_tools", () => {
		expect(categorizeDomain("claude.ai")).toBe("ai_tools");
	});

	it("categorizes unknown domains as other", () => {
		expect(categorizeDomain("random-obscure-site.xyz")).toBe("other");
	});

	it("strips www prefix", () => {
		expect(categorizeDomain("www.github.com")).toBe("dev");
	});

	it("matches subdomains via includes", () => {
		// "docs." rule should match developer docs
		expect(categorizeDomain("docs.anthropic.com")).toBe("dev");
	});

	it("matches API subdomains", () => {
		expect(categorizeDomain("api.stripe.com")).toBe("dev");
	});
});

describe("categorizeVisits", () => {
	const visits: BrowserVisit[] = [
		{ url: "https://github.com/repo1", title: "Repo 1", time: new Date() },
		{ url: "https://github.com/repo2", title: "Repo 2", time: new Date() },
		{ url: "https://mail.google.com/inbox", title: "Inbox", time: new Date() },
		{ url: "https://youtube.com/watch", title: "Video", time: new Date() },
		{ url: "https://random-site.xyz/page", title: "Random", time: new Date() },
	];

	it("groups visits by category", () => {
		const result = categorizeVisits(visits);
		expect(result.dev).toHaveLength(2);
		expect(result.work).toHaveLength(1);
		expect(result.media).toHaveLength(1);
		expect(result.other).toHaveLength(1);
	});

	it("excludes empty categories", () => {
		const result = categorizeVisits(visits);
		expect(result.shopping).toBeUndefined();
		expect(result.finance).toBeUndefined();
	});

	it("adds domain to each visit", () => {
		const result = categorizeVisits(visits);
		for (const v of result.dev!) {
			expect(v.domain).toBe("github.com");
		}
	});

	it("handles empty input", () => {
		const result = categorizeVisits([]);
		expect(Object.keys(result)).toHaveLength(0);
	});

	it("skips invalid URLs", () => {
		const bad: BrowserVisit[] = [
			{ url: "not-a-url", title: "Bad", time: new Date() },
		];
		const result = categorizeVisits(bad);
		expect(Object.keys(result)).toHaveLength(0);
	});
});

describe("CATEGORY_LABELS", () => {
	it("has labels for all standard categories", () => {
		const expected = ["work", "dev", "research", "news", "social", "media", "shopping", "finance", "ai_tools", "personal", "other"];
		for (const cat of expected) {
			expect(CATEGORY_LABELS[cat]).toBeDefined();
			expect(CATEGORY_LABELS[cat]).toHaveLength(2);
			expect(CATEGORY_LABELS[cat][0].length).toBeGreaterThan(0); // emoji
			expect(CATEGORY_LABELS[cat][1].length).toBeGreaterThan(0); // label
		}
	});
});
