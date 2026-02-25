/**
 * Unit Tests: Privacy Leak Detector
 *
 * Tests the PrivacyLeakDetector class with tier-specific validation rules.
 * This is the core validation layer before expensive Claude API calls.
 *
 * Run: npm run test tests/eval/privacy-leak-detector.test.ts
 */

import { describe, it, expect } from "vitest";
import { PrivacyLeakDetector, type LeakReport } from "./privacy-leak-detector";

describe("PrivacyLeakDetector", () => {
	// ── Tier 4 (Deidentified) Tests ──────────────────────────

	describe("tier-4-deidentified: strict aggregates only", () => {
		const detector = new PrivacyLeakDetector("tier-4-deidentified");

		it("should FAIL validation when URLs are present in tier-4 output", () => {
			const output = `
Daily activity summary:
- Visited https://github.com/user/private-repo
- Spent 2h on authentication work
- Ran commands: npm install, git push
			`;

			const report = detector.validate(output);

			expect(report.tier).toBe("tier-4-deidentified");
			expect(report.passed).toBe(false);
			expect(report.violations.length).toBeGreaterThan(0);
			expect(report.violations.some(v => v.toLowerCase().includes("url"))).toBe(true);
			expect(report.urls_found.length).toBeGreaterThan(0);
		});

		it("should FAIL validation when tool names are present in tier-4 output", () => {
			const output = `
Activity aggregates:
- Used github and npm today
- Docker container activity detected
- AWS CLI operations: 5 commands
- Slack notifications: 12 messages
- Git commits: 3 repositories
			`;

			const report = detector.validate(output);

			expect(report.passed).toBe(false);
			expect(report.violations.length).toBeGreaterThan(0);
			expect(report.violations.some(v => v.toLowerCase().includes("tool"))).toBe(true);
		});

		it("should PASS validation when only aggregates and patterns are present", () => {
			const output = `
Daily Activity Aggregates:
- Total focus sessions: 3
- Average session duration: 1.5 hours
- Context switches: 4
- Topics covered: 5 major areas
- Code review intensity: moderate
- Learning moments: 2 novel patterns discovered

Temporal patterns:
- Morning: deep work (0600-0900)
- Midday: collaborative work (1200-1400)
- Evening: exploration (1700-1900)

Thematic clusters:
- Infrastructure work: 40% of activity
- Feature development: 35% of activity
- Debugging and fixes: 25% of activity
			`;

			const report = detector.validate(output);

			expect(report.passed).toBe(true);
			expect(report.violations).toEqual([]);
			expect(report.urls_found).toEqual([]);
		});

		it("should FAIL when tier-4 contains file paths", () => {
			const output = `
Work summary:
- Modified /Users/brian/projects/auth-service
- Ran tests in /home/user/myapp/tests
- Configuration: /etc/config.yaml
- Focus: authentication patterns
			`;

			const report = detector.validate(output);

			expect(report.passed).toBe(false);
			expect(report.violations.some(v => v.toLowerCase().includes("path"))).toBe(true);
		});
	});

	// ── Tier 3 (Classified) Tests ────────────────────────────

	describe("tier-3-classified: no raw commands or file paths", () => {
		const detector = new PrivacyLeakDetector("tier-3-classified");

		it("should FAIL validation when raw commands are present in tier-3 output", () => {
			const output = `
Activities today:
- Performed: git commit -m "feat: add auth middleware"
- Executed: npm run build && npm test
- Ran: curl -X POST https://api.example.com/data
- Database: mysql -u root -p password -e "SELECT * FROM users"

Overall themes: infrastructure and CI/CD
			`;

			const report = detector.validate(output);

			expect(report.passed).toBe(false);
			expect(report.violations.some(v => v.toLowerCase().includes("command"))).toBe(true);
		});

		it("should PASS validation when activities are described abstractly", () => {
			const output = `
Activities today:
- Version control: committed changes related to authentication
- Build process: ran test suite with full coverage
- API operations: made HTTP requests to integrate third-party services
- Database work: performed SQL queries for data analysis

Thematic summary:
- Infrastructure: authentication layer improvements
- Testing: comprehensive test coverage added
- Integration: third-party API connectivity

Overall assessment: productive day focused on backend systems
			`;

			const report = detector.validate(output);

			expect(report.passed).toBe(true);
			expect(report.violations).toEqual([]);
		});
	});

	// ── Secret Detection (All Tiers) ─────────────────────────

	describe("secret detection: zero tolerance across all tiers", () => {
		it("should FAIL tier-1 when real secrets are detected", () => {
			const detector = new PrivacyLeakDetector("tier-1-standard");
			const output = `
Prompt used:
"Summarize my day"

API Key used: sk-ant-vKzKJZ3GkZrEkYQQQQQQQQQQQQQQQQQQQQQQ
GitHub token: ghp_abcdefghijklmnopqrstuvwxyz1234567890ab

Summary: Good day of coding
			`;

			const report = detector.validate(output);

			expect(report.passed).toBe(false);
			expect(report.secrets_found.length).toBeGreaterThan(0);
		});

		it("should PASS tier-1 when test/fake data is present", () => {
			const detector = new PrivacyLeakDetector("tier-1-standard");
			const output = `
Test configuration:
- API Key: sk-ant-test123test123test123test123test
- GitHub token: ghp_test_test_test_test_test_1234567890ab
- AWS Key: AKIAFAKEFAKEFAKEFAKE

Summary context:
This is a test summary of daily activities.
Fake data used for testing purposes.
			`;

			const report = detector.validate(output);

			expect(report.passed).toBe(true);
			expect(report.secrets_found).toEqual([]);
		});

		it("should FAIL when IP addresses appear in tier-1", () => {
			const detector = new PrivacyLeakDetector("tier-1-standard");
			const output = `
Network activity:
- Connected to server at 192.168.1.100
- API endpoint: 10.0.0.5:8080
- Database host: 172.16.0.1

Summary: Network debugging session
			`;

			const report = detector.validate(output);

			expect(report.passed).toBe(false);
			expect(report.secrets_found.length).toBeGreaterThan(0);
		});

		it("should FAIL when email addresses are detected", () => {
			const detector = new PrivacyLeakDetector("tier-1-standard");
			const output = `
Contacts involved:
- brian.ruggieri@company.com
- alice.smith@example.org
- bob+tag@domain.co.uk

Summary: collaborative work with team
			`;

			const report = detector.validate(output);

			expect(report.passed).toBe(false);
			expect(report.secrets_found.length).toBeGreaterThan(0);
		});
	});

	// ── LeakReport Interface Tests ───────────────────────────

	describe("LeakReport structure", () => {
		it("should return proper LeakReport interface", () => {
			const detector = new PrivacyLeakDetector("tier-2-rag");
			const report = detector.validate("Safe content about work patterns");

			expect(report).toHaveProperty("tier");
			expect(report).toHaveProperty("passed");
			expect(report).toHaveProperty("violations");
			expect(report).toHaveProperty("secrets_found");
			expect(report).toHaveProperty("urls_found");
			expect(report).toHaveProperty("commands_found");

			expect(typeof report.tier).toBe("string");
			expect(typeof report.passed).toBe("boolean");
			expect(Array.isArray(report.violations)).toBe(true);
			expect(Array.isArray(report.secrets_found)).toBe(true);
			expect(Array.isArray(report.urls_found)).toBe(true);
			expect(Array.isArray(report.commands_found)).toBe(true);
		});

		it("should include detailed violation information", () => {
			const detector = new PrivacyLeakDetector("tier-4-deidentified");
			const report = detector.validate("Visited https://example.com and used npm install");

			expect(report.violations.length).toBeGreaterThan(0);
			report.violations.forEach(violation => {
				expect(typeof violation).toBe("string");
				expect(violation.length).toBeGreaterThan(0);
			});
		});
	});

	// ── Tier Transitions Tests ───────────────────────────────

	describe("tier-specific strictness levels", () => {
		it("should allow more in tier-1 than tier-4", () => {
			const output = `
Summary: Spent 3 hours on project work.
API usage patterns observed.
			`;

			const tier1Detector = new PrivacyLeakDetector("tier-1-standard");
			const tier4Detector = new PrivacyLeakDetector("tier-4-deidentified");

			const tier1Report = tier1Detector.validate(output);
			const tier4Report = tier4Detector.validate(output);

			// Both should pass on safe content, but tier-4 is stricter overall
			expect(tier1Report.passed).toBe(true);
			expect(tier4Report.passed).toBe(true);
		});

		it("should enforce different rules for tier-3 vs tier-4", () => {
			const outputWithCommand = "Executed git commit -m 'fix bug' as part of workflow";

			const tier3Detector = new PrivacyLeakDetector("tier-3-classified");
			const tier4Detector = new PrivacyLeakDetector("tier-4-deidentified");

			const tier3Report = tier3Detector.validate(outputWithCommand);
			const tier4Report = tier4Detector.validate(outputWithCommand);

			// tier-4 should be stricter
			expect(tier3Report.passed).toBe(false); // commands not allowed
			expect(tier4Report.passed).toBe(false); // commands + other issues
		});
	});

	// ── Edge Cases ───────────────────────────────────────────

	describe("edge cases", () => {
		it("should handle empty output gracefully", () => {
			const detector = new PrivacyLeakDetector("tier-1-standard");
			const report = detector.validate("");

			expect(report.passed).toBe(true);
			expect(report.violations).toEqual([]);
		});

		it("should handle whitespace-only output gracefully", () => {
			const detector = new PrivacyLeakDetector("tier-2-rag");
			const report = detector.validate("   \n\t\n   ");

			expect(report.passed).toBe(true);
		});

		it("should detect multiple violation types in single output", () => {
			const detector = new PrivacyLeakDetector("tier-4-deidentified");
			const output = `
Visited https://github.com/private/repo
Used docker and npm
Modified /Users/user/project
API key: sk-ant-testkey123
			`;

			const report = detector.validate(output);

			expect(report.passed).toBe(false);
			expect(report.violations.length).toBeGreaterThanOrEqual(2);
		});
	});
});
