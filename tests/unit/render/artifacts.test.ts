import { describe, it, expect } from "vitest";
import {
	writeTopicNote,
	writeEntityNote,
	writeSeedNote,
	writeWeeklyMOC,
	writeArtifacts,
	extractTopicNames,
	extractEntityNames,
	isoWeek,
	type ArtifactVault,
} from "../../../src/render/artifacts";
import type { KnowledgeSections } from "../../../src/analyze/knowledge";
import type { AISummary } from "../../../src/types";
import type { DailyDigestSettings } from "../../../src/settings/types";
import { DEFAULT_SETTINGS } from "../../../src/settings/types";

// ── Helpers ──────────────────────────────────────────────

const DATE = new Date("2026-02-27T00:00:00");
const DATE_STR = "2026-02-27";

function makeSettings(overrides: Partial<DailyDigestSettings> = {}): DailyDigestSettings {
	return {
		...DEFAULT_SETTINGS,
		dailyFolder: "daily",
		filenameTemplate: "YYYY-MM-DD",
		artifactFolders: {
			topics: "Topics",
			entities: "Entities",
			seeds: "Seeds",
			mocs: "MOCs",
		},
		...overrides,
	};
}

function makeVault(existing: Record<string, string> = {}): ArtifactVault & { created: Record<string, string>; modified: Record<string, string> } {
	const files = { ...existing };
	const created: Record<string, string> = {};
	const modified: Record<string, string> = {};

	return {
		getAbstractFileByPath(path: string) {
			return files[path] !== undefined ? { path } : null;
		},
		async create(path: string, content: string) {
			files[path] = content;
			created[path] = content;
		},
		async modify(file: { path: string }, content: string) {
			files[file.path] = content;
			modified[file.path] = content;
		},
		async read(file: { path: string }) {
			return files[file.path] ?? "";
		},
		async createFolder(_path: string) {
			// no-op in tests
		},
		created,
		modified,
	};
}

function makeKnowledge(overrides: Partial<KnowledgeSections> = {}): KnowledgeSections {
	return {
		focusSummary: "Highly focused day",
		focusScore: 0.8,
		temporalInsights: [],
		topicMap: [
			"███ typescript ↔ testing (4 co-occurrences)",
			"authentication (2 mentions)",
		],
		entityGraph: [
			"React ↔ TypeScript (3x in research, implementation)",
		],
		recurrenceNotes: [],
		knowledgeDeltaLines: [],
		tags: [],
		...overrides,
	};
}

function makeAISummary(overrides: Partial<AISummary> = {}): AISummary {
	return {
		headline: "Productive day",
		tldr: "Good day",
		themes: ["TypeScript"],
		category_summaries: {},
		notable: [],
		questions: [],
		note_seeds: ["OAuth2 Deep Dive", "TypeScript Generics"],
		...overrides,
	};
}

// ═══════════════════════════════════════════════════════════
// isoWeek
// ═══════════════════════════════════════════════════════════

describe("isoWeek", () => {
	it("returns correct ISO week for a known date", () => {
		// 2026-02-27 is Friday of week 9
		expect(isoWeek(new Date("2026-02-27"))).toBe("2026-W09");
	});

	it("returns week 1 for first week of year", () => {
		// 2026-01-01 is Thursday, which is in week 1
		const result = isoWeek(new Date("2026-01-01"));
		expect(result).toMatch(/^\d{4}-W\d{2}$/);
	});

	it("returns consistent format YYYY-WWW", () => {
		const result = isoWeek(new Date("2026-03-15"));
		expect(result).toMatch(/^\d{4}-W\d{2}$/);
	});
});

// ═══════════════════════════════════════════════════════════
// extractTopicNames
// ═══════════════════════════════════════════════════════════

describe("extractTopicNames", () => {
	it("extracts topics from co-occurrence lines", () => {
		const k = makeKnowledge({
			topicMap: [
				"███ typescript ↔ testing (4 co-occurrences)",
				"█ react ↔ hooks (2 co-occurrences)",
			],
		});
		const names = extractTopicNames(k);
		expect(names).toContain("typescript");
		expect(names).toContain("testing");
		expect(names).toContain("react");
		expect(names).toContain("hooks");
	});

	it("extracts topics from single-topic lines", () => {
		const k = makeKnowledge({
			topicMap: ["authentication (3 mentions)"],
		});
		const names = extractTopicNames(k);
		expect(names).toContain("authentication");
	});

	it("returns empty array for empty topicMap", () => {
		const k = makeKnowledge({ topicMap: [] });
		expect(extractTopicNames(k)).toHaveLength(0);
	});

	it("deduplicates topic names", () => {
		const k = makeKnowledge({
			topicMap: [
				"typescript ↔ testing (4 co-occurrences)",
				"typescript (2 mentions)",
			],
		});
		const names = extractTopicNames(k);
		const tsCount = names.filter((n) => n === "typescript").length;
		expect(tsCount).toBe(1);
	});
});

