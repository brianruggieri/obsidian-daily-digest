/**
 * Sensitivity Filter — Built-in domain categorization for privacy filtering.
 *
 * Provides a curated, categorized domain list covering content categories that
 * users commonly want to exclude from daily activity digests: adult content,
 * gambling, dating, health portals, financial services, etc.
 *
 * Architecture:
 *   - Built-in domain list (~1500 domains across 11 categories) compiled into the plugin
 *   - User-configurable custom domain additions
 *   - Two actions: "exclude" (remove from output entirely) or "redact" (replace with category label)
 *   - Integrates with the sanitization pipeline before categorization
 *
 * Domain sources inspired by community blocklists (StevenBlack/hosts, UT1, HaGeZi)
 * but curated and trimmed to a reasonable size for an Obsidian plugin.
 */

import { BrowserVisit, SensitivityCategory, SensitivityConfig, SensitivityFilterResult } from "./types";

// ── Domain Lists by Category ────────────────────────────

// Each category contains a mix of:
//   - Exact domains (matched against hostname)
//   - Partial matches (matched with .includes() for subdomains)
//
// Lists are intentionally kept to well-known, high-traffic domains.
// Users can extend with custom domains for niche sites.

const ADULT_DOMAINS: string[] = [
	// Major adult content platforms
	"pornhub.com", "xvideos.com", "xnxx.com", "xhamster.com",
	"redtube.com", "youporn.com", "tube8.com", "spankbang.com",
	"brazzers.com", "bangbros.com", "realitykings.com", "naughtyamerica.com",
	"mofos.com", "digitalplayground.com", "wicked.com", "evilangel.com",
	"kink.com", "chaturbate.com", "myfreecams.com", "livejasmin.com",
	"cam4.com", "stripchat.com", "bongacams.com", "camsoda.com",
	"onlyfans.com", "fansly.com", "manyvids.com", "clips4sale.com",
	"porntrex.com", "eporner.com", "beeg.com", "hclips.com",
	"txxx.com", "vporn.com", "drtuber.com", "sunporno.com",
	"tnaflix.com", "empflix.com", "pornone.com", "4tube.com",
	"porn.com", "sex.com", "xxxbunker.com", "fuq.com",
	"thumbzilla.com", "pornpics.com", "hentaihaven.xxx", "nhentai.net",
	"hanime.tv", "rule34.xxx", "e-hentai.org", "gelbooru.com",
	"danbooru.donmai.us", "literotica.com", "asstr.org",
	"imagefap.com", "motherless.com", "heavy-r.com",
	// Escort / hookup-adjacent
	"backpage.com", "bedpage.com", "skipthegames.com",
	"eros.com", "tryst.link", "slixa.com",
];

const GAMBLING_DOMAINS: string[] = [
	// Online casinos & sportsbooks
	"draftkings.com", "fanduel.com", "betmgm.com", "caesars.com",
	"bet365.com", "williamhill.com", "paddypower.com", "betfair.com",
	"unibet.com", "888.com", "pokerstars.com", "partypoker.com",
	"bovada.lv", "betonline.ag", "mybookie.ag", "betway.com",
	"betrivers.com", "pointsbet.com", "twinspires.com", "xbet.ag",
	"stake.com", "roobet.com", "bc.game", "rollbit.com",
	// Lottery & bingo
	"lottery.com", "jackpocket.com", "lottoland.com",
	// Sports betting info
	"oddschecker.com", "actionnetwork.com", "covers.com",
	// Casino review/affiliate sites
	"askgamblers.com", "casinoguru.com", "wizard-of-odds.com",
	// Fantasy / prediction
	"prizepicks.com", "underdog.io", "sleeper.com",
	// Crypto gambling
	"bitcasino.io", "fortunejack.com", "cloudbet.com",
];

const DATING_DOMAINS: string[] = [
	// Major dating platforms
	"tinder.com", "bumble.com", "hinge.co", "match.com",
	"okcupid.com", "plentyoffish.com", "pof.com", "zoosk.com",
	"eharmony.com", "elitesingles.com", "silversingles.com",
	"ourtime.com", "christianmingle.com", "jdate.com",
	"coffee-meets-bagel.com", "happn.com", "badoo.com",
	"meetme.com", "tagged.com", "skout.com",
	// Hookup-focused
	"grindr.com", "scruff.com", "jackd.com", "hornet.com",
	"feeld.co", "3fun.co", "pureapp.com",
	// Sugar dating
	"seeking.com", "seekingarrangement.com", "sugardaddymeet.com",
	// International
	"tantan.com", "momo.com", "lovoo.com", "meetic.com",
	// Niche
	"farmersonly.com", "theleague.com", "raya.com",
];

