/**
 * url-display.ts
 *
 * Display-only URL cleanup for the renderer. Called at render time only.
 * Never modifies BrowserVisit.url — the original URL is preserved in memory,
 * in AI prompts, and in any debug output.
 *
 * Two-layer approach:
 *   Layer 1: Strip known tracking/noise query parameters
 *   Layer 2: Collapse known redirect/wrapper domains to a readable label
 *   Fallback: Truncate at 120 chars at a segment boundary
 */

const MAX_DISPLAY_LENGTH = 120;

const DISPLAY_STRIP_PARAMS = new Set([
	// Universal campaign/ad-click
	"utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
	"utm_name", "utm_cid", "utm_reader",

	// Platform click IDs
	"gclid", "gclsrc",            // Google Ads / DoubleClick
	"gbraid", "wbraid",           // Google Ads (iOS14+ privacy-preserving)
	"fbclid", "igshid",           // Facebook / Instagram
	"msclkid",                    // Microsoft Advertising / Bing
	"twclid",                     // Twitter / X
	"ttclid",                     // TikTok Ads
	"li_fat_id",                  // LinkedIn
	"epik",                       // Pinterest
	"scid",                       // Snapchat
	"yclid",                      // Yandex

	// HubSpot
	"_hsenc", "_hsmi",

	// Mailchimp
	"mc_cid", "mc_eid",

	// Marketo
	"mkt_tok",

	// Vero
	"vero_conv", "vero_id",

	// LinkedIn email-specific
	"trk", "trkemail", "trackingid", "refid", "lipi",
	"midtoken", "midsig", "eid", "otptoken",

	// Matomo / Piwik
	"pk_campaign", "pk_kwd", "pk_source", "pk_medium", "pk_content",

	// Adobe Analytics
	"icid", "ICID",

	// Miscellaneous click tracking
	"ncid", "nr_email_referer",
	"si",               // YouTube/Spotify share session
	"feature",          // YouTube feature tracking

	// Google search internal (no semantic content)
	"ved", "ei", "uact", "sxsrf", "rlz",

	// Amazon product/session noise
	"qid", "srs", "camp", "creative", "linkCode", "tag",
	"linkId", "ascsubtag",

	// ShareThis / social
	"sr_share",
]);

const TRACKING_WRAPPER_DOMAINS: { pattern: RegExp; label: string }[] = [
	// HubSpot
	{ pattern: /\.hubspotlinks\.com$/, label: "HubSpot tracking link" },
	{ pattern: /\.hs-email\.net$/, label: "HubSpot tracking link" },
	{ pattern: /\.sidekickopen\d*\.com$/, label: "HubSpot tracking link" },
	{ pattern: /\.na\d+\.hs-sales-engage\.com$/, label: "HubSpot tracking link" },
	// Microsoft ATP Safe Links
	{ pattern: /safelinks\.protection\.outlook\.com$/, label: "Outlook SafeLink" },
	// Proofpoint
	{ pattern: /urldefense\.proofpoint\.com$/, label: "Proofpoint link" },
	{ pattern: /urldefense\.com$/, label: "Proofpoint link" },
	// Mimecast
	{ pattern: /url\d*\.mimecastprotect\.com$/, label: "Mimecast link" },
	// SendGrid
	{ pattern: /\.sendgrid\.net$/, label: "SendGrid tracking link" },
	// Mailchimp / Mandrill
	{ pattern: /click\.mailchimp\.com$/, label: "Mailchimp tracking link" },
	{ pattern: /mandrillapp\.com$/, label: "Mandrill tracking link" },
	// Marketo
	{ pattern: /click\.marketo\.com$/, label: "Marketo tracking link" },
	// Constant Contact
	{ pattern: /tracking\.constantcontact\.com$/, label: "Constant Contact link" },
	// ConvertKit
	{ pattern: /click\.convertkit-mail\.com$/, label: "ConvertKit link" },
	// Generic shorteners
	{ pattern: /^t\.co$/, label: "Twitter/X short link" },
	{ pattern: /^bit\.ly$/, label: "bit.ly short link" },
	{ pattern: /^ow\.ly$/, label: "Hootsuite short link" },
	{ pattern: /^buff\.ly$/, label: "Buffer short link" },
	{ pattern: /^tinyurl\.com$/, label: "TinyURL link" },
];

/**
 * Returns a cleaned, human-readable version of `url` for display in Markdown
 * links. The original URL is never modified — this is called only at render time.
 *
 * @param url - The URL string to clean (may be raw or already sanitized)
 * @returns A shortened, de-tracked display string
 */
export function cleanUrlForDisplay(url: string): string {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		// Not a valid URL — apply truncation only
		return url.length > MAX_DISPLAY_LENGTH
			? url.slice(0, MAX_DISPLAY_LENGTH) + "\u2026"
			: url;
	}

	const hostname = parsed.hostname.toLowerCase();

	// Layer 2: collapse known redirect/wrapper domains before stripping params —
	// the destination URL is encoded in the path/query and is not recoverable
	// without an HTTP fetch, so collapse to a labeled placeholder.
	for (const { pattern, label } of TRACKING_WRAPPER_DOMAINS) {
		if (pattern.test(hostname)) {
			return `${hostname} [${label}]`;
		}
	}

	// Layer 1: strip known tracking/noise query parameters
	const keysToDelete: string[] = [];
	for (const key of parsed.searchParams.keys()) {
		if (DISPLAY_STRIP_PARAMS.has(key) || DISPLAY_STRIP_PARAMS.has(key.toLowerCase())) {
			keysToDelete.push(key);
		}
	}
	for (const key of keysToDelete) {
		parsed.searchParams.delete(key);
	}

	let clean = parsed.toString();

	// Truncation fallback: break at a segment boundary (?, &, or /) if possible
	if (clean.length > MAX_DISPLAY_LENGTH) {
		const breakPoints = ["?", "&", "/"];
		let cut = MAX_DISPLAY_LENGTH;
		for (const bp of breakPoints) {
			const idx = clean.lastIndexOf(bp, MAX_DISPLAY_LENGTH);
			if (idx > 30) {
				cut = idx;
				break;
			}
		}
		clean = clean.slice(0, cut) + "\u2026";
	}

	return clean;
}
