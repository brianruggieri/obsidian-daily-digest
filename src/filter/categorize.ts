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
// ~2,410 domain patterns across 15 categories.

export const CATEGORY_RULES: Record<string, string[]> = {
	work: [
		// ── Hand-curated ──────────────────────────
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


		// ── ETL: UT1 + Tranco (CC BY-SA 3.0) ──
		// Generated: 2026-03-01 | UT1: c17144c | Tranco: 2026-03-01
		"jobs.telegraph.co.uk", "jobsearchcanada.about.com", "resume.com", "hh.ru",
		"jobs.guardian.co.uk", "stellenmarkt.sueddeutsche.de", "infojobs.net", "francetravail.fr",
		"hellowork.com", "infojobs.com.br", "careerbuilder.com", "totaljobs.com",
		"superjob.ru", "teachers.on.net", "welcometothejungle.com", "e-i.com",
		"snagajob.com", "efinancialcareers.com", "higheredjobs.com", "jobboom.com",
	],
	dev: [
		// ── Hand-curated ──────────────────────────
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
		// ── Hand-curated ──────────────────────────
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
		// ── Hand-curated ──────────────────────────
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


		// ── ETL: UT1 + Tranco (CC BY-SA 3.0) ──
		// Generated: 2026-03-01 | UT1: c17144c | Tranco: 2026-03-01
		"wordpress.com", "blogspot.com", "gravatar.com", "blogs.yahoo.co.jp",
		"blogger.com", "livejournal.com", "blogs.nypost.com", "blogsearch.google.fr",
		"blog.ameba.jp", "blogs.sapo.pt", "blog.livedoor.com", "fc2.com",
		"typepad.com", "weblogs.about.com", "weblogs.altervista.org", "zenigata.altervista.org",
		"d.hatena.ne.jp", "badoo.com", "adrianalove.stumbleupon.com", "blog.csdn.net",
		"baxi.pp.ru", "over-blog.com", "blog.livedoor.jp", "blog.hexun.com",
		"blogs.msdn.com", "blogspot.de", "blog.rtl.fr", "blogsimages.skynet.be",
		"9gag.com", "boingboing.net", "suckerfreeblog.mtv.com", "exblog.jp",
		"blog.goo.ne.jp", "intensedebate.com", "blogs.com", "blogs.nouvelobs.com",
		"purepeople.com", "blog.com", "canalblog.com", "technorati.com",
		"dailykos.com", "xataka.com", "jugem.jp", "gawker.com",
		"yananob.cocolog-nifty.com", "unblog.fr", "skyrock.com", "blog.searchenginewatch.com",
		"blogspot.nl", "blogtalkradio.com", "blog.doctissimo.fr", "eklablog.com",
		"scotusblog.com", "bloglines.com", "aibot.blogfa.com", "seroundtable.com",
		"micro.blog", "kottke.org", "xanga.com", "blogsky.com",
		"centerblog.net", "blog.aufeminin.com", "blogs.albawaba.com", "perezhilton.com",
		"blog4ever.com", "forumactif.com", "webcindario.com", "blog.wfmu.org",
		"blogsome.com", "autopage.teacup.com", "hautetfort.com", "blog.friendster.com",
		"blogs.periodistadigital.com", "kev.homelinux.net", "blogs.ya.com", "blogarama.com",
	],
	news: [
		// ── Hand-curated ──────────────────────────
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


		// ── ETL: UT1 + Tranco (CC BY-SA 3.0) ──
		// Generated: 2026-03-01 | UT1: c17144c | Tranco: 2026-03-01
		"msn.com", "dailymail.co.uk", "globo.com", "elpais.com",
		"spiegel.de", "lemonde.fr", "welt.de", "lefigaro.fr",
		"bild.de", "repubblica.it", "elmundo.es", "leparisien.fr",
		"infobae.com", "nypost.com", "abc.es", "ouest-france.fr",
		"bfmtv.com", "aftonbladet.se", "ad.nl", "lequipe.fr",
		"usnews.com", "cnnbrasil.com.br", "ladepeche.fr", "actu.fr",
		"protothema.gr", "french.xinhuanet.com", "kansascity.about.com", "stlouis.about.com",
		"20minutes.fr", "sfgate.com", "arts.guardian.co.uk", "elconfidencial.com",
		"sueddeutsche.de", "ar.rian.ru", "calameo.com", "lavanguardia.com",
		"nydailynews.com", "chron.com", "boston.com", "liberation.fr",
		"ansa.it", "lesechos.fr", "aljazeera.net", "aif.ru",
		"elespanol.com", "alarabiya.net", "lepoint.fr", "miamiherald.com",
		"europapress.es", "archief.telegraaf.nl", "mercurynews.com", "20min.ch",
		"washingtontimes.com", "startribune.com", "nj.com", "eltiempo.com",
		"csmonitor.com", "gazeta.ru", "denverpost.com", "freep.com",
		"sudouest.fr", "azcentral.com", "oregonlive.com", "huffingtonpost.fr",
		"1tv.ru", "suntimes.com", "adage.com", "abendblatt.de",
		"ajc.com", "okdiario.com", "5-tv.ru", "agenciafinanceira.iol.pt",
		"ledauphine.com", "tf1info.fr", "letelegramme.fr", "lavoixdunord.fr",
		"observer.com", "cleveland.com", "journaldesfemmes.fr", "leprogres.fr",
		"baomoi.com", "taz.de", "midilibre.fr", "baltimoresun.com",
		"laprovence.com", "libertaddigital.com", "lexpress.fr", "elperiodico.com",
		"aktualne.centrum.cz", "belta.by", "nicematin.com", "24sata.hr",
		"nouvelobs.com", "univision.com", "lindependant.fr", "post-gazette.com",
		"examiner.com", "washingtonexaminer.com", "eldebate.com", "afr.com",
		"jsonline.com", "gazzetta.gr", "skai.gr", "babado.ig.com.br",
		"iefimerida.gr", "newsday.com", "telegram.com", "ocregister.com",
		"arabnews.com", "sacbee.com", "manchesterprise.proboards.com", "sltrib.com",
		"orlandosentinel.com", "nola.com", "aktuelnat.au.dk", "aftenposten.no",
		"theobjective.com", "publico.es", "timesunion.com", "sun-sentinel.com",
		"caracoltv.com", "syracuse.com", "indystar.com", "bostonherald.com",
		"tennessean.com", "semana.com", "kansascity.com", "philly.com",
		"vozpopuli.com", "statesman.com", "stltoday.com", "courrierinternational.com",
		"laweekly.com", "huffingtonpost.es", "latribune.fr", "cinweekly.cincinnati.com",
		"news.cincinnati.com", "nky.cincinnati.com", "desmoinesregister.com", "seattletimes.nwsource.com",
		"northjersey.com", "villagevoice.com", "courant.com", "mysanantonio.com",
		"courier-journal.com", "humanite.fr", "palmbeachpost.com", "spokesman.com",
		"newsobserver.com", "buffalonews.com", "pressherald.com", "charlotteobserver.com",
		"triblive.com", "adn.com", "twincities.com", "impreso.milenio.com",
		"townnews.com", "estrepublicain.fr", "dailymail.com", "lamontagne.fr",
		"dailynews.com", "postandcourier.com", "seattlepi.com", "argentina.indymedia.org",
		"barcelona.indymedia.org", "bayarea.indymedia.org", "rollcall.com", "asiaone.com",
		"lasvegassun.com", "star-telegram.com", "advocate.com", "agi.it",
		"delawareonline.com", "dailyherald.com", "democratandchronicle.com", "avaz.ba",
		"jacksonville.com", "challenges.fr", "largus.fr", "adressa.no",
		"marianne.net", "11alive.com", "mcall.com", "richmond.com",
		"aleteia.org", "madison.com", "lapatilla.com", "pitch.com",
		"pilotonline.com", "knoxnews.com", "sfexaminer.com", "telesurtv.net",
		"heraldtribune.com", "elimparcial.com", "bangordailynews.com", "pressdemocrat.com",
		"tallahassee.com", "winnipegfreepress.com", "omaha.com", "lohud.com",
		"theadvocate.com", "miaminewtimes.com", "ctpost.com", "daytondailynews.com",
		"kentucky.com", "amny.com", "floridatoday.com", "vegas.com",
		"arkansasonline.com", "commercialappeal.com", "austinchronicle.com", "telemundo.com",
		"westword.com", "staradvertiser.com", "deseretnews.com", "gazette.com",
		"goodnewsnetwork.org", "thestate.com", "tulsaworld.com", "heraldnet.com",
		"inforum.com", "bernama.com", "lancasteronline.com", "phoenixnewtimes.com",
		"news-journalonline.com", "ncregister.com", "rgj.com", "senscritique.com",
		"abqjournal.com", "wtsp.com", "metrotimes.com", "dallasobserver.com",
		"ourmidland.com", "kansas.com", "toledoblade.com", "thenewstribune.com",
		"chicagoreader.com", "elnuevodia.com", "naplesnews.com", "timesfreepress.com",
		"armytimes.com", "columbian.com", "fresnobee.com", "idahostatesman.com",
		"sfweekly.com", "news-press.com", "thegazette.com", "audiofanzine.com",
		"tcpalm.com", "elindependiente.com", "dailypress.com", "aciprensa.com",
		"laopinion.com", "journalstar.com", "antiwar.com", "dailycamera.com",
		"unionleader.com", "citizen-times.com", "elpasotimes.com", "santafenewmexican.com",
		"cjonline.com", "nwitimes.com", "seacoastonline.com", "elpais.com.co",
		"houstonpress.com", "independent.com", "lansingstatejournal.com", "signonsandiego.com",
		"cantonrep.com", "sandiegoreader.com", "whec.com", "rgherald.wetpaint.com",
		"registerguard.com", "newsok.com", "dailybreeze.com", "billingsgazette.com",
		"savannahnow.com", "greenvilleonline.com", "hcn.org", "lehighvalleylive.com",
		"montgomeryadvertiser.com", "www1.whdh.com", "news-leader.com", "roanoke.com",
		"goerie.com", "detnews.com", "statesmanjournal.com", "pjstar.com",
		"pnj.com", "eluniversal.com", "argusleader.com", "primerahora.com",
		"clevescene.com", "elconfidencialdigital.com", "vcstar.com", "bianet.org",
		"journalnow.com", "betaseries.com", "dailygazette.com", "elplural.com",
		"riverfronttimes.com", "marinij.com", "sj-r.com", "presstelegram.com",
		"santacruzsentinel.com", "elnuevoherald.com", "burlingtonfreepress.com", "pressofatlanticcity.com",
		"orlandoweekly.com", "notretemps.com", "courierpostonline.com", "greenbaypressgazette.com",
		"coloradoan.com", "southcoasttoday.com", "bakersfield.com", "starnewsonline.com",
		"lubbockonline.com", "periodistadigital.com", "duluthnewstribune.com", "southbendtribune.com",
		"onlineathens.com", "trib.com", "fayobserver.com", "recordonline.com",
		"globovision.com", "tbo.com", "texasobserver.org", "seattleweekly.com",
		"nwaonline.com", "sunherald.com", "ydr.com", "sanluisobispo.com",
		"tuscaloosanews.com", "readingeagle.com", "missoulian.com", "sbsun.com",
		"concordmonitor.com", "balkanweb.com",
	],
	social: [
		// ── Hand-curated ──────────────────────────
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


		// ── ETL: UT1 + Tranco (CC BY-SA 3.0) ──
		// Generated: 2026-03-01 | UT1: c17144c | Tranco: 2026-03-01
		"fbcdn.net", "tiktokcdn.com", "tiktokv.com", "my.opera.com",
		"vk.com", "discord.gg", "gravatar.com", "tiktokcdn-us.com",
		"forum.avast.com", "ok.ru", "facebook.net", "weibo.com",
		"vk.ru", "deviantart.com", "vkontakte.ru", "pinimg.com",
		"fb.com", "myspace.com", "discordapp.com", "disqus.com",
		"livejournal.com", "xiaohongshu.com", "xing.com", "fetlife.com",
		"meetup.com", "douyin.com", "photobucket.com", "addthis.com",
		"digg.com", "badoo.com", "yammer.com", "stumbleupon.com",
		"douban.com", "ning.com", "foursquare.com", "box.net",
		"reverbnation.com", "del.icio.us", "chat.tf1.fr", "buymeacoffee.com",
		"imo.im", "diigo.com", "ravelry.com", "filmaffinity.com",
		"copainsdavant.linternaute.com", "odnoklassniki.ru", "forum.giga.de", "truthsocial.com",
		"ghanaweb.com", "mixi.jp", "forums.appleinsider.com", "delicious.com",
		"musical.ly", "myheritage.com", "plurk.com", "geni.com",
		"mubi.com", "librarything.com", "threadless.com", "tagged.com",
		"couchsurfing.com", "gab.com", "skyrock.com", "forums.mozillazine.org",
		"forums.sonarr.tv", "italki.com", "chatango.com", "chatdesboss.online.fr",
		"mewe.com", "gaiaonline.com", "forum.doctissimo.fr", "squidoo.com",
		"meetme.com", "mocospace.com", "renren.com", "wykop.pl",
		"okcupid.com", "juicer.io", "purevolume.com", "fotka.com",
		"newsvine.com", "viadeo.com", "stylecaster.com", "forum.paradoxplaza.com",
		"socialblade.com", "flixster.com", "minds.com", "fark.com",
		"care2.com", "classmates.com", "azarlive.com", "hi5.com",
		"bolt.com", "anobii.com", "buzznet.com", "multiply.com",
		"xanga.com", "paltalk.com", "fotki.com", "apsense.com",
		"momjunction.com", "bebee.com", "chowhound.com", "aufeminin.com",
		"shoutcast.com", "wwww.myjoyonline.com", "faithlife.com", "cafemom.com",
		"mylife.com", "viddler.com", "taringa.net", "fubar.com",
		"cellufun.com", "parler.com", "bookcrossing.com", "dogster.com",
		"filmow.com", "catster.com", "wamba.com", "friendster.com",
		"orkut.com", "fotolog.com", "bebo.com", "onvasortir.com",
		"jango.com", "mouthshut.com",
	],
	media: [
		// ── Hand-curated ──────────────────────────
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


		// ── ETL: UT1 + Tranco (CC BY-SA 3.0) ──
		// Generated: 2026-03-01 | UT1: c17144c | Tranco: 2026-03-01
		"googlevideo.com", "amazonvideo.com", "ok.ru", "ivi.ru",
		"netflix.net", "video.google.de", "cdnvideo.ru", "nflxvideo.net",
		"rfl.uk.com", "aiv-delivery.net", "ns57.ovh.net", "rutube.ru",
		"pilot.wp.pl", "myspace.com", "music.daum.net", "zed.cbc.ca",
		"video.google.fr", "videos.abc.es", "madeinfoot.ouest-france.fr", "marca.com",
		"bfmtv.com", "aparat.com", "video.lequipe.fr", "lequipe.fr",
		"videos.sapo.pt", "dmm.co.jp", "cricbuzz.com", "video.google.es",
		"filmweb.pl", "ssstik.io", "kooora.com", "video.google.ru",
		"video.google.it", "video.google.nl", "hotstar.com", "midimusic.about.com",
		"mp3.about.com", "radio.about.com", "baseball.about.com", "bicycling.about.com",
		"cheerleading.about.com", "inlineskating.about.com", "proicehockey.about.com", "rodeo.about.com",
		"rowing.about.com", "running.about.com", "skiing.about.com", "snowboarding.about.com",
		"surfing.about.com", "swimming.about.com", "tabletennis.about.com", "volleyball.about.com",
		"bigo.sg", "like.video", "img.photobucket.com", "media.photobucket.com",
		"sharethis.com", "abola.pt", "sport.guardian.co.uk", "digg.com",
		"football.com", "vidazoo.com", "chaosradio.ccc.de", "entertainment.howstuffworks.com",
		"nflxext.com", "stumbleupon.com", "brightcove.com", "libsyn.com",
		"allocine.fr", "fifa.com", "youtube-mp3.org.ru", "live.streamtheworld.com",
		"video.nbcuni.com", "team.discovery.com", "espncdn.com", "dmxleo.com",
		"goal.com", "radiofrance.fr", "vimeocdn.com", "shazam.com",
		"cstatic.weborama.fr", "uefa.com", "smartclip.net", "video.libero.it",
		"rfi.fr", "sportradarserving.com", "medal.tv", "cricket.rediff.com",
		"broadcast.infomaniak.ch", "ustream.tv", "justwatch.com", "clip-video.sfr.fr",
		"singles.sfr.fr", "broadband.biglobe.ne.jp", "tf1.fr", "streamable.com",
		"arte.tv", "streaming.r7.com", "thepiratebay.org", "francetvinfo.fr",
		"cbs.com", "zee5.com", "besoccer.com", "maxpreps.com",
		"video.milliyet.com.tr", "audio.msk.ru", "sport.es", "skylinewebcams.com",
		"videos.lalibre.be", "tf1info.fr", "movie.xunlei.com", "coub.com",
		"streamlabs.com", "bb.goo.ne.jp", "sport.scotsman.com", "onefootball.com",
		"canalplus.com", "footmercato.net", "eurosport.fr", "lance.com.br",
		"medias.purepeople.com", "allmusic.com", "calciomercato.com", "dzcdn.net",
		"tvig.ig.com.br", "esporte.ig.com.br", "teenvogue.com", "starwars.com",
		"heavy.com", "france.tv", "olympic.org", "rugbyrama.fr",
		"notube.lol", "paramount.com", "mxplay.com", "vudu.com",
		"miniclip.com", "runnersworld.com", "discoveryplus.com", "radios.com.br",
		"livestream.eurosport.com", "baseball-reference.com", "sports.fr", "gamedistribution.com",
		"maxifoot.fr", "metacafe.com", "liveleak.com", "mainichi-podcasting.cocolog-nifty.com",
		"megogo.net", "pgatour.com", "viralize.tv", "sebestyenjulia.atw.hu",
		"stream.tvp.pl", "vod.tvp.pl", "101.ru", "tokyvideo.com",
		"nascar.com", "skyrock.com", "logv3.xiti.com", "movieweb.com",
		"mp3party.net", "celluloide.online.fr", "rakuten.tv", "podomatic.com",
		"jcs.art.pl", "rockmetal.art.pl", "cracked.com", "video.arnet.com.ar",
		"winamp.com", "rarbg.to", "notube.net", "music-files.download.com",
		"worldathletics.org", "blip.tv", "cricket.com.au", "espn.co.uk",
		"mymovies.it", "directvgo.com", "perso.numericable.fr", "veoh.com",
		"ncaa.org", "americanradioworks.publicradio.org", "ina.fr", "mxplayer.in",
		"comingsoon.it", "earthcam.com", "soccerway.com", "jaguars.jacksonville.com",
		"epidemicsound.com", "hulkshare.com", "surfline.com", "matchendirect.fr",
		"trovo.live", "radiosaovivo.net", "media.canal-plus.com", "napster.com",
		"allfootballapp.com", "stereogum.com", "skyshowtime.com", "funnyordie.com",
		"mangastore.viz.com", "pri.org", "videoplaza.tv", "buzznet.com",
		"live365.com", "break.com", "crackle.com", "o.aolcdn.com",
		"paralympic.org", "justin.tv", "vidmate.net", "soundclick.com",
		"bcbits.com", "psg.com", "radioparadise.com", "cdnvideo.aufeminin.com",
		"apex.tv.com", "twitch.com", "ultimedia.com", "trutv.com",
		"vh1.com", "usc.rivals.com", "shoutcast.com", "thechive.com",
		"umusic.com", "iihf.com", "realgm.com", "baseball.sportsline.com",
		"basketball.sportsline.com", "mp3dance.miarroba.com", "usta.com", "wmediavod.coltfrance.com",
		"audiofanzine.com", "ww.com", "joblo.com", "bloodyelbow.com",
		"packers.com", "mp3.com", "ussoccer.com", "bein.com",
		"freecaster.com", "toonloon.bizland.com", "europeantour.com", "viddler.com",
		"atresplayer.com", "usopen.org", "dallascowboys.com", "tunecore.com",
		"specialolympics.org", "iconoclaststudios.virtualave.net", "rugbyworldcup.com", "filefactory.com",
		"arefay.20m.com", "numberonemp3.20m.com", "davesvolleyball.20m.com", "imrankhanno1.20m.com",
		"warillasportscricketclub.20m.com", "musicradio.com", "mox.tv", "basic-fit.com",
		"muscleandfitness.com", "steelers.com", "sofoot.com", "grooveshark.com",
		"chicagobears.com", "molotov.tv", "footballfanatics.com", "pga.com",
		"tubi.tv", "wamba.com", "junodownload.com", "y2mate.com",
		"los40.com", "denverbroncos.com", "9c9media.com", "looperman.com",
		"imlive.com", "universalpictures.com", "sportslocalmedia.com", "iris.tv",
		"ugo.com", "wrc.com", "bsport.io", "pdga.com",
		"videos.larioja.com", "iaaf.org", "downloadhelper.net", "jango.com",
		"streamguys.com", "darkentide.freeuk.com", "icecast.org", "triathlon.org",
		"emusic.com", "online-audio-converter.com", "video.mthai.com", "kjzz.org",
		"bild.tv", "windowsmedia.com", "leaguelineup.com", "cdr-trader.8k.com",
		"samplecds.8k.com", "ooyala.com", "joysound.com",
	],
	shopping: [
		// ── Hand-curated ──────────────────────────
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


		// ── ETL: UT1 + Tranco (CC BY-SA 3.0) ──
		// Generated: 2026-03-01 | UT1: c17144c | Tranco: 2026-03-01
		"ozon.ru", "amazon.co.uk", "alibaba.com", "trustpilot.com",
		"amazon.de", "mall.163.com", "taobao.com", "psearch.yahoo.co.jp",
		"shopping.yahoo.co.jp", "amazon.co.jp", "rakuten.co.jp", "shopee.com.br",
		"2000group.uk.com", "bigtall.uk.com", "bikeshop.uk.com", "clothing.uk.com",
		"cordless-phones.uk.com", "couch.uk.com", "directofficesupply.uk.com", "drews.uk.com",
		"flyonthewall.uk.com", "frosts.uk.com", "frox.uk.com", "game.uk.com",
		"gramophones.uk.com", "magicbox.uk.com", "maxwells.uk.com", "mirrormirror.uk.com",
		"rockofages.uk.com", "sofaworkshop.uk.com", "surf.uk.com", "tableware.uk.com",
		"unicycle.uk.com", "alicdn.com", "otto.de", "amazon.fr",
		"amazon.ca", "amazon.in", "shopee.co.id", "amazon.es",
		"amazon.it", "allegro.pl", "mercadolivre.com.br", "ebay.co.uk",
		"ebay.de", "bol.com", "magazineluiza.com.br", "mercadolibre.com.mx",
		"leboncoin.fr", "olx.pl", "leroymerlin.fr", "argos.co.uk",
		"shopping-info.sapo.pt", "elcorteingles.es", "shop.abc.net.au", "books.livedoor.com",
		"mango.com", "ebay.it", "cdiscount.com", "ceneo.pl",
		"subito.it", "mediaexpert.pl", "otomoto.pl", "leguide-shopping.programme-tv.net",
		"skelbiu.lt", "barnesandnoble.com", "russianculture.about.com", "zalando.de",
		"shop.lego.com", "bazos.sk", "shopping.guardian.co.uk", "bookstore.ubc.ca",
		"fotocenter.spb.ru", "action.com", "shopee.ph", "next.co.uk",
		"store.foxsports.com", "olx.ua", "shopee.vn", "espncdn.com",
		"dreamstime.com", "tesco.com", "shopee.sg", "casasbahia.com.br",
		"lazada.sg", "shopifycdn.com", "amazon.nl", "vecteezy.com",
		"shopee.com.my", "amazon.ae", "shopee.co.th", "fnac.com",
		"aliexpress.ru", "shopee.tw", "farfetch.com", "amazon.se",
		"shopping.pchome.com.tw", "dickssportinggoods.com", "ebaystatic.com", "amazon.sa",
		"amazon.pl", "casio.com", "aliexpress.us", "johnlewis.com",
		"gmarket.co.kr", "ebay.ca", "nespresso.com", "netshoes.com.br",
		"bricklink.com", "dhgate.com", "sweetwater.com", "ebay.fr",
		"swarovski.com", "smule.com", "amazon.eg", "harborfreight.com",
		"canadiantire.ca", "mvideo.ru", "skechers.com", "vinted.fr",
		"hsn.com", "mercadolibre.cl", "blocket.se", "thomann.de",
		"mediamarkt.de", "eventim.de", "shop.gnavi.co.jp", "stubhub.com",
		"carrefour.fr", "dior.com", "homeclubs.scholastic.com", "akakce.com",
		"tanken.kuronekoyamato.co.jp", "saksfifthavenue.com", "empik.com", "academy.com",
		"hobbylobby.com", "joom.com", "boots.com", "americanas.com.br",
		"alimentacion.carrefour.es", "dba.dk", "decathlon.fr", "superdrug.com",
		"darty.com", "diy.com", "zalan.do", "tchibo.de",
		"asics.com", "kabum.com.br", "kiabi.com", "2dehands.be",
		"auchan.fr", "cafepress.com", "bigbadtoystore.com", "e.leclerc",
		"but.fr", "shop-apotheke.com", "lidl.com", "euro.com.pl",
		"zalando.fr", "laredoute.fr", "boulanger.com", "vinted.pl",
		"autoscout24.it", "gucci.com", "coupert.com", "avon.com",
		"maurices.com", "conforama.fr", "bazos.cz", "mariefrance.fr",
		"zalando.pl", "grainger.com", "showroomprive.com", "store.babycenter.com",
		"levi.com", "shop.starwars.com", "ss.lv", "llbean.com",
		"electrodepot.fr", "basspro.com", "glitterati.shop-pro.jp", "ebay.ie",
		"shopping.elpais.com.uy", "net-a-porter.com", "ebay.es", "abercrombie.com",
		"primark.com", "trivago.com", "oakley.com", "amazon.cn",
		"books.com.tw", "allegrolokalnie.pl", "belk.com", "sdksupplies.netfirms.com",
		"decathlon.pl", "anthropologie.com", "bathandbodyworks.com", "riverisland.com",
	],
	finance: [
		// ── Hand-curated ──────────────────────────
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


		// ── ETL: UT1 + Tranco (CC BY-SA 3.0) ──
		// Generated: 2026-03-01 | UT1: c17144c | Tranco: 2026-03-01
		"sberbank.ru", "bourse.lefigaro.fr", "caixa.gov.br", "trustarc.com",
		"truste.com", "nubank.com.br", "vtb.ru", "mastercard.com",
		"tax.ny.gov", "bb.com.br", "tetrapolis.spb.ru", "treasury.gov",
		"raiffeisen.ru", "cib.com.cn", "alfabank.ru", "delta.com",
		"mcdonalds.com", "itau.com.br", "citi.com", "santander.com.br",
		"tesco.com", "banki.ru", "bourse.lesechos.fr", "usaa.com",
		"dbs.com", "jp-bank.japanpost.jp", "gazprombank.ru", "westernunion.com",
		"cbr.ru", "ubs.com", "bourse.lepoint.fr", "pb.com",
		"bourse.tf1.fr", "principal.com", "poste.it", "jal.co.jp",
		"bradesco.com.br", "stlouisfed.org", "laposte.fr", "walmart.ca",
		"rshb.ru", "jpmorgan.com", "bancointer.com.br", "financialexpress.com",
		"credit-agricole.fr", "cabourse-2.credit-agricole.fr", "cabourse-908.credit-agricole.fr", "td.com",
		"hdfcbank.com", "santander.com", "boursorama.com", "iberia.com",
		"truoptik.com", "banco.bradesco", "hsbc.com", "citigroup.com",
		"bourse.lexpress.fr", "comerica.com", "morganstanley.com", "sbrf.ru",
		"creditmutuel.fr", "53.com", "labanquepostale.fr", "icicibank.com",
		"navyfederal.org", "sbicard.com", "icbc.com.cn", "energystar.gov",
		"mufg.jp", "financialpost.com", "fisglobal.com", "financialcontent.com",
		"bcb.gov.br", "safeway.com", "sg.fr", "commbank.com.au",
		"fdic.gov", "santander.co.uk", "cic.fr", "tcmb.gov.tr",
		"rabobank.com", "axa.com", "cibc.com", "creditonebank.com",
		"adb.org", "bourse.latribune.fr", "mtb.com", "vw.com",
		"abnamro.nl", "bancolombia.com", "six-group.com", "commercial.hsbc.com.hk",
		"nab.com.au", "nationwide.com", "pkb.ru", "citizensbank.com",
		"psbank.ru", "secu.slb.com", "rabobank.nl", "bbva.es",
		"manta.com", "denizbank.com", "bancosantander.es", "nationwide.co.uk",
		"rbc.com", "metcom.ru", "halykbank.kz", "rbi.org.in",
		"comdirect.de", "scotiabank.com", "hktdc.com", "credit-suisse.com",
		"postbank.de", "hsbc.co.uk", "shoppersdrugmart.ca", "firstdata.com",
		"fr.advfn.com", "royalbank.com", "dnb.no", "ing.nl",
		"fiserv.com", "mts.by", "ica.se", "nbp.pl",
		"isbank.com.tr", "thrivent.com", "westpac.com.au", "boursobank.com",
		"qiwi.com", "kasikornbank.com", "axisbank.com", "santanderbank.com",
		"commerzbank.com", "piraeusbank.gr", "pichincha.com", "natwest.com",
		"unicreditgroup.eu", "inter.co", "ebrd.com", "huntington.com",
		"viabcp.com", "bnpparibas.com", "intesasanpaolo.com", "rbcroyalbank.com",
		"icba.nm.org", "zonebourse.com", "anz.com", "discoverfinancial.com",
		"e-i.com", "finansbank.com", "statestreet.com", "societegenerale.com",
		"emiratesnbd.com", "firstcitizens.com", "kbstar.com", "akbank.com",
		"ncsecu.org", "csiweb.com", "corebridgefinancial.com", "wegmans.com",
		"wooribank.com", "transcapital.com", "kotak.com", "efinancialcareers.com",
		"svb.com", "onemainfinancial.com", "hangseng.com", "davivienda.com",
		"ngam.natixis.com", "mabanque.bnpparibas", "gmfinancial.com", "boursier.com",
		"hyundaicard.com", "abcfinancial.com", "magnolia.com", "lincolnfinancial.com",
		"pse.com", "kbcard.com", "unionbankph.com", "netit.financial-net.com",
		"financial-net.com", "bforbank.com", "banquemisr.com", "cebbank.com",
		"lloydsbankinggroup.com", "merrickbank.com", "bbt.com", "indusind.com",
		"vtb.com", "gfmag.com", "cibeg.com", "bmoharris.com",
	],
	ai_tools: [
		// ── Hand-curated ──────────────────────────
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


		// ── ETL: UT1 + Tranco (CC BY-SA 3.0) ──
		// Generated: 2026-03-01 | UT1: c17144c | Tranco: 2026-03-01
		"lumo.proton.me", "yuewen.cn", "so.360.com", "z.ai",
		"getliner.com", "typeset.io",
	],
	personal: [
		// ── Hand-curated ──────────────────────────
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


		// ── ETL: UT1 + Tranco (CC BY-SA 3.0) ──
		// Generated: 2026-03-01 | UT1: c17144c | Tranco: 2026-03-01
		"marmiton.org", "cuisineaz.com", "750g.com",
	],
	education: [
		// ── Hand-curated ──────────────────────────
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
		// ── Hand-curated ──────────────────────────
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


		// ── ETL: UT1 + Tranco (CC BY-SA 3.0) ──
		// Generated: 2026-03-01 | UT1: c17144c | Tranco: 2026-03-01
		"unity3d.com", "gravatar.com", "steamserver.net", "applovin.com",
		"shockrave.macromedia.com", "playstation.net", "chill.comcast.net", "gameinvasion.comcast.net",
		"playgames.comcast.net", "is1-ssl.mzstatic.com", "igel.t-online.de", "onspiele.t-online.de",
		"xboxlive.com", "puzzles.telegraph.co.uk", "nvidia.com", "bnet.163.com",
		"buff.163.com", "cg.163.com", "game.163.com", "party.163.com",
		"steamcommunity.com", "gamepass.com", "games.yahoo.co.jp", "kids.yahoo.co.jp",
		"bigbadxxxlan.eventbrite.com", "netease.com", "rbxcdn.com", "puzzles.independent.co.uk",
		"cdsystems.uk.com", "dataform.uk.com", "ghostlight.uk.com", "soldout.uk.com",
		"fandom.com", "cordygame.appspot.com", "dragongame-prod.appspot.com", "indianbridge.appspot.com",
		"word-search-puzzles.appspot.com", "riotgames.com", "spiele.spiegel.de", "arcade.lemonde.fr",
		"steamstatic.com", "pvp.net", "tencent.com", "secure-us.imrworldwide.com",
		"e-story.dyndns.org", "sourcery.dyndns.org", "nintendo.net", "chess.com",
		"nationalgeographic.com", "poki.com", "hardle.herokuapp.com", "terraforming-mars.herokuapp.com",
		"crazygames.com", "epicgames.dev", "4dex.io", "bestminenn.ddns.net",
		"jeux.ouest-france.fr", "games.1c.ru", "ubi.com", "free-games.eu.com",
		"hltv.org", "bet365.com", "jogos.sapo.pt", "games.dmm.co.jp",
		"lichess.org", "game.livedoor.com", "riotcdn.net", "happywheels.us.com",
		"aternos.org", "funpay.com", "futbin.com", "coolmathgames.com",
		"asuracomic.net", "cardgames.io", "toyhou.se", "linkvertise.com",
		"starlink.com", "overwolf.com", "inven.co.kr", "mbga.jp",
		"boardgamearena.com", "game8.jp", "ruliweb.com", "cardmarket.com",
		"arca.live", "gamewith.jp", "aether.in.net", "skipthegames.com",
		"gree-pf.net", "game.amd.com", "girl.typepad.com", "rpgblog.typepad.com",
		"furcadia.meetup.com", "mtg.meetup.com", "boardgames.about.com", "chess.about.com",
		"compactiongames.about.com", "compsimgames.about.com", "horseracing.about.com", "internetgames.about.com",
		"nintendo.about.com", "sportsgambling.about.com", "vgstrategies.about.com", "games.mirror.co.uk",
		"wowhead.com", "garena.com", "playhop.com", "oyun.mynet.com",
		"i1237.photobucket.com", "gameanalytics.com", "shop.olympics.com", "a.tribalfusion.com",
		"lego.com", "granbluefantasy.jp", "mediago.io", "unity.com",
		"discordapp.net", "armataducale.altervista.org", "arya.altervista.org", "bigame.altervista.org",
		"bve.altervista.org", "carplele.altervista.org", "culturavg.altervista.org", "darkelf.altervista.org",
		"drakonia.altervista.org", "dxblade.altervista.org", "erciccio.altervista.org", "fantasyreign.altervista.org",
		"gameszoo.altervista.org", "giochionlineita.altervista.org", "golarion.altervista.org", "gosclient.altervista.org",
		"jillvirus.altervista.org", "meh.altervista.org", "odixea.altervista.org", "phargon.altervista.org",
		"planetside.altervista.org", "stickmangames.altervista.org", "steamcontent.com", "unrealengine.com",
		"games.kde.org", "bimboo.sakura.ne.jp", "xboxservices.com", "wikia.com",
		"nylottery.ny.gov", "cpmstar.com", "sie.sony.com", "station.sony.com",
		"bluespringsbridge.webs.com", "deoplace.webs.com", "elygamesday.webs.com", "fortwilliambridgeclub.webs.com",
		"godz-clan-dukezap1.webs.com", "hardcola.webs.com", "kcndbc.webs.com", "mknovels.webs.com",
		"nintenfmbyhyrulianhero97.webs.com", "ozhammer.webs.com", "pilesoflead.webs.com", "pokefreak437.webs.com",
		"roystonchessclub.webs.com", "sim-wolf.webs.com", "sm64no1lolhacks.webs.com", "thetwentyminuters.webs.com",
		"trevyspainting.webs.com", "easybrain.com", "zynga.com", "logic-games.spb.ru",
		"games.yahoo.net", "theadventuringparty.libsyn.com", "games.disney.com", "games.aarp.org",
		"edgeflow-01.webflow.io", "spiele.heise.de", "kuaishou.com", "nokia.com",
		"usa.philips.com", "cs-games.net.ru", "aq-3d.wikidot.com", "aqwwiki.wikidot.com",
		"backrooms-wiki-cn.wikidot.com", "dnd5e.wikidot.com", "dnd5ed.wikidot.com", "eberronunlimited.wikidot.com",
		"gdnd.wikidot.com", "mahjong.wikidot.com", "pax.wikidot.com", "pbbg.wikidot.com",
		"spheresofpower.wikidot.com", "therafimrpg.wikidot.com", "trb-mux.wikidot.com", "warisunlimited.wikidot.com",
		"nexon.com", "demos.blackberry.com", "minihry.azet.sk", "games.cosmopolitan.com",
		"vkplay.ru", "konami.net", "ra.afraid.org", "selfesteemgames.mcgill.ca",
	],
	writing: [
		// ── Hand-curated ──────────────────────────
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
		// ── Hand-curated ──────────────────────────
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
