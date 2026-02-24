import { describe, it, expect } from "vitest";
import { filterSensitiveDomains, getCategoryInfo } from "../../../src/filter/sensitivity";
import { BrowserVisit, SensitivityConfig } from "../../../src/types";

function makeVisit(url: string): BrowserVisit {
	return { url, title: "Test", time: new Date() };
}

function makeConfig(categories: string[]): SensitivityConfig {
	return {
		enabled: true,
		categories: categories as never,
		customDomains: [],
		action: "exclude",
	};
}

// ── Tracker Category ─────────────────────────────────────

describe("sensitivity: tracker category", () => {
	it("filters SendGrid click-tracker visits", () => {
		const visits = [
			makeVisit("https://u1234567.ct.sendgrid.net/ls/click?upn=abc123"),
			makeVisit("https://github.com/myorg/repo"),
		];
		const result = filterSensitiveDomains(visits, makeConfig(["tracker"]));
		expect(result.kept).toHaveLength(1);
		expect(result.kept[0].url).toContain("github.com");
		expect(result.filtered).toBe(1);
		expect(result.byCategory["tracker"]).toBe(1);
	});

	it("filters Mailchimp list-manage.com redirect visits", () => {
		const visits = [
			makeVisit("https://mailchi.mp/company/weekly-newsletter"),
			makeVisit("https://list-manage.com/track/click?u=abc&id=def"),
			makeVisit("https://example.com/real-content"),
		];
		const result = filterSensitiveDomains(visits, makeConfig(["tracker"]));
		expect(result.kept).toHaveLength(1);
		expect(result.filtered).toBe(2);
	});

	it("filters Mandrill transactional redirect visits", () => {
		const visits = [makeVisit("https://mandrillapp.com/track/click?u=abc")];
		const result = filterSensitiveDomains(visits, makeConfig(["tracker"]));
		expect(result.filtered).toBe(1);
	});

	it("filters HubSpot email tracking visits", () => {
		const visits = [
			makeVisit("https://hubspotemail.net/e2t/c/abc123"),
			makeVisit("https://hs-email.click/track/abc"),
		];
		const result = filterSensitiveDomains(visits, makeConfig(["tracker"]));
		expect(result.filtered).toBe(2);
	});

	it("filters Salesforce ExactTarget / Pardot redirects", () => {
		const visits = [
			makeVisit("https://click.exacttarget.com/ls/click?upn=abc"),
			makeVisit("https://exct.net/redirect/abc"),
			makeVisit("https://go.pardot.com/l/123/abc"),
		];
		const result = filterSensitiveDomains(visits, makeConfig(["tracker"]));
		expect(result.filtered).toBe(3);
	});

	it("filters ActiveCampaign redirect domains", () => {
		const visits = [
			makeVisit("https://company.acemlna.com/lt.php?l=abc"),
			makeVisit("https://company.activehosted.com/index.php?abc"),
		];
		const result = filterSensitiveDomains(visits, makeConfig(["tracker"]));
		expect(result.filtered).toBe(2);
	});

	it("filters Klaviyo email tracking domain", () => {
		const visits = [makeVisit("https://link.klaviyomail.com/x/abc")];
		const result = filterSensitiveDomains(visits, makeConfig(["tracker"]));
		expect(result.filtered).toBe(1);
	});

	it("filters Braze click-tracker subdomain", () => {
		const visits = [makeVisit("https://click.braze.com/abc123")];
		const result = filterSensitiveDomains(visits, makeConfig(["tracker"]));
		expect(result.filtered).toBe(1);
	});

	it("does NOT filter braze.com product/docs visits", () => {
		const visits = [makeVisit("https://www.braze.com/docs/user_guide/")];
		const result = filterSensitiveDomains(visits, makeConfig(["tracker"]));
		// braze.com is not listed — only click.braze.com is
		expect(result.kept).toHaveLength(1);
	});

	it("filters Postmark redirect domain pstmrk.it", () => {
		const visits = [makeVisit("https://pstmrk.it/3cAbc")];
		const result = filterSensitiveDomains(visits, makeConfig(["tracker"]));
		expect(result.filtered).toBe(1);
	});

	it("filters AthenaHealth messaging analytics", () => {
		const visits = [makeVisit("https://messaginganalytics.athena.io/track/open?id=abc")];
		const result = filterSensitiveDomains(visits, makeConfig(["tracker"]));
		expect(result.filtered).toBe(1);
	});

	it("passes through normal content visits unaffected", () => {
		const visits = [
			makeVisit("https://github.com/myorg/repo"),
			makeVisit("https://stackoverflow.com/questions/123"),
			makeVisit("https://docs.sendgrid.com/for-developers/"), // docs, not click tracker
		];
		const result = filterSensitiveDomains(visits, makeConfig(["tracker"]));
		expect(result.kept).toHaveLength(3);
	});
});