const HEALTH_DOMAINS: string[] = [
	// Health portals & patient records
	"mycharthealth.com", "mychart.com", "patient.info",
	"webmd.com", "mayoclinic.org", "healthline.com", "medlineplus.gov",
	"nhs.uk", "drugs.com", "rxlist.com", "goodrx.com",
	// Telehealth
	"teladoc.com", "amwell.com", "mdlive.com", "doctorondemand.com",
	"hims.com", "forhers.com", "cerebral.com", "brightside.com",
	"betterhelp.com", "talkspace.com", "regain.us",
	// Mental health specific
	"psychologytoday.com", "nami.org", "samhsa.gov",
	"crisistextline.org", "suicidepreventionlifeline.org",
	// Health insurance
	"healthcare.gov", "anthem.com", "cigna.com", "aetna.com",
	"unitedhealthcare.com", "humana.com", "bcbs.com",
	"kaiserpermanente.org", "oscar.com",
	// Fertility / reproductive
	"babycenter.com", "whattoexpect.com", "thebump.com",
	"plannedparenthood.org", "fertilityiq.com",
	// Pharmacy / prescriptions
	"cvs.com/pharmacy", "walgreens.com/pharmacy", "capsule.com",
	"alto.com", "pillpack.com",
	// Lab results
	"questdiagnostics.com", "labcorp.com",
	// Conditions / support
	"cancer.org", "diabetes.org", "heart.org",
	"alz.org", "epilepsy.com",
];

const FINANCE_DOMAINS: string[] = [
	// Banking
	"chase.com", "bankofamerica.com", "wellsfargo.com", "citi.com",
	"usbank.com", "pnc.com", "tdbank.com", "capitalone.com",
	"ally.com", "discover.com", "marcus.com", "synchrony.com",
	"sofi.com", "chime.com", "current.com", "varo.com",
	// Investment / brokerage
	"schwab.com", "fidelity.com", "vanguard.com", "etrade.com",
	"tdameritrade.com", "robinhood.com", "webull.com", "m1finance.com",
	"interactivebrokers.com", "tastyworks.com", "tradestation.com",
	// Crypto exchanges
	"coinbase.com", "binance.com", "kraken.com", "gemini.com",
	"crypto.com", "ftx.com", "kucoin.com", "bitfinex.com",
	"bitstamp.net", "gate.io",
	// Tax / accounting
	"turbotax.com", "hrblock.com", "taxact.com", "freetaxusa.com",
	"irs.gov", "ssa.gov",
	// Credit
	"creditkarma.com", "experian.com", "equifax.com", "transunion.com",
	"annualcreditreport.com", "myfico.com",
	// Payment / fintech
	"paypal.com", "venmo.com", "zelle.com", "cashapp.com",
	"stripe.com/dashboard", "plaid.com",
	// Insurance
	"geico.com", "progressive.com", "statefarm.com", "allstate.com",
	"lemonade.com", "policygenius.com",
	// Loans / mortgage
	"lendingtree.com", "rocket.com", "better.com", "sofi.com/loans",
	"upstart.com", "prosper.com", "lendingclub.com",
];

const DRUGS_DOMAINS: string[] = [
	// Cannabis dispensaries & info
	"leafly.com", "weedmaps.com", "dutchie.com", "iheartjane.com",
	"eaze.com", "stiiizy.com", "curaleaf.com", "trulieve.com",
	"crescolabs.com", "greenthumbindustries.com",
	// Drug info / harm reduction
	"erowid.org", "bluelight.org", "drugs-forum.com",
	"psychonautwiki.org", "tripsit.me",
	// Vaping
	"juul.com", "njoy.com", "vaporfi.com", "elementvape.com",
	// Nootropics / supplements
	"nootropicsdepot.com", "ceretropic.com",
];

