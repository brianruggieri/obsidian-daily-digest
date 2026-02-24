import { describe, it, expect } from "vitest";
import { PRIVACY_DESCRIPTIONS } from "../../src/plugin/privacy";

describe("Git privacy descriptions", () => {
	it("should have a git entry in PRIVACY_DESCRIPTIONS", () => {
		expect(PRIVACY_DESCRIPTIONS.git).toBeDefined();
		expect(PRIVACY_DESCRIPTIONS.git.label).toBe("Git commit history");
		expect(PRIVACY_DESCRIPTIONS.git.access).toContain("git log");
		expect(PRIVACY_DESCRIPTIONS.git.files).toContain(".git");
		expect(PRIVACY_DESCRIPTIONS.git.destination).toContain("Commit messages");
	});
});
