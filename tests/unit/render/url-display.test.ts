import { describe, it, expect } from "vitest";
import { cleanUrlForDisplay } from "../../../src/render/url-display";

describe("cleanUrlForDisplay", () => {
	// Test 1: HubSpot tracking URL → collapses to labeled placeholder
	it("collapses HubSpot tracking URLs to a label", () => {
		const url = "https://d2v8tf04.na1.hubspotlinks.com/events/public/v1/encoded/track/eyJhbGciOiJIUzI1NiJ9.example";
		const result = cleanUrlForDisplay(url);
		expect(result).toBe("d2v8tf04.na1.hubspotlinks.com [HubSpot tracking link]");
	});

	// Test 2: Adobe unsubscribe with long base64 ?p= param → truncated
	it("truncates Adobe unsubscribe URL with long base64 param", () => {
		const url = "https://www.adobe.com/unsubscribe.html?p=iTlazJBe%2FVowDgv4aiYxnpZETQsabcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789==&source=newsletter";
		const result = cleanUrlForDisplay(url);
		expect(result.length).toBeLessThanOrEqual(121); // 120 chars + "…"
		expect(result.endsWith("\u2026")).toBe(true);
		expect(result).not.toContain("d2v8tf04"); // sanity — not confused with HubSpot
	});

	// Test 3: UTM params stripped, real params preserved
	it("strips UTM params and preserves meaningful query params", () => {
		const url = "https://example.com/article?id=42&utm_source=newsletter&utm_medium=email&utm_campaign=spring";
		const result = cleanUrlForDisplay(url);
		expect(result).toContain("id=42");
		expect(result).not.toContain("utm_source");
		expect(result).not.toContain("utm_medium");
		expect(result).not.toContain("utm_campaign");
	});

	// Test 4: gclid + fbclid stripped, color=red preserved
	it("strips gclid and fbclid but preserves color param", () => {
		const url = "https://shop.example.com/products?color=red&gclid=abc123&fbclid=xyz789";
		const result = cleanUrlForDisplay(url);
		expect(result).toContain("color=red");
		expect(result).not.toContain("gclid");
		expect(result).not.toContain("fbclid");
	});

	// Test 5: All params are tracking-only → trailing ? removed
	it("removes trailing ? when all params are stripped", () => {
		const url = "https://example.com/page?utm_source=email&utm_medium=cpc&fbclid=abc";
		const result = cleanUrlForDisplay(url);
		expect(result).not.toMatch(/\?$/);
		expect(result).not.toContain("utm_source");
		// The URL constructor serializes an empty search as no trailing ?
		expect(result).toBe("https://example.com/page");
	});

	// Test 6: Outlook SafeLink → collapses to label
	it("collapses Outlook SafeLinks to a label", () => {
		const url = "https://nam04.safelinks.protection.outlook.com/?url=https%3A%2F%2Fexample.com&data=05%7C01%7C";
		const result = cleanUrlForDisplay(url);
		expect(result).toBe("nam04.safelinks.protection.outlook.com [Outlook SafeLink]");
	});

	// Test 7: t.co short link → collapses to label
	it("collapses t.co short links to a label", () => {
		const url = "https://t.co/abc123XYZ";
		const result = cleanUrlForDisplay(url);
		expect(result).toBe("t.co [Twitter/X short link]");
	});

	// Test 8: Clean URL passes through unchanged
	it("passes clean URLs through without modification", () => {
		const url = "https://developer.mozilla.org/en-US/docs/Web/JavaScript";
		const result = cleanUrlForDisplay(url);
		expect(result).toBe(url);
	});

	// Test 9: Long Google Maps /data=!4m9 path → truncated at segment boundary
	it("truncates long Google Maps data paths at a segment boundary", () => {
		const url = "https://maps.google.com/maps/@32.4527517,-84.9942759,12.67z/data=!4m9!4m8!1m0!1m5!1m1!1s0x888f2d5da4b3f28d!2m2!1d-84.9942759!2d32.4527517!3e0";
		const result = cleanUrlForDisplay(url);
		expect(result.length).toBeLessThanOrEqual(121);
		expect(result.endsWith("\u2026")).toBe(true);
		// The truncation cuts at the / boundary (slice excludes the / itself),
		// so the char just before the ellipsis is the last path segment character.
		// Verify the result is a prefix of the original URL (minus the ellipsis).
		const withoutEllipsis = result.slice(0, -1);
		expect(url.startsWith(withoutEllipsis)).toBe(true);
		// Confirm the next character in the original URL at that cut point is a /
		expect(url[withoutEllipsis.length]).toBe("/");
	});

	// Test 10: Invalid URL → no throw, fallback truncation
	it("does not throw on invalid URLs and applies fallback truncation", () => {
		const notAUrl = "not a url at all :: garbage :: " + "x".repeat(100);
		expect(() => cleanUrlForDisplay(notAUrl)).not.toThrow();
		const result = cleanUrlForDisplay(notAUrl);
		expect(result.endsWith("\u2026")).toBe(true);
		expect(result.length).toBeLessThanOrEqual(121);
	});

	// Test 11: mkt_tok (Marketo) stripped, id=123 preserved
	it("strips mkt_tok but preserves id param", () => {
		const url = "https://info.example.com/product?id=123&mkt_tok=ODI3LVVQSy03MzIAAAGBtoken";
		const result = cleanUrlForDisplay(url);
		expect(result).toContain("id=123");
		expect(result).not.toContain("mkt_tok");
	});

	// Test 12: Proofpoint URL Defense → collapses to label
	it("collapses Proofpoint URL Defense links to a label", () => {
		const url = "https://urldefense.proofpoint.com/v2/url?u=https-3A__example.com&d=DwMGaQ&c=euGZstcaTDllvimEN8b7jXrwqOf-v5A";
		const result = cleanUrlForDisplay(url);
		expect(result).toBe("urldefense.proofpoint.com [Proofpoint link]");
	});
});
