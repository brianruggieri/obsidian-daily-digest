// ── Quality filters for ETL domain candidates ───────────────
//
// Applied to every UT1 domain before inclusion in the plugin's
// categorize.ts. Each filter returns true if the domain should
// be REJECTED (i.e., is low-quality or suspicious).

/** TLDs commonly used by spam / throwaway sites. */
const SUSPICIOUS_TLDS = new Set([
	"tk", "ml", "ga", "cf", "gq", "pw", "top", "click", "stream",
]);

/**
 * Reject domains with >3 hyphens (spam heuristic).
 * e.g. "best-free-online-movie-streaming-site.com" → rejected
 */
export function hasExcessiveHyphens(domain: string): boolean {
	return (domain.match(/-/g) || []).length > 3;
}

/**
 * Reject domains with ≥2 consecutive digit segments.
 * e.g. "stream123.watch456.com" → rejected
 */
export function hasConsecutiveDigitSegments(domain: string): boolean {
	const parts = domain.split(".");
	let consecutiveDigits = 0;
	for (const part of parts) {
		if (/^\d+$/.test(part)) {
			consecutiveDigits++;
			if (consecutiveDigits >= 2) return true;
		} else {
			consecutiveDigits = 0;
		}
	}
	return false;
}

/**
 * Reject domains using suspicious TLDs.
 */
export function hasSuspiciousTld(domain: string): boolean {
	const tld = domain.split(".").pop() || "";
	return SUSPICIOUS_TLDS.has(tld);
}

/**
 * Reject ccTLD domains ranked below a threshold (country-specific
 * low-value sites — usually regional variants of already-covered sites).
 */
export function isLowValueCcTld(domain: string, rank: number, threshold = 20_000): boolean {
	const tld = domain.split(".").pop() || "";
	// Common ccTLDs (2-letter, not in suspicious set, not generic like .io/.ai/.co)
	const genericishTwoLetter = new Set(["io", "ai", "co", "me", "tv", "fm", "sh", "is"]);
	if (tld.length === 2 && !SUSPICIOUS_TLDS.has(tld) && !genericishTwoLetter.has(tld)) {
		return rank > threshold;
	}
	return false;
}

/**
 * Reject subdomains of major hosting/platform domains.
 * These are problematic because the plugin uses `.includes()` matching,
 * so "blogspot.com" would match ANY blogspot-hosted domain, and
 * subdomains like "news.google.com" conflict with broader patterns.
 */
const MAJOR_PLATFORM_ROOTS = new Set([
	"google.com", "yahoo.com", "microsoft.com", "apple.com",
	"amazon.com", "facebook.com", "twitter.com", "live.com",
	"msn.com", "yandex.ru", "mail.ru", "baidu.com",
	"wordpress.com", "blogspot.com", "tumblr.com",
	"wifeo.com", "free.fr", "wixsite.com", "weebly.com",
	"squarespace.com", "github.io", "netlify.app",
	"rakuten.co.jp",
]);

export function isSubdomainOfMajorPlatform(domain: string): boolean {
	for (const platform of MAJOR_PLATFORM_ROOTS) {
		// Exact match is fine (the platform itself) — only reject subdomains
		if (domain === platform) continue;
		if (domain.endsWith(`.${platform}`)) return true;
	}
	return false;
}

export interface QualityResult {
	passed: boolean;
	reason?: string;
}

/**
 * Run all quality filters on a domain. Returns { passed: true }
 * if the domain is acceptable, or { passed: false, reason } if rejected.
 */
export function checkQuality(domain: string, trancoRank: number): QualityResult {
	if (hasExcessiveHyphens(domain)) {
		return { passed: false, reason: "excessive-hyphens" };
	}
	if (hasConsecutiveDigitSegments(domain)) {
		return { passed: false, reason: "consecutive-digit-segments" };
	}
	if (hasSuspiciousTld(domain)) {
		return { passed: false, reason: "suspicious-tld" };
	}
	if (isLowValueCcTld(domain, trancoRank)) {
		return { passed: false, reason: "low-value-cctld" };
	}
	if (isSubdomainOfMajorPlatform(domain)) {
		return { passed: false, reason: "major-platform-subdomain" };
	}
	return { passed: true };
}