// ═══════════════════════════════════════════════════════════
// extractEntityNames
// ═══════════════════════════════════════════════════════════

describe("extractEntityNames", () => {
	it("extracts entity names from entity graph lines", () => {
		const k = makeKnowledge({
			entityGraph: ["React ↔ TypeScript (3x in research, implementation)"],
		});
		const names = extractEntityNames(k);
		expect(names).toContain("React");
		expect(names).toContain("TypeScript");
	});

	it("returns empty array for empty entityGraph", () => {
		const k = makeKnowledge({ entityGraph: [] });
		expect(extractEntityNames(k)).toHaveLength(0);
	});
});

// ═══════════════════════════════════════════════════════════
// writeTopicNote
// ═══════════════════════════════════════════════════════════

describe("writeTopicNote", () => {
	it("creates a new topic note when it doesn't exist", async () => {
		const vault = makeVault();
		const settings = makeSettings();

		await writeTopicNote(vault, "TypeScript", DATE, settings);

		const filePath = "Topics/typescript.md";
		expect(vault.created[filePath]).toBeDefined();
		expect(vault.created[filePath]).toContain("# TypeScript");
		expect(vault.created[filePath]).toContain("type: topic");
		expect(vault.created[filePath]).toContain(`[[daily/2026-02-27]]`);
		expect(vault.created[filePath]).toContain(DATE_STR);
	});

	it("appends a backlink to an existing topic note", async () => {
		const existingContent = `---\ntype: topic\ncreated: 2026-02-20\n---\n\n# TypeScript\n\n## Daily Digest Appearances\n\n- [[daily/2026-02-20]] — 2026-02-20\n`;
		const vault = makeVault({ "Topics/typescript.md": existingContent });
		const settings = makeSettings();

		await writeTopicNote(vault, "TypeScript", DATE, settings);

		expect(vault.modified["Topics/typescript.md"]).toBeDefined();
		expect(vault.modified["Topics/typescript.md"]).toContain("2026-02-27");
		expect(vault.modified["Topics/typescript.md"]).toContain("2026-02-20"); // original preserved
	});

	it("does not duplicate entry if already linked", async () => {
		const existingContent = `---\ntype: topic\n---\n\n# TypeScript\n\n## Daily Digest Appearances\n\n- [[daily/2026-02-27]] — 2026-02-27\n`;
		const vault = makeVault({ "Topics/typescript.md": existingContent });
		const settings = makeSettings();

		await writeTopicNote(vault, "TypeScript", DATE, settings);

		// Should NOT modify since already linked
		expect(vault.modified["Topics/typescript.md"]).toBeUndefined();
	});
});

// ═══════════════════════════════════════════════════════════
// writeEntityNote
// ═══════════════════════════════════════════════════════════

describe("writeEntityNote", () => {
	it("creates a new entity note when it doesn't exist", async () => {
		const vault = makeVault();
		const settings = makeSettings();

		await writeEntityNote(vault, "React", DATE, settings);

		const filePath = "Entities/react.md";
		expect(vault.created[filePath]).toBeDefined();
		expect(vault.created[filePath]).toContain("# React");
		expect(vault.created[filePath]).toContain("type: entity");
	});

	it("appends a backlink to an existing entity note", async () => {
		const existingContent = `---\ntype: entity\ncreated: 2026-02-01\n---\n\n# React\n\n## Daily Digest Appearances\n\n`;
		const vault = makeVault({ "Entities/react.md": existingContent });
		const settings = makeSettings();

		await writeEntityNote(vault, "React", DATE, settings);

		expect(vault.modified["Entities/react.md"]).toContain(DATE_STR);
	});
});

// ═══════════════════════════════════════════════════════════
// writeSeedNote
// ═══════════════════════════════════════════════════════════

describe("writeSeedNote", () => {
	it("creates a new seed note when it doesn't exist", async () => {
		const vault = makeVault();
		const settings = makeSettings();

		await writeSeedNote(vault, "OAuth2 Deep Dive", DATE, settings);

		const filePath = "Seeds/oauth2-deep-dive.md";
		expect(vault.created[filePath]).toBeDefined();
		expect(vault.created[filePath]).toContain("# OAuth2 Deep Dive");
		expect(vault.created[filePath]).toContain("type: seed");
		expect(vault.created[filePath]).toContain("status: stub");
	});

	it("does not overwrite an existing seed note", async () => {
		const existingContent = "# OAuth2 Deep Dive\n\nUser has written content here.\n";
		const vault = makeVault({ "Seeds/oauth2-deep-dive.md": existingContent });
		const settings = makeSettings();

		await writeSeedNote(vault, "OAuth2 Deep Dive", DATE, settings);

		// Should not create or modify
		expect(vault.created["Seeds/oauth2-deep-dive.md"]).toBeUndefined();
		expect(vault.modified["Seeds/oauth2-deep-dive.md"]).toBeUndefined();
	});
});

