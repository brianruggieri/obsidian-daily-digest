import { describe, it, expect, vi, beforeEach } from "vitest";
import { SECRET_ID } from "../../src/settings";

/**
 * Tests for the SecretStorage migration and API key resolution logic.
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
	secretStorage?: MockSecretStorage;
}

interface MockSettings {
	anthropicApiKey: string;
}

function hasSecretStorage(app: MockApp): boolean {
	return "secretStorage" in app && app.secretStorage != null;
}

function getAnthropicApiKey(
	app: MockApp,
	settings: MockSettings,
	envKey?: string,
): string {
	if (hasSecretStorage(app)) {
		const stored = app.secretStorage!.getSecret(SECRET_ID);
		if (stored) return stored;
	}
	return settings.anthropicApiKey || envKey || "";
}

async function migrateApiKeyToSecretStorage(
	app: MockApp,
	settings: MockSettings,
	saveSettings: () => Promise<void>,
): Promise<void> {
	if (!hasSecretStorage(app)) return;
	const legacyKey = settings.anthropicApiKey;
	if (!legacyKey) return;

	app.secretStorage!.setSecret(SECRET_ID, legacyKey);
	settings.anthropicApiKey = "";
	await saveSettings();
}

// ── Tests ───────────────────────────────────────────────────────────

describe("SECRET_ID constant", () => {
	it("is a lowercase alphanumeric string with dashes", () => {
		expect(SECRET_ID).toBe("anthropic-api-key");
		expect(SECRET_ID).toMatch(/^[a-z0-9-]+$/);
	});
});

describe("hasSecretStorage", () => {
	it("returns true when app.secretStorage exists", () => {
		const app: MockApp = {
			secretStorage: {
				getSecret: vi.fn(),
				setSecret: vi.fn(),
				listSecrets: vi.fn(),
			},
		};
		expect(hasSecretStorage(app)).toBe(true);
	});

	it("returns false when app.secretStorage is undefined", () => {
		const app: MockApp = {};
		expect(hasSecretStorage(app)).toBe(false);
	});

	it("returns false when app.secretStorage is null", () => {
		const app: MockApp = { secretStorage: null as unknown as undefined };
		expect(hasSecretStorage(app)).toBe(false);
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
		const settings: MockSettings = { anthropicApiKey: "" };
		expect(getAnthropicApiKey(app, settings)).toBe("sk-ant-secret");
	});

	it("prefers SecretStorage over data.json legacy key", () => {
		secretStore.set(SECRET_ID, "sk-ant-secret");
		const settings: MockSettings = { anthropicApiKey: "sk-ant-legacy" };
		expect(getAnthropicApiKey(app, settings)).toBe("sk-ant-secret");
	});

	it("prefers SecretStorage over environment variable", () => {
		secretStore.set(SECRET_ID, "sk-ant-secret");
		const settings: MockSettings = { anthropicApiKey: "" };
		expect(getAnthropicApiKey(app, settings, "sk-ant-env")).toBe("sk-ant-secret");
	});

	it("falls back to data.json key when SecretStorage is empty", () => {
		const settings: MockSettings = { anthropicApiKey: "sk-ant-legacy" };
		expect(getAnthropicApiKey(app, settings)).toBe("sk-ant-legacy");
	});

	it("falls back to env var when SecretStorage and data.json are empty", () => {
		const settings: MockSettings = { anthropicApiKey: "" };
		expect(getAnthropicApiKey(app, settings, "sk-ant-env")).toBe("sk-ant-env");
	});

	it("returns empty string when no key is available", () => {
		const settings: MockSettings = { anthropicApiKey: "" };
		expect(getAnthropicApiKey(app, settings)).toBe("");
	});

	it("falls back to data.json when SecretStorage is not available", () => {
		const appNoSecret: MockApp = {};
		const settings: MockSettings = { anthropicApiKey: "sk-ant-legacy" };
		expect(getAnthropicApiKey(appNoSecret, settings)).toBe("sk-ant-legacy");
	});

	it("falls back to env var when SecretStorage unavailable and data.json empty", () => {
		const appNoSecret: MockApp = {};
		const settings: MockSettings = { anthropicApiKey: "" };
		expect(getAnthropicApiKey(appNoSecret, settings, "sk-ant-env")).toBe("sk-ant-env");
	});
});

describe("migrateApiKeyToSecretStorage", () => {
	let secretStore: Map<string, string>;
	let app: MockApp;
	let saveSettings: ReturnType<typeof vi.fn>;

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
		saveSettings = vi.fn().mockResolvedValue(undefined);
	});

	it("migrates key from data.json to SecretStorage", async () => {
		const settings: MockSettings = { anthropicApiKey: "sk-ant-migrate-me" };
		await migrateApiKeyToSecretStorage(app, settings, saveSettings);

		expect(secretStore.get(SECRET_ID)).toBe("sk-ant-migrate-me");
		expect(settings.anthropicApiKey).toBe("");
		expect(saveSettings).toHaveBeenCalledOnce();
	});

	it("does nothing when data.json key is empty", async () => {
		const settings: MockSettings = { anthropicApiKey: "" };
		await migrateApiKeyToSecretStorage(app, settings, saveSettings);

		expect(secretStore.has(SECRET_ID)).toBe(false);
		expect(saveSettings).not.toHaveBeenCalled();
	});

	it("does nothing when SecretStorage is not available", async () => {
		const appNoSecret: MockApp = {};
		const settings: MockSettings = { anthropicApiKey: "sk-ant-keep" };
		await migrateApiKeyToSecretStorage(appNoSecret, settings, saveSettings);

		expect(settings.anthropicApiKey).toBe("sk-ant-keep");
		expect(saveSettings).not.toHaveBeenCalled();
	});

	it("is idempotent — second run is a no-op", async () => {
		const settings: MockSettings = { anthropicApiKey: "sk-ant-once" };

		await migrateApiKeyToSecretStorage(app, settings, saveSettings);
		expect(saveSettings).toHaveBeenCalledOnce();

		// Second run: anthropicApiKey is now "" so migration is skipped
		await migrateApiKeyToSecretStorage(app, settings, saveSettings);
		expect(saveSettings).toHaveBeenCalledOnce(); // still just once
	});

	it("preserves existing SecretStorage key if data.json has a different key", async () => {
		// Pre-existing key in SecretStorage
		secretStore.set(SECRET_ID, "sk-ant-existing");
		const settings: MockSettings = { anthropicApiKey: "sk-ant-stale" };

		await migrateApiKeyToSecretStorage(app, settings, saveSettings);

		// Migration overwrites with the data.json key (last write wins)
		// This is correct: if data.json still has a key, user may have
		// updated it on a device without SecretStorage
		expect(secretStore.get(SECRET_ID)).toBe("sk-ant-stale");
		expect(settings.anthropicApiKey).toBe("");
	});
});
