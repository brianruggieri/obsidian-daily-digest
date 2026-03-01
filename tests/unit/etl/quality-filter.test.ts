import { describe, it, expect } from "vitest";
import {
	hasExcessiveHyphens,
	hasConsecutiveDigitSegments,
	hasSuspiciousTld,
	isLowValueCcTld,
	isSubdomainOfMajorPlatform,
	checkQuality,
} from "../../../scripts/etl/lib/quality-filter";

describe("hasExcessiveHyphens", () => {
	it("rejects domains with more than 3 hyphens", () => {
		expect(hasExcessiveHyphens("best-free-online-movie-streaming.com")).toBe(true);
	});

	it("accepts domains with exactly 3 hyphens", () => {
		expect(hasExcessiveHyphens("my-cool-web-site.com")).toBe(false);
	});

	it("accepts domains with no hyphens", () => {
		expect(hasExcessiveHyphens("example.com")).toBe(false);
	});

	it("accepts domains with 1 hyphen", () => {
		expect(hasExcessiveHyphens("my-site.com")).toBe(false);
	});
});

describe("hasConsecutiveDigitSegments", () => {
	it("rejects domains with 2 consecutive digit-only segments", () => {
		expect(hasConsecutiveDigitSegments("123.456.com")).toBe(true);
	});

	it("accepts domains with non-consecutive digit segments", () => {
		expect(hasConsecutiveDigitSegments("123.abc.456.com")).toBe(false);
	});

	it("accepts domains with no digit segments", () => {
		expect(hasConsecutiveDigitSegments("example.com")).toBe(false);
	});

	it("accepts domains with a single digit segment", () => {
		expect(hasConsecutiveDigitSegments("123.example.com")).toBe(false);
	});

	it("rejects domains with 3 consecutive digit segments", () => {
		expect(hasConsecutiveDigitSegments("1.2.3.com")).toBe(true);
	});
});

describe("hasSuspiciousTld", () => {
	it("rejects .tk domains", () => {
		expect(hasSuspiciousTld("spam.tk")).toBe(true);
	});

	it("rejects .ml domains", () => {
		expect(hasSuspiciousTld("free-stuff.ml")).toBe(true);
	});

	it("rejects .top domains", () => {
		expect(hasSuspiciousTld("deals.top")).toBe(true);
	});

	it("rejects .click domains", () => {
		expect(hasSuspiciousTld("buy.click")).toBe(true);
	});

	it("accepts .com domains", () => {
		expect(hasSuspiciousTld("example.com")).toBe(false);
	});

	it("accepts .org domains", () => {
		expect(hasSuspiciousTld("example.org")).toBe(false);
	});

	it("accepts .io domains", () => {
		expect(hasSuspiciousTld("app.io")).toBe(false);
	});
});

describe("isLowValueCcTld", () => {
	it("rejects ccTLD domains with rank exceeding the threshold (less popular)", () => {
		expect(isLowValueCcTld("obscure-site.de", 25_000)).toBe(true);
	});

	it("accepts ccTLD domains with rank below the threshold (more popular)", () => {
		expect(isLowValueCcTld("popular-site.de", 5_000)).toBe(false);
	});

	it("accepts ccTLD domains at exactly the threshold", () => {
		expect(isLowValueCcTld("site.fr", 20_000)).toBe(false);
	});

	it("does not filter generic-ish 2-letter TLDs like .io", () => {
		expect(isLowValueCcTld("app.io", 50_000)).toBe(false);
	});

	it("does not filter .ai domains regardless of rank", () => {
		expect(isLowValueCcTld("tool.ai", 99_999)).toBe(false);
	});

	it("does not filter .co domains regardless of rank", () => {
		expect(isLowValueCcTld("startup.co", 99_999)).toBe(false);
	});

	it("does not filter suspicious TLDs (handled by hasSuspiciousTld)", () => {
		expect(isLowValueCcTld("spam.tk", 50_000)).toBe(false);
	});

	it("supports custom threshold", () => {
		expect(isLowValueCcTld("site.de", 15_000, 10_000)).toBe(true);
		expect(isLowValueCcTld("site.de", 5_000, 10_000)).toBe(false);
	});
});

describe("isSubdomainOfMajorPlatform", () => {
	it("rejects subdomains of google.com", () => {
		expect(isSubdomainOfMajorPlatform("news.google.com")).toBe(true);
	});

	it("rejects subdomains of blogspot.com", () => {
		expect(isSubdomainOfMajorPlatform("myblog.blogspot.com")).toBe(true);
	});

	it("accepts the platform root itself", () => {
		expect(isSubdomainOfMajorPlatform("google.com")).toBe(false);
	});

	it("accepts unrelated domains", () => {
		expect(isSubdomainOfMajorPlatform("example.com")).toBe(false);
	});

	it("rejects deep subdomains of platforms", () => {
		expect(isSubdomainOfMajorPlatform("a.b.github.io")).toBe(true);
	});

	it("rejects subdomains of CDN domains", () => {
		expect(isSubdomainOfMajorPlatform("img.akamaized.net")).toBe(true);
	});

	it("accepts domains that contain but don't end with platform", () => {
		expect(isSubdomainOfMajorPlatform("notgoogle.com")).toBe(false);
	});
});

describe("checkQuality", () => {
	it("passes a normal domain with good rank", () => {
		const result = checkQuality("github.com", 100);
		expect(result.passed).toBe(true);
		expect(result.reason).toBeUndefined();
	});

	it("rejects excessive hyphens", () => {
		const result = checkQuality("a-b-c-d-e.com", 100);
		expect(result).toEqual({ passed: false, reason: "excessive-hyphens" });
	});

	it("rejects consecutive digit segments", () => {
		const result = checkQuality("123.456.com", 100);
		expect(result).toEqual({ passed: false, reason: "consecutive-digit-segments" });
	});

	it("rejects suspicious TLD", () => {
		const result = checkQuality("spam.tk", 100);
		expect(result).toEqual({ passed: false, reason: "suspicious-tld" });
	});

	it("rejects low-value ccTLD", () => {
		const result = checkQuality("obscure.de", 25_000);
		expect(result).toEqual({ passed: false, reason: "low-value-cctld" });
	});

	it("rejects major platform subdomains", () => {
		const result = checkQuality("myblog.blogspot.com", 100);
		expect(result).toEqual({ passed: false, reason: "major-platform-subdomain" });
	});

	it("returns first matching rejection (priority order)", () => {
		// Domain with both excessive hyphens AND suspicious TLD
		const result = checkQuality("a-b-c-d-e.tk", 100);
		expect(result.passed).toBe(false);
		expect(result.reason).toBe("excessive-hyphens"); // checked first
	});
});