const WEAPONS_DOMAINS: string[] = [
	// Firearms retailers
	"budsgunshop.com", "palmettostatearmory.com", "brownells.com",
	"midwayusa.com", "cheaperthandirt.com", "ammo.com",
	"luckygunner.com", "sgammo.com", "natchezss.com",
	"grabagun.com", "gunbroker.com", "armslist.com",
	// Knife / tactical
	"bladehq.com", "knifecenter.com", "benchmade.com",
	// Manufacturer sites
	"smith-wesson.com", "glock.com", "sigsauer.com",
	"ruger.com", "beretta.com", "colt.com", "remington.com",
	"springfield-armory.com", "danieldefense.com",
	// Organizations / forums
	"nra.org", "ar15.com", "thefirearmblog.com",
];

const PIRACY_DOMAINS: string[] = [
	// Torrent sites
	"thepiratebay.org", "1337x.to", "rarbg.to", "nyaa.si",
	"yts.mx", "torrentgalaxy.to", "limetorrents.info",
	"torrentz2.eu", "eztv.re", "rutracker.org",
	"fitgirl-repacks.site", "dodi-repacks.site",
	// Streaming piracy
	"fmovies.to", "123movies.la", "putlocker.vip",
	"solarmovie.pe", "gomovies.sx", "soap2day.to",
	"bflix.to", "flixtor.to", "hdtoday.tv",
	// Sports streaming
	"crackstreams.is", "sportsurge.net", "buffstreams.tv",
	"totalsportek.com", "firstrowsports.eu",
	// Anime piracy
	"gogoanime.tel", "9anime.to", "animixplay.to",
	"zoro.to", "animepahe.com",
	// Software piracy
	"getintopc.com", "filecr.com", "1337x.to",
	// Hosting / cyberlockers often used for piracy
	"mega.nz", "rapidgator.net", "uploaded.net", "nitroflare.com",
];

const VPN_PROXY_DOMAINS: string[] = [
	// VPN services
	"nordvpn.com", "expressvpn.com", "surfshark.com", "cyberghostvpn.com",
	"protonvpn.com", "privateinternetaccess.com", "mullvad.net",
	"windscribe.com", "hide.me", "purevpn.com", "ipvanish.com",
	"strongvpn.com", "tunnelbear.com", "hotspotshield.com",
	"avast.com/secureline-vpn", "norton.com/products/norton-secure-vpn",
	// Proxy services
	"hidemyass.com", "kproxy.com", "proxysite.com",
	"whoer.net", "browserleaks.com",
	// DNS privacy
	"nextdns.io", "controld.com",
];

const JOB_SEARCH_DOMAINS: string[] = [
	// Job boards
	"linkedin.com/jobs", "indeed.com", "glassdoor.com",
	"ziprecruiter.com", "monster.com", "careerbuilder.com",
	"dice.com", "hired.com", "angel.co/jobs", "wellfound.com",
	"levels.fyi", "blind.com", "teamblind.com",
	// Freelance
	"upwork.com", "fiverr.com", "toptal.com", "freelancer.com",
	// Remote work
	"weworkremotely.com", "remoteok.com", "flexjobs.com",
	"remote.co", "workingnomads.co",
	// Salary / interview prep
	"salary.com", "payscale.com", "comparably.com",
	"leetcode.com", "hackerrank.com", "interviewbit.com",
	// Government
	"usajobs.gov",
];

const SOCIAL_PERSONAL_DOMAINS: string[] = [
	// Dating apps already covered above; this is social/personal
	// that might be embarrassing in a work-context daily note
	"reddit.com/r/tifu", "reddit.com/r/confessions",
	"reddit.com/r/relationship_advice", "reddit.com/r/amitheasshole",
	"reddit.com/r/offmychest", "reddit.com/r/unpopularopinion",
	"whisper.sh", "postsecret.com",
	// Gossip / celebrity
	"tmz.com", "perezhilton.com", "dlisted.com",
	"deuxmoi.com", "crazydaysandnights.net",
	// Personal ads / classifieds
	"craigslist.org/personals",
	// Astrology / psychic
	"co-star.com", "astro.com", "kasamba.com", "keen.com",
	"california-psychics.com",
	// Confessional / anonymous
	"yikyak.com",
];

