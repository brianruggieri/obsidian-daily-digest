import { BrowserVisit, CategorizedVisits } from "../types";

// Rule-based domain categorization. The AI refines unknowns.
// Enriched 2026-02 with curated additions for thin categories.
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
		// CRM / support
		"salesforce.com", "hubspot.com", "zendesk.com", "freshdesk.com", "intercom.com",
		// Ops / monitoring
		"pagerduty.com", "datadog.com", "sentry.io", "newrelic.com",
		// Scheduling / forms
		"calendly.com", "typeform.com", "surveymonkey.com",
		// Microsoft 365
		"office.com", "onedrive.com",
		// Password managers (work-adjacent)
		"bitwarden.com",
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
		// Playgrounds / tools
		"jsfiddle.net", "stackblitz.com", "w3schools.com", "caniuse.com",
		"regex101.com", "jwt.io", "postman.com", "insomnia.rest",
		"bundlephobia.com", "dbdiagram.io", "devdocs.io",
		// Docs / reference
		"gitbook.com", "readthedocs.io",
		// Databases / hosting
		"supabase.com", "planetscale.com", "neon.tech", "turso.tech", "upstash.com",
	],
	research: [
		"wikipedia.org", "arxiv.org", "scholar.google.com", "pubmed.ncbi.",
		"jstor.org", "researchgate.net", "semanticscholar.org",
		"perplexity.ai", "wolframalpha.com", "britannica.com",
		"medium.com", "substack.com", "lesswrong.com", "hbr.org",
		// Academic publishers
		"springer.com", "nature.com", "sciencedirect.com",
		// Preprint servers
		"biorxiv.org", "medrxiv.org",
		// Working papers / datasets
		"ssrn.com", "nber.org", "paperswithcode.com",
	],
	news: [
		"nytimes.com", "washingtonpost.com", "theguardian.com", "bbc.",
		"reuters.com", "apnews.com", "bloomberg.com", "wsj.com",
		"ft.com", "economist.com", "theatlantic.com", "wired.com",
		"techcrunch.com", "theverge.com", "arstechnica.com",
		"news.ycombinator.com", "reddit.com/r/news", "axios.com",
		"politico.com", "npr.org",
		// Broadcast / cable
		"cnn.com", "foxnews.com", "nbcnews.com", "cbsnews.com", "msnbc.com",
		// Digital-native news
		"vice.com", "vox.com", "huffpost.com", "newsweek.com",
		"thehill.com", "propublica.org", "pbs.org",
	],
	social: [
		"twitter.com", "x.com", "reddit.com", "linkedin.com",
		"facebook.com", "instagram.com", "threads.net", "mastodon.",
		"discord.com", "telegram.org", "whatsapp.com", "messenger.com",
		"bluesky.", "bsky.app",
		// Image / discovery
		"tumblr.com", "pinterest.com", "snapchat.com", "bereal.com",
		// Q&A / community
		"quora.com", "producthunt.com", "nextdoor.com", "flipboard.com",
		// Dev-focused social
		"dev.to", "hashnode.com",
	],
	media: [
		"youtube.com", "netflix.com", "spotify.com", "twitch.tv",
		"hulu.com", "disneyplus.com", "hbomax.com", "max.com",
		"primevideo.com", "soundcloud.com", "vimeo.com", "tiktok.com",
		"podcasts.apple.com", "open.spotify.com",
		// Streaming services
		"peacocktv.com", "paramountplus.com", "crunchyroll.com", "funimation.com",
		"sling.com", "fubo.tv", "directv.com", "plex.tv",
		// Sports
		"espn.com", "nfl.com", "nba.com", "mlb.com",
		// Music
		"bandcamp.com", "tidal.com", "deezer.com", "pandora.com", "iheartradio.com",
		// Audiobooks / podcasts
		"audible.com", "dailymotion.com",
	],
	shopping: [
		"amazon.com", "ebay.com", "etsy.com", "shopify.com",
		"bestbuy.com", "walmart.com", "target.com", "costco.com",
		"newegg.com", "bhphotovideo.com",
		// Home / furniture
		"wayfair.com", "homedepot.com", "lowes.com", "ikea.com", "overstock.com",
		// Apparel
		"macys.com", "nordstrom.com", "nordstromrack.com", "gap.com", "oldnavy.com",
		"hm.com", "zara.com", "uniqlo.com", "asos.com", "revolve.com",
		"zappos.com", "footlocker.com", "nike.com", "adidas.com",
		// International / discount
		"aliexpress.com", "temu.com", "wish.com", "shein.com",
		// Pet supplies
		"chewy.com", "petsmart.com", "petco.com",
		// Electronics / office
		"adorama.com", "staples.com", "officedepot.com", "microcenter.com",
		// Gaming retail
		"gamestop.com",
		// Auto
		"autozone.com",
	],
	finance: [
		"chase.com", "bankofamerica.com", "wellsfargo.com", "citibank.com",
		"schwab.com", "fidelity.com", "vanguard.com", "robinhood.com",
		"coinbase.com", "kraken.com", "mint.com", "ynab.com",
		"turbotax.com", "hrblock.com", "paypal.com", "stripe.com",
		"venmo.com", "cashapp.com",
		// Banks / neobanks
		"capitalone.com", "discover.com", "americanexpress.com",
		"sofi.com", "chime.com", "wise.com", "revolut.com",
		// Brokerage
		"etrade.com", "wealthfront.com", "betterment.com", "acorns.com",
		// Personal finance
		"nerdwallet.com", "bankrate.com", "creditkarma.com",
	],
	ai_tools: [
		"claude.ai", "chat.openai.com", "gemini.google.com",
		"perplexity.ai", "cursor.sh", "copilot.microsoft.com",
		"poe.com", "character.ai", "midjourney.com", "runway.ml",
		"elevenlabs.io", "replicate.com",
		// Inference providers
		"mistral.ai", "cohere.com", "together.ai", "groq.com", "ollama.com",
		// Research / leaderboards
		"lmsys.org",
		// Conversational / search AI
		"pi.ai", "you.com", "phind.com", "aider.chat",
		// AI dev tools
		"v0.dev", "bolt.new", "tabnine.com", "codeium.com", "sourcegraph.com",
	],
	personal: [
		"health.", "myfitnesspal.com", "strava.com", "garmin.com",
		"whoop.com", "oura.com", "calm.com", "headspace.com",
		// Fitness / weight
		"fitbit.com", "noom.com", "peloton.com", "cronometer.com",
		"loseit.com", "alltrails.com", "beachbody.com",
		// Books / genealogy
		"goodreads.com", "ancestry.com", "23andme.com",
		// Mindfulness
		"insighttimer.com", "wakingup.com", "tenpercent.com",
		// Habit tracking
		"habitica.com", "stickk.com",
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
		// Video / lectures
		"ted.com", "futurelearn.com", "openculture.com",
		// Data science / ML
		"datacamp.com", "deeplearning.ai", "fast.ai",
		// Homework / tutoring
		"coursehero.com", "desmos.com", "code.org",
	],
	gaming: [
		"store.steampowered.com", "epicgames.com",
		"gog.com", "itch.io", "humblebundle.com",
		"xbox.com", "playstation.com", "nintendo.com",
		"battlenet.com", "ea.com", "ubisoft.com",
		"igdb.com", "ign.com", "gamespot.com",
		"pcgamer.com", "kotaku.com", "polygon.com",
		"speedrun.com", "howlongtobeat.com",
		// Popular games / publishers
		"minecraft.net", "mojang.com",
		"leagueoflegends.com", "valorant.com", "blizzard.com",
		"rockstargames.com", "activision.com",
		// Modding / database
		"nexusmods.com", "protondb.com", "curseforge.com",
		// Deals
		"g2a.com", "fanatical.com",
	],
	writing: [
		"grammarly.com", "hemingwayapp.com", "prowritingaid.com",
		"overleaf.com",
		"ghost.org", "nanowrimo.org",
		"ulysses.app",
		// Publishing / self-pub
		"reedsy.com", "atticus.io", "wattpad.com", "fictionpress.com",
		// Writing tools
		"750words.com", "draft.app", "novelcrafter.com", "dabble.me",
	],
	pkm: [
		"obsidian.md", "forum.obsidian.md", "help.obsidian.md",
		"logseq.com", "roamresearch.com",
		"capacities.io", "tana.inc",
		"mem.ai", "reflect.app",
		"readwise.io", "raindrop.io", "instapaper.com",
		"hypothesis.is", "zettelkasten.de",
		// Additional note-taking / PKM tools
		"workflowy.com", "craft.do", "anytype.io", "heptabase.com",
		"supernotes.app",
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
