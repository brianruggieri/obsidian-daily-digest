import { BrowserVisit, CategorizedVisits } from "../types";

// Rule-based domain categorization. The AI refines unknowns.
export const CATEGORY_RULES: Record<string, string[]> = {
	work: [
		"notion.so", "linear.app", "jira.", "confluence.", "asana.com",
		"monday.com", "clickup.com", "basecamp.com", "trello.com",
		"slack.com", "teams.microsoft.com", "zoom.us", "meet.google.com",
		"calendar.google.com", "mail.google.com", "outlook.",
		"loom.com", "figma.com", "miro.com", "airtable.com", "coda.io",
		"notion.site", "docs.google.com", "sheets.google.com",
		"slides.google.com", "drive.google.com", "dropbox.com",
		"box.com", "sharepoint.com",
	],
	dev: [
		"github.com", "gitlab.com", "bitbucket.org", "stackoverflow.com",
		"stackexchange.com", "npmjs.com", "pypi.org", "crates.io",
		"hub.docker.com", "vercel.com", "netlify.com", "railway.app",
		"render.com", "fly.io", "heroku.com", "aws.amazon.com",
		"console.cloud.google.com", "portal.azure.com", "cloudflare.com",
		"grafana.com", "rust-lang.org",
		"replit.com", "codepen.io", "codesandbox.io", "cursor.sh",
		"anthropic.com", "openai.com", "huggingface.co", "langchain.com",
		"docs.", "developer.", "api.",
	],
	research: [
		"wikipedia.org", "arxiv.org", "scholar.google.com", "pubmed.ncbi.",
		"jstor.org", "researchgate.net", "semanticscholar.org",
		"perplexity.ai", "wolframalpha.com", "britannica.com",
		"medium.com", "substack.com", "lesswrong.com", "hbr.org",
	],
	news: [
		"nytimes.com", "washingtonpost.com", "theguardian.com", "bbc.",
		"reuters.com", "apnews.com", "bloomberg.com", "wsj.com",
		"ft.com", "economist.com", "theatlantic.com", "wired.com",
		"techcrunch.com", "theverge.com", "arstechnica.com",
		"news.ycombinator.com", "reddit.com/r/news", "axios.com",
		"politico.com", "npr.org",
	],
	social: [
		"twitter.com", "x.com", "reddit.com", "linkedin.com",
		"facebook.com", "instagram.com", "threads.net", "mastodon.",
		"discord.com", "telegram.org", "whatsapp.com", "messenger.com",
		"bluesky.", "bsky.app",
	],
	media: [
		"youtube.com", "netflix.com", "spotify.com", "twitch.tv",
		"hulu.com", "disneyplus.com", "hbomax.com", "max.com",
		"primevideo.com", "soundcloud.com", "vimeo.com", "tiktok.com",
		"podcasts.apple.com", "open.spotify.com",
	],
	shopping: [
		"amazon.com", "ebay.com", "etsy.com", "shopify.com",
		"bestbuy.com", "walmart.com", "target.com", "costco.com",
		"newegg.com", "bhphotovideo.com",
	],
	finance: [
		"chase.com", "bankofamerica.com", "wellsfargo.com", "citibank.com",
		"schwab.com", "fidelity.com", "vanguard.com", "robinhood.com",
		"coinbase.com", "kraken.com", "mint.com", "ynab.com",
		"turbotax.com", "hrblock.com", "paypal.com", "stripe.com",
		"venmo.com", "cashapp.com",
	],
	ai_tools: [
		"claude.ai", "chat.openai.com", "gemini.google.com",
		"perplexity.ai", "cursor.sh", "copilot.microsoft.com",
		"poe.com", "character.ai", "midjourney.com", "runway.ml",
		"elevenlabs.io", "replicate.com",
	],
	personal: [
		"health.", "myfitnesspal.com", "strava.com", "garmin.com",
		"whoop.com", "oura.com", "calm.com", "headspace.com",
	],
	education: [
		"coursera.org", "edx.org", "udemy.com", "skillshare.com",
		"linkedin.com/learning", "pluralsight.com", "udacity.com",
		"khanacademy.org", "duolingo.com", "brilliant.org",
		"mit.edu", "stanford.edu", "harvard.edu", "ocw.mit.edu",
		"canvas.", "blackboard.", "moodle.", "instructure.com",
		"chegg.com", "quizlet.com",
		"leetcode.com", "hackerrank.com", "codecademy.com",
		"freecodecamp.org", "theodinproject.com",
	],
	gaming: [
		"store.steampowered.com", "epicgames.com",
		"gog.com", "itch.io", "humblebundle.com",
		"xbox.com", "playstation.com", "nintendo.com",
		"battlenet.com", "ea.com", "ubisoft.com",
		"igdb.com", "ign.com", "gamespot.com",
		"pcgamer.com", "kotaku.com", "polygon.com",
		"speedrun.com", "howlongtobeat.com",
	],
	writing: [
		"grammarly.com", "hemingwayapp.com", "prowritingaid.com",
		"overleaf.com",
		"ghost.org", "nanowrimo.org",
		"ulysses.app",
	],
	pkm: [
		"obsidian.md", "forum.obsidian.md", "help.obsidian.md",
		"logseq.com", "roamresearch.com",
		"capacities.io", "tana.inc",
		"mem.ai", "reflect.app",
		"readwise.io", "raindrop.io", "instapaper.com",
		"hypothesis.is", "zettelkasten.de",
	],
};

export const CATEGORY_LABELS: Record<string, [string, string]> = {
	work: ["\u{1F4BC}", "Work"],
	dev: ["\u2699\uFE0F", "Dev & Engineering"],
	research: ["\u{1F52C}", "Research"],
	news: ["\u{1F4F0}", "News"],
	social: ["\u{1F4AC}", "Social"],
	media: ["\u{1F3AC}", "Media & Entertainment"],
	shopping: ["\u{1F6D2}", "Shopping"],
	finance: ["\u{1F4B0}", "Finance"],
	ai_tools: ["\u{1F916}", "AI Tools"],
	personal: ["\u{1F3C3}", "Personal"],
	education: ["\u{1F393}", "Education"],
	gaming: ["\u{1F3AE}", "Gaming"],
	writing: ["\u270F\uFE0F", "Writing"],
	pkm: ["\u{1F9E0}", "PKM & Notes"],
	other: ["\u{1F310}", "Other"],
};

export function categorizeDomain(domain: string): string {
	domain = domain.toLowerCase().replace(/^www\./, "");
	for (const [category, patterns] of Object.entries(CATEGORY_RULES)) {
		for (const p of patterns) {
			if (domain.includes(p)) {
				return category;
			}
		}
	}
	return "other";
}

export function categorizeVisits(visits: BrowserVisit[]): CategorizedVisits {
	const byCat: CategorizedVisits = {};
	for (const key of Object.keys(CATEGORY_LABELS)) {
		byCat[key] = [];
	}
	for (const v of visits) {
		try {
			const url = new URL(v.url);
			const domain = url.hostname.replace(/^www\./, "");
			const cat = categorizeDomain(domain);
			byCat[cat].push({ ...v, domain });
		} catch {
			// skip invalid URLs
		}
	}
	// Remove empty categories
	const result: CategorizedVisits = {};
	for (const [k, vs] of Object.entries(byCat)) {
		if (vs.length > 0) {
			result[k] = vs;
		}
	}
	return result;
}

// Note: scrubSecrets() is defined in sanitize.ts (comprehensive 15-pattern version).
// Import from "./sanitize" — do NOT duplicate here.
