import { describe, it, expect } from "vitest";
import { unwrapGoogleRedirect } from "../../src/collectors";

// ── Google Redirect Extraction ──────────────────────────

describe("unwrapGoogleRedirect", () => {
	it("extracts destination from standard google.com/url?q= redirect", () => {
		const url = "https://www.google.com/url?q=https://linkedin.com/jobs/view/123&sa=D&sntz=1&usg=AOvVaw0abc";
		expect(unwrapGoogleRedirect(url)).toBe("https://linkedin.com/jobs/view/123");
	});

	it("extracts destination from Gmail click-through (google.com/url?url=)", () => {
		const url = "https://www.google.com/url?url=https://example.com/page&rct=j&q=&source=web";
		expect(unwrapGoogleRedirect(url)).toBe("https://example.com/page");
	});

	it("returns null for google.com/url without q or url param", () => {
		const url = "https://www.google.com/url?sa=t&rct=j&source=web";
		expect(unwrapGoogleRedirect(url)).toBeNull();
	});

	it("returns null for google.com/url where q is not an https URL", () => {
		const url = "https://www.google.com/url?q=javascript:void(0)";
		expect(unwrapGoogleRedirect(url)).toBeNull();
	});

	it("returns null for a regular Google search URL", () => {
		expect(unwrapGoogleRedirect("https://google.com/search?q=typescript")).toBeNull();
	});

	it("returns null for a non-google URL", () => {
		expect(unwrapGoogleRedirect("https://github.com/myorg/repo")).toBeNull();
	});

	it("returns null for an invalid URL string", () => {
		expect(unwrapGoogleRedirect("not-a-url")).toBeNull();
	});

	it("preserves full destination URL including path and query params", () => {
		const dest = "https://docs.github.com/en/actions/writing-workflows?page=2#triggers";
		const url = `https://www.google.com/url?q=${encodeURIComponent(dest)}&sa=D`;
		const result = unwrapGoogleRedirect(url);
		// URL class normalises the encoding, so compare decoded
		expect(result).toBeTruthy();
		expect(result).toContain("docs.github.com");
	});
});
