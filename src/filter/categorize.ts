import { BrowserVisit, CategorizedVisits } from "../types";

// ── Domain-to-category rules ─────────────────────────────────
//
// Four-layer categorization:
//   Layer 1: Domain pattern matching (CATEGORY_RULES) — fast, deterministic
//   Layer 2: URL path heuristics (PATH_HINTS)
//   Layer 3: Page title heuristics (TITLE_HINTS)
//   Layer 4: TLD / subdomain inference (TLD_HINTS)
//
// Domain data sources:
//   - Hand-curated rules for mainstream sites
//   - UT1 Blacklists (Université Toulouse, CC BY-SA 3.0) for ai_tools,
//     finance, social, and jobsearch categories
//     https://dsi.ut-capitole.fr/blacklists/index_en.php
//
// ~1,200 domain patterns across 15 categories.

export const CATEGORY_RULES: Record<string, string[]> = {
	work: [
		// Project management
		"notion.so", "notion.site", "linear.app", "jira.", "confluence.",
		"asana.com", "monday.com", "clickup.com", "basecamp.com", "trello.com",
		"height.app", "shortcut.com", "wrike.com", "teamwork.com", "smartsheet.com",
		"plan.io", "pivotaltracker.com", "youtrack.jetbrains.com",
		// Communication
		"slack.com", "teams.microsoft.com", "zoom.us", "meet.google.com",
		"webex.com", "whereby.com", "around.co", "gather.town", "loom.com",
		"mmhmm.app", "krisp.ai", "otter.ai", "grain.com",
		// Email / calendar
		"calendar.google.com", "mail.google.com", "outlook.", "fastmail.com",
		"superhuman.com", "hey.com", "front.com", "missiveapp.com",
		// Google Workspace
		"docs.google.com", "sheets.google.com", "slides.google.com",
		"drive.google.com", "forms.google.com", "sites.google.com",
		// Microsoft 365
		"office.com", "onedrive.com", "sharepoint.com",
		// Cloud storage
		"dropbox.com", "box.com", "mega.nz",
		// Whiteboarding / design collaboration
		"miro.com", "mural.co", "whimsical.com", "lucid.app", "lucidchart.com",
		// Spreadsheets / databases / forms
		"airtable.com", "coda.io", "retool.com", "budibase.com",
		"typeform.com", "surveymonkey.com", "tally.so", "jotform.com",
		// CRM / sales
		"salesforce.com", "hubspot.com", "pipedrive.com", "close.com",
		"freshsales.io", "copper.com", "attio.com",
		// Support
		"zendesk.com", "freshdesk.com", "intercom.com", "helpscout.com",
		"crisp.chat", "drift.com",
		// Ops / monitoring
		"pagerduty.com", "opsgenie.com", "statuspage.io",
		// Scheduling
		"calendly.com", "cal.com", "savvycal.com", "reclaim.ai",
		// HR / hiring
		"greenhouse.io", "lever.co", "breezy.hr", "gusto.com",
		"rippling.com", "deel.com", "remote.com", "lattice.com",
		// Password / security
		"bitwarden.com", "1password.com", "lastpass.com", "dashlane.com",
		// Analytics
		"amplitude.com", "mixpanel.com", "heap.io", "plausible.io",
		"posthog.com", "hotjar.com", "fullstory.com",
	],
	dev: [
		// Source control / repos
		"github.com", "gitlab.com", "bitbucket.org", "sourcehut.org",
		"codeberg.org", "gitea.io",
		// Q&A / reference
		"stackoverflow.com", "stackexchange.com", "serverfault.com",
		"superuser.com", "askubuntu.com",
		// Package registries
		"npmjs.com", "pypi.org", "crates.io", "rubygems.org", "pkg.go.dev",
		"pub.dev", "packagist.org", "nuget.org", "hex.pm", "cocoapods.org",
		"mvnrepository.com",
		// Containers / infra
		"hub.docker.com", "kubernetes.io", "terraform.io", "ansible.com",
		"pulumi.com", "nixos.org",
		// Hosting / PaaS
		"vercel.com", "netlify.com", "railway.app", "render.com", "fly.io",
		"heroku.com", "deno.com", "deno.land", "bun.sh", "workers.cloudflare.com",
		"pages.cloudflare.com", "surge.sh", "glitch.com",
		// Cloud providers
		"aws.amazon.com", "console.cloud.google.com", "portal.azure.com",
		"cloudflare.com", "digitalocean.com", "linode.com", "vultr.com",
		"oracle.com", "hetzner.com", "scaleway.com",
		// Observability
		"grafana.com", "datadog.com", "sentry.io", "newrelic.com",
		"honeycomb.io", "lightstep.com", "jaegertracing.io",
		// Languages / runtimes
		"rust-lang.org", "python.org", "nodejs.org", "typescriptlang.org",
		"go.dev", "kotlinlang.org", "swift.org", "ruby-lang.org",
		"elixir-lang.org", "zig.news", "vlang.io", "odin-lang.org",
		// AI/ML platforms (developer context)
		"anthropic.com", "platform.claude.com", "openai.com", "platform.openai.com",
		"huggingface.co", "langchain.com", "llamaindex.ai",
		// Playgrounds / sandboxes
		"replit.com", "codepen.io", "codesandbox.io", "stackblitz.com",
		"jsfiddle.net", "glitch.com",
		// Dev tools / utilities
		"cursor.sh", "caniuse.com", "regex101.com", "jwt.io",
		"postman.com", "insomnia.rest", "hoppscotch.io",
		"bundlephobia.com", "dbdiagram.io", "devdocs.io",
		"shields.io", "badgen.net",
		// Docs / reference
		"gitbook.com", "readthedocs.io", "docs.", "developer.", "api.",
		"mdn.", "w3schools.com",
		// Databases / BaaS
		"supabase.com", "planetscale.com", "neon.tech", "turso.tech",
		"upstash.com", "cockroachlabs.com", "timescale.com",
		"firebase.google.com", "appwrite.io", "pocketbase.io",
		// CI/CD
		"circleci.com", "travis-ci.org", "jenkins.io", "buildkite.com",
		"semaphoreci.com", "drone.io",
		// Terminal / CLI tools
		"app.warp.dev", "warp.dev", "fig.io", "iterm2.com",
		"ohmyz.sh", "starship.rs",
		// Testing
		"cypress.io", "playwright.dev", "testing-library.com",
		"chromatic.com", "percy.io",
		// Domain / DNS
		"namecheap.com", "domains.google.com", "name.com",
		"dnsimple.com", "route53.amazonaws.com",
	],
	design: [
		// Design tools
		"figma.com", "sketch.com", "canva.com", "adobe.com",
		"creativecloud.adobe.com", "photopea.com", "pixlr.com",
		"affinity.serif.com", "vectornator.io", "penpot.app",
		// Prototyping
		"invisionapp.com", "framer.com", "principle.app", "origami.design",
		"zeplin.io", "abstract.com", "avocode.com",
		// UI kits / component libraries
		"ui.shadcn.com", "chakra-ui.com", "tailwindui.com",
		"ant.design", "material.io", "storybook.js.org",
		// Stock / assets
		"unsplash.com", "pexels.com", "pixabay.com", "stocksy.com",
		"shutterstock.com", "istockphoto.com", "gettyimages.com",
		"flaticon.com", "thenounproject.com", "iconmonstr.com",
		"heroicons.com", "lucide.dev", "feathericons.com",
		// Color / typography
		"coolors.co", "colorhunt.co", "color.adobe.com",
		"fonts.google.com", "fontawesome.com", "fontsquirrel.com",
		"typewolf.com", "fontpair.co",
		// Portfolio / inspiration
		"dribbble.com", "behance.net", "awwwards.com", "siteinspire.com",
		"landbook.com", "collectui.com", "mobbin.com", "screenlane.com",
		// Logo / branding
		"looka.com", "brandmark.io", "hatchful.shopify.com",
		"logomakr.com", "placeit.net", "designevo.com",
		// 3D / motion
		"spline.design", "rive.app", "lottiefiles.com",
		// Image editing / generation
		"remove.bg", "cleanup.pictures", "upscayl.org",
	],
	research: [
		// Encyclopedias
		"wikipedia.org", "britannica.com", "wolframalpha.com",
		// Academic search
		"scholar.google.com", "semanticscholar.org", "dimensions.ai",
		"lens.org", "connectedpapers.com",
		// Preprints / papers
		"arxiv.org", "biorxiv.org", "medrxiv.org", "ssrn.com",
		"nber.org", "paperswithcode.com",
		// Journals / publishers
		"pubmed.ncbi.", "jstor.org", "researchgate.net",
		"springer.com", "nature.com", "sciencedirect.com",
		"wiley.com", "tandfonline.com", "ieee.org", "acm.org",
		// Long-form / analysis
		"medium.com", "substack.com", "lesswrong.com", "hbr.org",
		"nautil.us", "aeon.co", "quanta", "theconversation.com",
		// AI / search
		"perplexity.ai", "consensus.app", "elicit.com",
	],
	news: [
		// Major US papers
		"nytimes.com", "washingtonpost.com", "wsj.com", "latimes.com",
		"usatoday.com", "bostonglobe.com", "chicagotribune.com",
		"sfchronicle.com", "dallasnews.com", "seattletimes.com",
		// Wire services
		"reuters.com", "apnews.com", "afp.com",
		// Business / finance news
		"bloomberg.com", "ft.com", "economist.com", "barrons.com",
		"marketwatch.com", "cnbc.com", "businessinsider.com", "fortune.com",
		"forbes.com", "inc.com", "fastcompany.com",
		// Tech news
		"techcrunch.com", "theverge.com", "arstechnica.com",
		"wired.com", "engadget.com", "gizmodo.com", "tomsguide.com",
		"tomshardware.com", "anandtech.com", "9to5mac.com",
		"9to5google.com", "macrumors.com", "xda-developers.com",
		// Aggregators
		"news.ycombinator.com", "axios.com", "themorningbrew.com",
		"techmeme.com", "slashdot.org",
		// International (English)
		"theguardian.com", "bbc.", "aljazeera.com", "dw.com",
		"france24.com", "scmp.com",
		// Political / policy
		"politico.com", "thehill.com", "fivethirtyeight.com",
		// Broadcast
		"cnn.com", "foxnews.com", "nbcnews.com", "cbsnews.com",
		"msnbc.com", "abcnews.go.com",
		// Public media
		"npr.org", "pbs.org", "propublica.org",
		// Digital-native
		"vice.com", "vox.com", "huffpost.com", "newsweek.com",
		"thedailybeast.com", "salon.com", "slate.com",
		"theatlantic.com", "newyorker.com",
		// Local news patterns
		"patch.com",
	],
	social: [
		// Major platforms
		"twitter.com", "x.com", "reddit.com", "linkedin.com",
		"facebook.com", "instagram.com", "threads.net",
		"mastodon.", "bsky.app", "bluesky.",
		// Messaging
		"discord.com", "telegram.org", "whatsapp.com", "messenger.com",
		"signal.org", "element.io", "matrix.org",
		// Image / discovery
		"tumblr.com", "pinterest.com", "snapchat.com", "bereal.com",
		// Q&A / community
		"quora.com", "producthunt.com", "nextdoor.com", "flipboard.com",
		// Dev-focused social
		"dev.to", "hashnode.com", "lobste.rs",
		// Forums / community (UT1-sourced)
		"discourse.org", "lemmy.", "kbin.social",
		// Video social
		"lemon8-app.com",
	],
	media: [
		// Video streaming
		"youtube.com", "netflix.com", "hulu.com", "disneyplus.com",
		"hbomax.com", "max.com", "primevideo.com",
		"peacocktv.com", "paramountplus.com", "appletv.apple.com",
		"crunchyroll.com", "funimation.com", "plex.tv",
		"sling.com", "fubo.tv", "directv.com", "tubitv.com",
		"pluto.tv", "roku.com", "curiositystream.com",
		// Short-form video
		"tiktok.com", "vimeo.com", "dailymotion.com",
		// Music
		"spotify.com", "open.spotify.com", "music.apple.com",
		"soundcloud.com", "bandcamp.com", "tidal.com",
		"deezer.com", "pandora.com", "iheartradio.com",
		"last.fm", "genius.com",
		// Podcasts
		"podcasts.apple.com", "pocketcasts.com", "overcast.fm",
		"castbox.fm", "podbean.com",
		// Live streaming
		"twitch.tv", "kick.com",
		// Sports streaming
		"espn.com", "espnplus.com", "nfl.com", "nba.com", "mlb.com",
		"nhl.com", "dazn.com",
		// Audiobooks
		"audible.com", "libro.fm",
		// Photos
		"flickr.com", "500px.com",
		// Radio
		"radio.garden", "tunein.com",
	],
	shopping: [
		// Marketplaces
		"amazon.com", "ebay.com", "etsy.com", "mercari.com",
		"poshmark.com", "depop.com", "offerup.com", "craigslist.org",
		// Big-box retail
		"walmart.com", "target.com", "costco.com", "samsclub.com",
		"bestbuy.com", "kohls.com", "jcpenney.com", "sears.com",
		// Home / furniture
		"wayfair.com", "homedepot.com", "lowes.com", "ikea.com",
		"overstock.com", "westelm.com", "potterybarn.com",
		"cb2.com", "crateandbarrel.com", "restorationhardware.com",
		"article.com", "allmodern.com",
		// Electronics
		"newegg.com", "bhphotovideo.com", "adorama.com",
		"microcenter.com", "monoprice.com",
		// Apparel
		"macys.com", "nordstrom.com", "nordstromrack.com",
		"gap.com", "oldnavy.com", "bananarepublic.com",
		"hm.com", "zara.com", "uniqlo.com", "asos.com", "revolve.com",
		"zappos.com", "footlocker.com", "nike.com", "adidas.com",
		"lululemon.com", "patagonia.com", "rei.com",
		"underarmour.com", "newbalance.com", "puma.com",
		// Grocery / food delivery
		"instacart.com", "doordash.com", "ubereats.com",
		"grubhub.com", "gopuff.com", "freshdirect.com",
		"thrivemarket.com",
		// International / discount
		"aliexpress.com", "temu.com", "wish.com", "shein.com",
		// Pet supplies
		"chewy.com", "petsmart.com", "petco.com",
		// Office
		"staples.com", "officedepot.com",
		// Auto
		"autozone.com", "oreillyauto.com", "rockauto.com",
		// Gaming retail
		"gamestop.com",
		// Comparison / reviews
		"wirecutter.com", "rtings.com", "camelcamelcamel.com",
		// E-commerce platforms (store builder)
		"shopify.com", "squarespace.com", "bigcommerce.com",
		// Deals
		"slickdeals.net", "dealnews.com", "honey.com",
		// Beauty
		"sephora.com", "ulta.com",
		// Books
		"bookshop.org", "abebooks.com", "thriftbooks.com",
	],
	finance: [
		// Major US banks
		"chase.com", "bankofamerica.com", "wellsfargo.com", "citibank.com",
		"capitalone.com", "usbank.com", "pnc.com", "regions.com",
		"tdbank.com", "ally.com", "marcus.com",
		// Neobanks
		"sofi.com", "chime.com", "wise.com", "revolut.com",
		"current.com", "monzo.com", "n26.com",
		// Credit cards
		"discover.com", "americanexpress.com",
		// Brokerage / investing
		"schwab.com", "fidelity.com", "vanguard.com", "robinhood.com",
		"etrade.com", "tdameritrade.com", "interactivebrokers.com",
		"wealthfront.com", "betterment.com", "acorns.com",
		"wealthsimple.com", "m1finance.com", "public.com",
		// Crypto
		"coinbase.com", "kraken.com", "binance.com", "gemini.com",
		"crypto.com", "blockchain.com", "ledger.com",
		// Payments
		"paypal.com", "stripe.com", "venmo.com", "cashapp.com",
		"zelle.com", "affirm.com", "klarna.com", "afterpay.com",
		// Budgeting / personal finance
		"mint.com", "ynab.com", "copilot.money", "monarchmoney.com",
		"personalcapital.com", "quickbooks.intuit.com",
		// Tax
		"turbotax.com", "hrblock.com", "freetaxusa.com",
		// Personal finance info
		"nerdwallet.com", "bankrate.com", "creditkarma.com",
		"investopedia.com", "thebalancemoney.com",
		// Insurance
		"geico.com", "progressive.com", "statefarm.com", "allstate.com",
		"lemonade.com",
		// Real estate
		"zillow.com", "redfin.com", "realtor.com", "trulia.com",
	],
	ai_tools: [
		// Conversational AI
		"claude.ai", "chat.openai.com", "chatgpt.com",
		"gemini.google.com", "copilot.microsoft.com",
		"poe.com", "character.ai", "pi.ai", "you.com",
		// UT1-sourced AI tools
		"deepseek.com", "kimi.ai", "doubao.com", "qwen.ai",
		"andisearch.com", "phind.com", "devv.ai", "felo.ai",
		"iask.ai", "genspark.ai", "duck.ai", "venice.ai",
		"suno.ai", "suno.com", "lmarena.ai", "msty.app",
		"consensus.app", "copy.ai", "jasper.ai", "writesonic.com",
		"textcortex.com", "botsonic.com", "khanmigo.ai",
		// Image / video generation
		"midjourney.com", "runway.ml", "stability.ai",
		"leonardo.ai", "ideogram.ai", "krea.ai", "fal.ai",
		"playground.com", "nightcafe.studio",
		// Audio / voice
		"elevenlabs.io", "murf.ai", "descript.com",
		// Inference providers
		"mistral.ai", "cohere.com", "together.ai", "groq.com",
		"ollama.com", "fireworks.ai", "anyscale.com",
		// Research / leaderboards
		"lmsys.org",
		// AI dev tools
		"v0.dev", "bolt.new", "tabnine.com", "codeium.com",
		"sourcegraph.com", "aider.chat",
		// Replicate / model hosting
		"replicate.com", "modal.com",
	],
	personal: [
		// Health / fitness
		"health.", "myfitnesspal.com", "strava.com", "garmin.com",
		"whoop.com", "oura.com", "fitbit.com", "peloton.com",
		"noom.com", "cronometer.com", "loseit.com",
		"alltrails.com", "komoot.com", "mapmyrun.com",
		// Mindfulness
		"calm.com", "headspace.com", "insighttimer.com",
		"wakingup.com", "tenpercent.com",
		// Habit tracking
		"habitica.com", "stickk.com", "streaks.app",
		// Books / reading
		"goodreads.com", "storygraph.com", "bookwyrm.social",
		// Genealogy
		"ancestry.com", "23andme.com", "familysearch.org",
		// Recipes / cooking
		"allrecipes.com", "food.com", "epicurious.com",
		"bonappetit.com", "seriouseats.com", "foodnetwork.com",
		"simplyrecipes.com", "budgetbytes.com", "skinnytaste.com",
		"cookieandkate.com", "minimalistbaker.com", "halfbakedharvest.com",
		"tasty.co", "delish.com", "yummly.com",
		"thepioneerwoman.com", "pinchofyum.com", "damndelicious.net",
		"smittenkitchen.com", "loveandlemons.com",
		// Travel
		"tripadvisor.com", "booking.com", "airbnb.com",
		"kayak.com", "expedia.com", "hotels.com",
		"skyscanner.com", "hopper.com", "rome2rio.com",
		// Weather
		"weather.com", "weather.gov", "accuweather.com",
		"wunderground.com",
		// Home / DIY
		"familyhandyman.com", "thisoldhouse.com",
		"instructables.com",
		// Maps / local
		"maps.google.com", "maps.apple.com", "waze.com", "yelp.com",
	],
	education: [
		// MOOC / online learning
		"coursera.org", "edx.org", "udemy.com", "skillshare.com",
		"pluralsight.com", "udacity.com",
		"khanacademy.org", "brilliant.org", "masterclass.com",
		// Language learning
		"duolingo.com", "babbel.com", "rosettastone.com", "busuu.com",
		// Coding education
		"leetcode.com", "hackerrank.com", "codecademy.com",
		"freecodecamp.org", "theodinproject.com", "exercism.org",
		"codingame.com", "codewars.com", "neetcode.io",
		// Data science / ML
		"datacamp.com", "deeplearning.ai", "fast.ai", "kaggle.com",
		// Universities
		"mit.edu", "stanford.edu", "harvard.edu", "ocw.mit.edu",
		"berkeley.edu", "yale.edu", "columbia.edu", "princeton.edu",
		".edu",
		// LMS
		"canvas.", "blackboard.", "moodle.", "instructure.com",
		// Lectures / talks
		"ted.com", "futurelearn.com", "openculture.com",
		// Study tools
		"chegg.com", "quizlet.com", "anki.net", "remnote.com",
		// Kids / K-12
		"desmos.com", "code.org", "scratch.mit.edu",
		// Certifications
		"credly.com", "credential.net",
		// Job search / careers (UT1-sourced)
		"indeed.com", "glassdoor.com", "ziprecruiter.com",
		"monster.com", "dice.com", "angel.co", "wellfound.com",
		"weworkremotely.com", "remoteok.com", "flexjobs.com",
		"otta.com", "triplebyte.com", "hired.com",
	],
	gaming: [
		// Storefronts
		"store.steampowered.com", "steampowered.com", "epicgames.com",
		"gog.com", "itch.io", "humblebundle.com",
		// Platforms
		"xbox.com", "playstation.com", "nintendo.com",
		"stadia.google.com", "geforce.com",
		// Publishers
		"ea.com", "ubisoft.com", "blizzard.com", "bethesda.net",
		"rockstargames.com", "activision.com", "sega.com",
		"squareenix.com", "capcom.com", "bandainamcoent.com",
		// Popular games
		"minecraft.net", "mojang.com", "leagueoflegends.com",
		"valorant.com", "fortnite.com", "roblox.com",
		"genshin.hoyoverse.com",
		// Game media
		"igdb.com", "ign.com", "gamespot.com", "giantbomb.com",
		"pcgamer.com", "kotaku.com", "polygon.com", "eurogamer.net",
		"rockpapershotgun.com", "destructoid.com",
		// Tools / databases
		"speedrun.com", "howlongtobeat.com", "rawg.io",
		"isthereanydeal.com",
		// Modding
		"nexusmods.com", "curseforge.com", "modrinth.com",
		// Community
		"protondb.com", "pcgamingwiki.com", "resetera.com",
		// Deals
		"g2a.com", "fanatical.com", "greenmangaming.com",
		// Battle.net
		"battlenet.com", "battle.net",
		// Mobile gaming
		"supercell.com",
	],
	writing: [
		// Writing tools
		"grammarly.com", "hemingwayapp.com", "prowritingaid.com",
		"languagetool.org", "quillbot.com",
		// Writing environments
		"overleaf.com", "ulysses.app", "ia.net",
		"scrivener.com", "novlr.org",
		// Publishing
		"ghost.org", "nanowrimo.org", "reedsy.com",
		"atticus.io", "wattpad.com", "fictionpress.com",
		"leanpub.com", "gumroad.com",
		// Writing tools
		"750words.com", "draft.app", "novelcrafter.com", "dabble.me",
	],
	pkm: [
		// Note-taking / PKM
		"obsidian.md", "forum.obsidian.md", "help.obsidian.md",
		"logseq.com", "roamresearch.com", "remnote.com",
		"capacities.io", "tana.inc", "mem.ai", "reflect.app",
		"workflowy.com", "craft.do", "anytype.io", "heptabase.com",
		"supernotes.app", "notion.so", "scrintal.com",
		// Read later / bookmarks
		"readwise.io", "raindrop.io", "instapaper.com", "pocket.com",
		"omnivore.app", "matter.md",
		// Annotation
		"hypothesis.is", "zettelkasten.de",
		// Journaling
		"dayoneapp.com", "journey.cloud",
	],
};