// ── Auth Category ─────────────────────────────────────────

describe("sensitivity: auth category", () => {
	it("filters Microsoft OAuth login visits", () => {
		const visits = [
			makeVisit("https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=abc"),
			makeVisit("https://myapp.com/dashboard"),
		];
		const result = filterSensitiveDomains(visits, makeConfig(["auth"]));
		expect(result.kept).toHaveLength(1);
		expect(result.kept[0].url).toContain("myapp.com");
		expect(result.filtered).toBe(1);
	});

	it("filters Apple ID login visits", () => {
		const visits = [
			makeVisit("https://appleid.apple.com/auth/authorize"),
			makeVisit("https://idmsa.apple.com/IDMSWebAuth/authenticate"),
		];
		const result = filterSensitiveDomains(visits, makeConfig(["auth"]));
		expect(result.filtered).toBe(2);
	});

	it("filters Okta tenant portal visits", () => {
		const visits = [
			makeVisit("https://mycompany.okta.com/oauth2/v1/authorize"),
			makeVisit("https://mycompany.okta.com/login/login.htm"),
		];
		const result = filterSensitiveDomains(visits, makeConfig(["auth"]));
		expect(result.filtered).toBe(2);
	});

	it("filters Auth0 tenant portal visits", () => {
		const visits = [makeVisit("https://myapp.auth0.com/authorize?response_type=code")];
		const result = filterSensitiveDomains(visits, makeConfig(["auth"]));
		expect(result.filtered).toBe(1);
	});

	it("filters GitHub OAuth flow path", () => {
		const visits = [
			makeVisit("https://github.com/login/oauth/authorize?client_id=abc"),
			makeVisit("https://github.com/myorg/repo"), // regular GitHub visit
		];
		const result = filterSensitiveDomains(visits, makeConfig(["auth"]));
		expect(result.kept).toHaveLength(1);
		expect(result.kept[0].url).toContain("/myorg/repo");
	});

	it("filters AthenaHealth identity provider visits", () => {
		const visits = [
			makeVisit("https://myidentity.platform.athenahealth.com/oauth/authorize"),
			makeVisit("https://identity.athenahealth.com/oauth2/token"),
		];
		const result = filterSensitiveDomains(visits, makeConfig(["auth"]));
		expect(result.filtered).toBe(2);
	});

	it("filters login.live.com Microsoft consumer auth", () => {
		const visits = [makeVisit("https://login.live.com/login.srf?wa=wsignin1.0")];
		const result = filterSensitiveDomains(visits, makeConfig(["auth"]));
		expect(result.filtered).toBe(1);
	});
});

// ── Category Registry ─────────────────────────────────────

describe("getCategoryInfo includes new categories", () => {
	it("includes tracker category with domain count", () => {
		const info = getCategoryInfo();
		expect(info.tracker).toBeDefined();
		expect(info.tracker.count).toBeGreaterThan(10);
		expect(info.tracker.label).toBe("Email Trackers");
	});

	it("includes auth category with domain count", () => {
		const info = getCategoryInfo();
		expect(info.auth).toBeDefined();
		expect(info.auth.count).toBeGreaterThan(5);
		expect(info.auth.label).toBe("Auth / SSO Flows");
	});
});