// ── Email Tracker Domains ──────────────────────────────
//
// Email click-tracker redirect hops: intermediary URLs that appear in browser
// history when clicking a link inside a marketing email. They carry zero content
// signal — they only identify which campaign/send/click-event referred the visit.
//
// Sources: Disconnect.me Tracker Protection List (EmailAggressive category),
// https://github.com/disconnectme/disconnect-tracking-protection
//
// Matching note: sensitivity.ts uses suffix matching, so listing "ct.sendgrid.net"
// also catches "u1234567.ct.sendgrid.net". Root ESP domains (mandrillapp.com,
// rs6.net, etc.) are tracking-only — they have no browsable content of their own.
const TRACKER_DOMAINS: string[] = [
	// SendGrid (Twilio) — click redirects via ct.sendgrid.net/u{id} subdomains
	"ct.sendgrid.net",
	// Mailchimp (Intuit) — tracking + Mandrill transactional redirect domains
	"list-manage.com",      // Mailchimp click/unsubscribe redirect host
	"mandrillapp.com",      // Mandrill transactional email
	"mailchi.mp",           // Mailchimp shortlink redirect service
	// Constant Contact
	"rs6.net",              // r20.rs6.net and variants
	// HubSpot
	"hubspotemail.net",
	"hsms06.com",
	"hs-email.click",
	// Salesforce / ExactTarget / Pardot
	"exacttarget.com",
	"exct.net",
	"pardot.com",
	// ActiveCampaign
	"acemlna.com",
	"acemlnb.com",
	"acemlnc.com",
	"acemlnd.com",
	"activehosted.com",
	// Marketo (Adobe) — click-tracker subdomains only, not the full marketo.com docs site
	"click.marketo.com",
	"mktoweb.com",
	// Campaign Monitor / Marigold
	"createsend.com",
	// Klaviyo — email tracking domain is separate from klaviyo.com
	"klaviyomail.com",
	// Braze — click-tracker subdomain only
	"click.braze.com",
	"link.braze.com",
	// Iterable
	"click.iterable.com",
	"links.iterable.com",
	// ConvertKit
	"convertkit-mail.com",
	"convertkit-mail2.com",
	"convertkit-mail3.com",
	// Postmark
	"pstmrk.it",
	// Sailthru
	"link.e.sailthru.com",
	// Misc / seen in real browser history
	"messaginganalytics.athena.io",
];

// ── Auth Flow Domains ──────────────────────────────────
//
// OAuth / SSO identity-provider intermediary pages: login screens, consent dialogs,
// and token-exchange endpoints that appear between clicking "Log in" and arriving
// at the destination app. None of these pages contain browsing content.
//
// Note: accounts.google.com is already excluded via EXCLUDE_DOMAINS in types.ts.
// Listed here as well so users can toggle the category independently.
const AUTH_DOMAINS: string[] = [
	// Google (also in EXCLUDE_DOMAINS; listed here for category visibility)
	"accounts.google.com",
	// Microsoft identity platform
	"login.microsoftonline.com",
	"login.live.com",
	"login.windows.net",
	"account.microsoft.com",
	// Apple ID
	"appleid.apple.com",
	"idmsa.apple.com",
	// Salesforce
	"login.salesforce.com",
	// GitHub OAuth flow path (path-prefix match catches /login/oauth/authorize etc.)
	"github.com/login/oauth",
	// Healthcare / athena
	"myidentity.platform.athenahealth.com",
	"identity.athenahealth.com",
	// Okta — okta.com suffix match catches company.okta.com auth portals
	// (okta.com root is also a product site, but auth portals are the primary use case)
	"okta.com",
	// Auth0 — auth0.com suffix match catches company.auth0.com tenant portals
	"auth0.com",
	// Google Workspace SAML
	"sso.google.com",
];

// ── Category Registry ──────────────────────────────────

interface CategoryInfo {
	label: string;
	description: string;
	domains: string[];
}