// ═══════════════════════════════════════════════════════════
// writeWeeklyMOC
// ═══════════════════════════════════════════════════════════

describe("writeWeeklyMOC", () => {
	it("creates a new weekly MOC when it doesn't exist", async () => {
		const vault = makeVault();
		const settings = makeSettings();

		await writeWeeklyMOC(vault, DATE, ["typescript", "testing"], settings);

		const filePath = "MOCs/Weekly/2026-W09.md";
		expect(vault.created[filePath]).toBeDefined();
		expect(vault.created[filePath]).toContain("# Week 2026-W09");
		expect(vault.created[filePath]).toContain("[[daily/2026-02-27]]");
		expect(vault.created[filePath]).toContain("Topics/typescript");
	});

	it("appends to an existing weekly MOC", async () => {
		const existingContent = `---\ntype: moc\nweek: 2026-W09\n---\n\n# Week 2026-W09\n\n## Daily Notes\n\n- [[daily/2026-02-26]] — 2026-02-26\n`;
		const vault = makeVault({ "MOCs/Weekly/2026-W09.md": existingContent });
		const settings = makeSettings();

		await writeWeeklyMOC(vault, DATE, ["typescript"], settings);

		expect(vault.modified["MOCs/Weekly/2026-W09.md"]).toBeDefined();
		expect(vault.modified["MOCs/Weekly/2026-W09.md"]).toContain("2026-02-27");
		expect(vault.modified["MOCs/Weekly/2026-W09.md"]).toContain("2026-02-26"); // original preserved
	});

	it("does not duplicate if daily note already linked", async () => {
		const existingContent = `---\ntype: moc\n---\n\n# Week 2026-W09\n\n## Daily Notes\n\n- [[daily/2026-02-27]] — 2026-02-27\n`;
		const vault = makeVault({ "MOCs/Weekly/2026-W09.md": existingContent });
		const settings = makeSettings();

		await writeWeeklyMOC(vault, DATE, [], settings);

		expect(vault.modified["MOCs/Weekly/2026-W09.md"]).toBeUndefined();
	});
});

// ═══════════════════════════════════════════════════════════
// writeArtifacts — integration
// ═══════════════════════════════════════════════════════════

describe("writeArtifacts", () => {
	it("writes topics, entities, seeds, and MOC", async () => {
		const vault = makeVault();
		const settings = makeSettings();
		const knowledge = makeKnowledge();
		const aiSummary = makeAISummary();

		const result = await writeArtifacts(vault, DATE, knowledge, aiSummary, settings);

		expect(result.topicsWritten).toBeGreaterThan(0);
		expect(result.entitiesWritten).toBeGreaterThan(0);
		expect(result.seedsWritten).toBe(2); // oauth2-deep-dive, typescript-generics
		expect(result.mocWritten).toBe(true);
	});

	it("returns zero counts for empty knowledge sections", async () => {
		const vault = makeVault();
		const settings = makeSettings();
		const knowledge = makeKnowledge({ topicMap: [], entityGraph: [] });
		const aiSummary = makeAISummary({ note_seeds: [] });

		const result = await writeArtifacts(vault, DATE, knowledge, aiSummary, settings);

		expect(result.topicsWritten).toBe(0);
		expect(result.entitiesWritten).toBe(0);
		expect(result.seedsWritten).toBe(0);
		expect(result.mocWritten).toBe(true); // MOC always attempted
	});

	it("handles null aiSummary gracefully", async () => {
		const vault = makeVault();
		const settings = makeSettings();
		const knowledge = makeKnowledge();

		const result = await writeArtifacts(vault, DATE, knowledge, null, settings);

		expect(result.seedsWritten).toBe(0);
		expect(result.mocWritten).toBe(true);
	});

	it("respects custom artifact folder settings", async () => {
		const vault = makeVault();
		const settings = makeSettings({
			artifactFolders: {
				topics: "Notes/Topics",
				entities: "Notes/Entities",
				seeds: "Notes/Seeds",
				mocs: "Notes/MOCs",
			},
		});
		const knowledge = makeKnowledge({ topicMap: ["authentication (2 mentions)"] });
		const aiSummary = makeAISummary({ note_seeds: [] });

		await writeArtifacts(vault, DATE, knowledge, aiSummary, settings);

		expect(vault.created["Notes/Topics/authentication.md"]).toBeDefined();
	});
});