export const CATEGORY_LABELS: Record<string, [string, string]> = {
	work: ["\u{1F4BC}", "Work"],
	dev: ["\u2699\uFE0F", "Dev & Engineering"],
	design: ["\u{1F3A8}", "Design & Creative"],
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

// ── Layer 2: URL path heuristics ─────────────────────────────
// When domain rules return "other", check the URL path for category signals.

const PATH_HINTS: Array<[RegExp, string]> = [
	[/\/docs?\//i, "dev"],
	[/\/api\//i, "dev"],
	[/\/reference\//i, "dev"],
	[/\/sdk\//i, "dev"],
	[/\/changelog/i, "dev"],
	[/\/blog\//i, "research"],
	[/\/articles?\//i, "research"],
	[/\/wiki\//i, "research"],
	[/\/shop\//i, "shopping"],
	[/\/products?\//i, "shopping"],
	[/\/cart/i, "shopping"],
	[/\/checkout/i, "shopping"],
	[/\/recipes?\//i, "personal"],
	[/\/cooking\//i, "personal"],
	[/\/pricing\/?$/i, "work"],
	[/\/plans\/?$/i, "work"],
	[/\/travel/i, "personal"],
	[/\/flights/i, "personal"],
	[/\/learning/i, "education"],
];

// ── Layer 3: Page title keyword heuristics ───────────────────
// Match against the page title when domain + path both miss.

const TITLE_HINTS: Array<[RegExp, string]> = [
	[/\bdocumentation\b/i, "dev"],
	[/\bAPI reference\b/i, "dev"],
	[/\bchangelog\b/i, "dev"],
	[/\brelease notes\b/i, "dev"],
	[/\brecipes?\b/i, "personal"],
	[/\bcooking\b/i, "personal"],
	[/\bbuy now\b/i, "shopping"],
	[/\badd to cart\b/i, "shopping"],
	[/\bfree shipping\b/i, "shopping"],
];

// ── Layer 4: TLD / subdomain inference ───────────────────────

const TLD_HINTS: Record<string, string> = {
	edu: "education",
	gov: "work",
	mil: "work",
	ac: "education",
};

export function categorizeDomain(domain: string, url?: string, title?: string): string {
	domain = domain.toLowerCase().replace(/^www\./, "");

	// Layer 1: Domain pattern matching (fast path)
	for (const [category, patterns] of Object.entries(CATEGORY_RULES)) {
		for (const p of patterns) {
			if (domain.includes(p)) {
				return category;
			}
		}
	}

	// Layer 2: URL path heuristics
	if (url) {
		try {
			const pathname = new URL(url).pathname;
			for (const [pattern, cat] of PATH_HINTS) {
				if (pattern.test(pathname)) return cat;
			}
		} catch {
			// invalid URL, skip
		}
	}

	// Layer 3: Title keyword heuristics
	if (title) {
		for (const [pattern, cat] of TITLE_HINTS) {
			if (pattern.test(title)) return cat;
		}
	}

	// Layer 4: TLD inference
	const tld = domain.split(".").pop() || "";
	if (TLD_HINTS[tld]) return TLD_HINTS[tld];

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
			const cat = categorizeDomain(domain, v.url, v.title);
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