const CATEGORY_REGISTRY: Record<SensitivityCategory, CategoryInfo> = {
	adult: {
		label: "Adult Content",
		description: "Adult entertainment, explicit content, escort services",
		domains: ADULT_DOMAINS,
	},
	gambling: {
		label: "Gambling & Betting",
		description: "Online casinos, sportsbooks, lotteries, crypto gambling",
		domains: GAMBLING_DOMAINS,
	},
	dating: {
		label: "Dating & Relationships",
		description: "Dating apps, matchmaking, hookup platforms",
		domains: DATING_DOMAINS,
	},
	health: {
		label: "Health & Medical",
		description: "Patient portals, telehealth, prescriptions, mental health, insurance",
		domains: HEALTH_DOMAINS,
	},
	finance: {
		label: "Banking & Finance",
		description: "Banks, brokerages, crypto exchanges, tax, credit, insurance, loans",
		domains: FINANCE_DOMAINS,
	},
	drugs: {
		label: "Drugs & Substances",
		description: "Cannabis dispensaries, drug info, vaping, nootropics",
		domains: DRUGS_DOMAINS,
	},
	weapons: {
		label: "Weapons & Firearms",
		description: "Gun retailers, ammunition, tactical gear, firearms forums",
		domains: WEAPONS_DOMAINS,
	},
	piracy: {
		label: "Piracy & Torrents",
		description: "Torrent sites, pirated streaming, cracked software",
		domains: PIRACY_DOMAINS,
	},
	vpn_proxy: {
		label: "VPN & Proxy",
		description: "VPN services, proxy tools, DNS privacy (may indicate circumvention)",
		domains: VPN_PROXY_DOMAINS,
	},
	job_search: {
		label: "Job Search",
		description: "Job boards, salary info, interview prep, freelance platforms",
		domains: JOB_SEARCH_DOMAINS,
	},
	social_personal: {
		label: "Personal & Sensitive Social",
		description: "Confessional forums, gossip, astrology, personal ads",
		domains: SOCIAL_PERSONAL_DOMAINS,
	},
	tracker: {
		label: "Email Trackers",
		description: "Email marketing click-tracker redirects (SendGrid, Mailchimp, HubSpot, etc.) — intermediary hops with no browsable content",
		domains: TRACKER_DOMAINS,
	},
	auth: {
		label: "Auth / SSO Flows",
		description: "OAuth consent screens and identity-provider login pages (Microsoft, Apple, Okta, Auth0, etc.) — authentication intermediaries",
		domains: AUTH_DOMAINS,
	},
	custom: {
		label: "Custom",
		description: "Your personal exclusion list",
		domains: [],
	},
};

// ── Exported Helpers ───────────────────────────────────

export function getCategoryInfo(): Record<SensitivityCategory, { label: string; description: string; count: number }> {
	const info: Record<string, { label: string; description: string; count: number }> = {};
	for (const [key, val] of Object.entries(CATEGORY_REGISTRY)) {
		info[key] = {
			label: val.label,
			description: val.description,
			count: val.domains.length,
		};
	}
	return info as Record<SensitivityCategory, { label: string; description: string; count: number }>;
}

export function getTotalBuiltinDomains(): number {
	let total = 0;
	for (const cat of Object.values(CATEGORY_REGISTRY)) {
		total += cat.domains.length;
	}
	return total;
}

// ── Domain Matching ────────────────────────────────────

/**
 * Build a fast lookup structure from the enabled categories + custom domains.
 * Returns a Set of exact domains and an array of partial patterns.
 *
 * Matching strategy:
 *   - Exact match: domain === entry (e.g. "pornhub.com")
 *   - Suffix match: domain ends with ".entry" (catches subdomains like "www.pornhub.com")
 *   - Path prefix: for entries with "/" (e.g. "reddit.com/r/tifu"), check if url starts with it
 */
interface DomainMatcher {
	exactDomains: Set<string>;
	pathPrefixes: Map<string, string[]>;  // domain → [path prefixes]
	categoryMap: Map<string, SensitivityCategory>;
}

function buildMatcher(config: SensitivityConfig): DomainMatcher {
	const exactDomains = new Set<string>();
	const pathPrefixes = new Map<string, string[]>();
	const categoryMap = new Map<string, SensitivityCategory>();

	function addDomain(raw: string, category: SensitivityCategory): void {
		const d = raw.toLowerCase().trim();
		if (!d) return;

		const slashIdx = d.indexOf("/");
		if (slashIdx > 0) {
			// Has a path component: domain/path
			const domain = d.substring(0, slashIdx);
			const path = d.substring(slashIdx);
			if (!pathPrefixes.has(domain)) {
				pathPrefixes.set(domain, []);
			}
			pathPrefixes.get(domain)!.push(path);
			categoryMap.set(d, category);
		} else {
			exactDomains.add(d);
			categoryMap.set(d, category);
		}
	}

	// Add domains from each enabled category
	for (const cat of config.categories) {
		const info = CATEGORY_REGISTRY[cat];
		if (info) {
			for (const domain of info.domains) {
				addDomain(domain, cat);
			}
		}
	}

	// Add custom domains
	for (const domain of config.customDomains) {
		addDomain(domain, "custom");
	}

	return { exactDomains, pathPrefixes, categoryMap };
}

