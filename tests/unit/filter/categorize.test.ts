import { describe, it, expect } from "vitest";
import { categorizeDomain, categorizeVisits, CATEGORY_LABELS } from "../../../src/filter/categorize";
import { BrowserVisit } from "../../../src/types";

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

	it("categorizes Coursera as education", () => {
		expect(categorizeDomain("coursera.org")).toBe("education");
	});

	it("categorizes Khan Academy as education (moved from personal)", () => {
		expect(categorizeDomain("khanacademy.org")).toBe("education");
	});

	it("categorizes LeetCode as education", () => {
		expect(categorizeDomain("leetcode.com")).toBe("education");
	});

	it("categorizes Steam as gaming", () => {
		expect(categorizeDomain("store.steampowered.com")).toBe("gaming");
	});

	it("categorizes itch.io as gaming", () => {
		expect(categorizeDomain("itch.io")).toBe("gaming");
	});

	it("categorizes Grammarly as writing", () => {
		expect(categorizeDomain("grammarly.com")).toBe("writing");
	});

	it("categorizes Overleaf as writing", () => {
		expect(categorizeDomain("overleaf.com")).toBe("writing");
	});

	it("categorizes Obsidian forum as pkm", () => {
		expect(categorizeDomain("forum.obsidian.md")).toBe("pkm");
	});

	it("categorizes Logseq as pkm", () => {
		expect(categorizeDomain("logseq.com")).toBe("pkm");
	});

	it("categorizes Readwise as pkm", () => {
		expect(categorizeDomain("readwise.io")).toBe("pkm");
	});

	// Enriched category coverage
	it("categorizes Wayfair as shopping", () => {
		expect(categorizeDomain("wayfair.com")).toBe("shopping");
	});

	it("categorizes Temu as shopping", () => {
		expect(categorizeDomain("temu.com")).toBe("shopping");
	});

	it("categorizes Peacock as media", () => {
		expect(categorizeDomain("peacocktv.com")).toBe("media");
	});

	it("categorizes ESPN as media", () => {
		expect(categorizeDomain("espn.com")).toBe("media");
	});

	it("categorizes Pinterest as social", () => {
		expect(categorizeDomain("pinterest.com")).toBe("social");
	});

	it("categorizes dev.to as social", () => {
		expect(categorizeDomain("dev.to")).toBe("social");
	});

	it("categorizes CNN as news", () => {
		expect(categorizeDomain("cnn.com")).toBe("news");
	});

	it("categorizes Capital One as finance", () => {
		expect(categorizeDomain("capitalone.com")).toBe("finance");
	});

	it("categorizes Mistral as ai_tools", () => {
		expect(categorizeDomain("mistral.ai")).toBe("ai_tools");
	});

	it("categorizes Groq as ai_tools", () => {
		expect(categorizeDomain("groq.com")).toBe("ai_tools");
	});

	it("categorizes Strava as health", () => {
		expect(categorizeDomain("strava.com")).toBe("health");
	});

	// Health & Fitness category
	it("categorizes Fitbit as health", () => {
		expect(categorizeDomain("fitbit.com")).toBe("health");
	});

	it("categorizes MyFitnessPal as health", () => {
		expect(categorizeDomain("myfitnesspal.com")).toBe("health");
	});

	it("categorizes Peloton as health", () => {
		expect(categorizeDomain("peloton.com")).toBe("health");
	});

	it("categorizes WebMD as health", () => {
		expect(categorizeDomain("webmd.com")).toBe("health");
	});

	it("categorizes Headspace as health", () => {
		expect(categorizeDomain("headspace.com")).toBe("health");
	});

	it("categorizes Zocdoc as health", () => {
		expect(categorizeDomain("zocdoc.com")).toBe("health");
	});

	it("categorizes GoodRx as health (not social despite containing x.com substring)", () => {
		expect(categorizeDomain("goodrx.com")).toBe("health");
	});

	it("categorizes Whoop as health", () => {
		expect(categorizeDomain("whoop.com")).toBe("health");
	});

	it("categorizes Oura as health", () => {
		expect(categorizeDomain("oura.com")).toBe("health");
	});

	it("categorizes AllTrails as health", () => {
		expect(categorizeDomain("alltrails.com")).toBe("health");
	});

	it("categorizes BetterHelp as health", () => {
		expect(categorizeDomain("betterhelp.com")).toBe("health");
	});

	it("categorizes Mayo Clinic as health", () => {
		expect(categorizeDomain("mayoclinic.org")).toBe("health");
	});

	// Travel category
	it("categorizes Booking.com as travel", () => {
		expect(categorizeDomain("booking.com")).toBe("travel");
	});

	it("categorizes Airbnb as travel", () => {
		expect(categorizeDomain("airbnb.com")).toBe("travel");
	});

	it("categorizes Expedia as travel", () => {
		expect(categorizeDomain("expedia.com")).toBe("travel");
	});

	it("categorizes TripAdvisor as travel", () => {
		expect(categorizeDomain("tripadvisor.com")).toBe("travel");
	});

	it("categorizes Skyscanner as travel", () => {
		expect(categorizeDomain("skyscanner.com")).toBe("travel");
	});

	it("categorizes Rome2Rio as travel", () => {
		expect(categorizeDomain("rome2rio.com")).toBe("travel");
	});

	it("categorizes Lonely Planet as travel", () => {
		expect(categorizeDomain("lonelyplanet.com")).toBe("travel");
	});

	it("categorizes Atlas Obscura as travel", () => {
		expect(categorizeDomain("atlasobscura.com")).toBe("travel");
	});

	it("categorizes United Airlines as travel", () => {
		expect(categorizeDomain("united.com")).toBe("travel");
	});

	it("categorizes Delta Airlines as travel", () => {
		expect(categorizeDomain("delta.com")).toBe("travel");
	});

	it("categorizes Southwest Airlines as travel", () => {
		expect(categorizeDomain("southwest.com")).toBe("travel");
	});

	it("categorizes JetBlue as travel", () => {
		expect(categorizeDomain("jetblue.com")).toBe("travel");
	});

	it("categorizes Amtrak as travel", () => {
		expect(categorizeDomain("amtrak.com")).toBe("travel");
	});

	it("categorizes VRBO as travel", () => {
		expect(categorizeDomain("vrbo.com")).toBe("travel");
	});

	it("categorizes Hostelworld as travel", () => {
		expect(categorizeDomain("hostelworld.com")).toBe("travel");
	});

	it("categorizes FlightRadar24 as travel", () => {
		expect(categorizeDomain("flightradar24.com")).toBe("travel");
	});

	it("categorizes Goodreads as personal", () => {
		expect(categorizeDomain("goodreads.com")).toBe("personal");
	});

	it("categorizes TED as education", () => {
		expect(categorizeDomain("ted.com")).toBe("education");
	});

	it("categorizes Minecraft as gaming", () => {
		expect(categorizeDomain("minecraft.net")).toBe("gaming");
	});

	it("categorizes Roblox as gaming (not social despite containing x.com substring)", () => {
		expect(categorizeDomain("roblox.com")).toBe("gaming");
	});

	it("categorizes Nexus Mods as gaming", () => {
		expect(categorizeDomain("nexusmods.com")).toBe("gaming");
	});

	it("categorizes Wattpad as writing", () => {
		expect(categorizeDomain("wattpad.com")).toBe("writing");
	});

	it("categorizes Workflowy as pkm", () => {
		expect(categorizeDomain("workflowy.com")).toBe("pkm");
	});

	it("categorizes Zendesk as work", () => {
		expect(categorizeDomain("zendesk.com")).toBe("work");
	});

	it("categorizes Supabase as dev", () => {
		expect(categorizeDomain("supabase.com")).toBe("dev");
	});

	it("categorizes Nature as research", () => {
		expect(categorizeDomain("nature.com")).toBe("research");
	});

	it("categorizes unknown domains as other", () => {
		expect(categorizeDomain("random-obscure-site.xyz")).toBe("other");
	});

	it("strips www prefix", () => {
		expect(categorizeDomain("www.github.com")).toBe("dev");
	});

	it("matches prefix-wildcard patterns (trailing dot) via substring", () => {
		// "docs." rule should match developer docs
		expect(categorizeDomain("docs.anthropic.com")).toBe("dev");
	});

	it("matches API subdomains", () => {
		expect(categorizeDomain("api.stripe.com")).toBe("dev");
	});

	// ── Layer 2: PATH_HINTS — travel paths ──────────────────
	it("categorizes unknown domain with /travel path as travel", () => {
		expect(categorizeDomain("example.com", "https://example.com/travel/destinations")).toBe("travel");
	});

	it("categorizes unknown domain with /flights path as travel", () => {
		expect(categorizeDomain("example.com", "https://example.com/flights/search")).toBe("travel");
	});

	// ── Layer 2: PATH_HINTS — health paths ──────────────────
	it("categorizes unknown domain with /health path as health", () => {
		expect(categorizeDomain("example.com", "https://example.com/health/articles")).toBe("health");
	});

	it("categorizes unknown domain with /fitness path as health", () => {
		expect(categorizeDomain("example.com", "https://example.com/fitness/workouts")).toBe("health");
	});

	it("categorizes unknown domain with /wellness path as health", () => {
		expect(categorizeDomain("example.com", "https://example.com/wellness/tips")).toBe("health");
	});

	// ── Layer 3: TITLE_HINTS — travel titles ────────────────
	it("categorizes unknown domain with flight booking title as travel", () => {
		expect(categorizeDomain("example.com", "https://example.com/page", "flights book cheap deals")).toBe("travel");
	});

	it("categorizes unknown domain with hotel search title as travel", () => {
		expect(categorizeDomain("example.com", "https://example.com/page", "hotels search near me — best deal")).toBe("travel");
	});

	// ── Layer 3: TITLE_HINTS — health titles ────────────────
	it("categorizes unknown domain with symptoms title as health", () => {
		expect(categorizeDomain("example.com", "https://example.com/page", "Common symptoms of seasonal allergies")).toBe("health");
	});

	it("categorizes unknown domain with workout title as health", () => {
		expect(categorizeDomain("example.com", "https://example.com/page", "30-minute full body workout routine")).toBe("health");
	});

	it("categorizes unknown domain with medication title as health", () => {
		expect(categorizeDomain("example.com", "https://example.com/page", "Medication interactions and side effects")).toBe("health");
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
		const expected = ["work", "dev", "design", "research", "news", "social", "media", "shopping", "finance", "ai_tools", "health", "travel", "personal", "education", "gaming", "writing", "pkm", "other"];
		for (const cat of expected) {
			expect(CATEGORY_LABELS[cat]).toBeDefined();
			expect(CATEGORY_LABELS[cat]).toHaveLength(2);
			expect(CATEGORY_LABELS[cat][0].length).toBeGreaterThan(0); // emoji
			expect(CATEGORY_LABELS[cat][1].length).toBeGreaterThan(0); // label
		}
	});
});
