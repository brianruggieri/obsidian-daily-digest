import { describe, it, expect, beforeEach } from "vitest";
import { SECRET_ID } from "../../src/settings/types";

/**
 * Tests for the SecretStorage API key resolution logic.
 *
 * We test the logic directly rather than instantiating the full plugin,
 * since Plugin requires a real Obsidian runtime. The functions under test
 * are small and deterministic — we replicate them here with the same logic.
 */

// ── Helpers that mirror the plugin's logic ──────────────────────────

interface MockSecretStorage {
	getSecret: (id: string) => string | null;
	setSecret: (id: string, secret: string) => void;
	listSecrets: () => string[];
}

interface MockApp {
	secretStorage: MockSecretStorage;
}

function getAnthropicApiKey(
	app: MockApp,
	envKey?: string,
): string {
	const stored = app.secretStorage.getSecret(SECRET_ID);
	return stored || envKey || "";
}

// ── Tests ───────────────────────────────────────────────────────────

describe("SECRET_ID constant", () => {
	it("is a lowercase alphanumeric string with dashes", () => {
		expect(SECRET_ID).toBe("anthropic-api-key");
		expect(SECRET_ID).toMatch(/^[a-z0-9-]+$/);
	});
});

describe("getAnthropicApiKey", () => {
	let secretStore: Map<string, string>;
	let app: MockApp;

	beforeEach(() => {
		secretStore = new Map();
		app = {
			secretStorage: {
				getSecret: (id: string) => secretStore.get(id) ?? null,
				setSecret: (id: string, secret: string) => {
					secretStore.set(id, secret);
				},
				listSecrets: () => [...secretStore.keys()],
			},
		};
	});

	it("returns key from SecretStorage when available", () => {
		secretStore.set(SECRET_ID, "sk-ant-secret");
		expect(getAnthropicApiKey(app)).toBe("sk-ant-secret");
	});

	it("prefers SecretStorage over environment variable", () => {
		secretStore.set(SECRET_ID, "sk-ant-secret");
		expect(getAnthropicApiKey(app, "sk-ant-env")).toBe("sk-ant-secret");
	});

	it("falls back to env var when SecretStorage is empty", () => {
		expect(getAnthropicApiKey(app, "sk-ant-env")).toBe("sk-ant-env");
	});

	it("returns empty string when no key is available", () => {
		expect(getAnthropicApiKey(app)).toBe("");
	});
});