function matchDomain(
	hostname: string,
	pathname: string,
	matcher: DomainMatcher
): SensitivityCategory | null {
	const h = hostname.toLowerCase().replace(/^www\./, "");

	// 1. Exact domain match
	if (matcher.exactDomains.has(h)) {
		return matcher.categoryMap.get(h) || null;
	}

	// 2. Suffix match (subdomain of a listed domain)
	for (const domain of matcher.exactDomains) {
		if (h.endsWith("." + domain)) {
			return matcher.categoryMap.get(domain) || null;
		}
	}

	// 3. Path prefix match (e.g. reddit.com/r/tifu)
	const pathPrefixes = matcher.pathPrefixes.get(h);
	if (pathPrefixes) {
		const lowerPath = pathname.toLowerCase();
		for (const prefix of pathPrefixes) {
			if (lowerPath.startsWith(prefix)) {
				return matcher.categoryMap.get(h + prefix) || null;
			}
		}
	}

	// Also check if hostname is subdomain of a path-prefix domain
	for (const [domain, prefixes] of matcher.pathPrefixes.entries()) {
		if (h.endsWith("." + domain) || h === domain) {
			const lowerPath = pathname.toLowerCase();
			for (const prefix of prefixes) {
				if (lowerPath.startsWith(prefix)) {
					return matcher.categoryMap.get(domain + prefix) || null;
				}
			}
		}
	}

	return null;
}

// ── Main Filter Function ───────────────────────────────

export function filterSensitiveDomains(
	visits: BrowserVisit[],
	config: SensitivityConfig
): SensitivityFilterResult {
	if (!config.enabled || (config.categories.length === 0 && config.customDomains.length === 0)) {
		return { kept: visits, filtered: 0, byCategory: {} };
	}

	const matcher = buildMatcher(config);
	const kept: BrowserVisit[] = [];
	let filtered = 0;
	const byCategory: Record<string, number> = {};

	for (const visit of visits) {
		let hostname = "";
		let pathname = "/";
		try {
			const url = new URL(visit.url);
			hostname = url.hostname;
			pathname = url.pathname;
		} catch {
			// Can't parse URL — keep it
			kept.push(visit);
			continue;
		}

		const matchedCategory = matchDomain(hostname, pathname, matcher);

		if (matchedCategory) {
			filtered++;
			byCategory[matchedCategory] = (byCategory[matchedCategory] || 0) + 1;

			if (config.action === "redact") {
				// Keep the visit but redact URL and title
				const catLabel = CATEGORY_REGISTRY[matchedCategory]?.label || matchedCategory;
				kept.push({
					...visit,
					url: `https://${hostname}/[FILTERED]`,
					title: `[${catLabel}]`,
					domain: hostname,
				});
			}
			// If action is "exclude", we skip it entirely
		} else {
			kept.push(visit);
		}
	}

	return { kept, filtered, byCategory };
}

// ── Search Query Sensitivity Filter ────────────────────
// Filters search queries that reference sensitive domains

export function filterSensitiveSearches(
	searches: { query: string; time: Date | null; engine: string }[],
	config: SensitivityConfig
): { kept: typeof searches; filtered: number } {
	if (!config.enabled || (config.categories.length === 0 && config.customDomains.length === 0)) {
		return { kept: searches, filtered: 0 };
	}

	const matcher = buildMatcher(config);
	const kept: typeof searches = [];
	let filtered = 0;

	for (const search of searches) {
		// Check if any sensitive domain appears in the search query
		const queryLower = search.query.toLowerCase();
		let isSensitive = false;

		for (const domain of matcher.exactDomains) {
			if (queryLower.includes(domain)) {
				isSensitive = true;
				break;
			}
		}

		if (isSensitive) {
			filtered++;
			if (config.action === "redact") {
				kept.push({ ...search, query: "[SENSITIVE_SEARCH]" });
			}
		} else {
			kept.push(search);
		}
	}

	return { kept, filtered };
}
