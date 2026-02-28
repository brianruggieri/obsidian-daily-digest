/**
 * Integration tests for the daily note merge & backup safety system.
 *
 * These tests simulate the full round-trip:
 *   generate -> user edits -> regenerate -> verify preservation
 *
 * They also test the backup/fallback safety guarantees.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { renderMarkdown } from "../../src/render/renderer";
import {
	extractUserContent,
	mergeContent,
	createBackup,
	hasUserEdits,
	VaultAdapter,
	ExtractionResult,
} from "../../src/render/merge";
import {
	AISummary,
	BrowserVisit,
	SearchQuery,
	ClaudeSession,
	CategorizedVisits,
	slugifyQuestion,
} from "../../src/types";

// ── Fixtures ─────────────────────────────────────────────

const DATE = new Date("2025-06-15T00:00:00");

const visits: BrowserVisit[] = [
	{ url: "https://github.com/repo", title: "My Repo", time: new Date("2025-06-15T10:00:00"), domain: "github.com" },
	{ url: "https://stackoverflow.com/q/123", title: "React Hooks Q&A", time: new Date("2025-06-15T10:15:00"), domain: "stackoverflow.com" },
];
const searches: SearchQuery[] = [
	{ query: "react hooks tutorial", time: new Date("2025-06-15T10:30:00"), engine: "google.com" },
	{ query: "typescript generics", time: new Date("2025-06-15T11:00:00"), engine: "google.com" },
];
const claude: ClaudeSession[] = [
	{ prompt: "Fix the auth bug", time: new Date("2025-06-15T11:30:00"), project: "webapp", isConversationOpener: true, conversationFile: "session.jsonl", conversationTurnCount: 1 },
];
const categorized: CategorizedVisits = {
	dev: visits,
};
const aiSummary: AISummary = {
	headline: "Deep dive into React auth",
	tldr: "Focused on authentication patterns.",
	themes: ["React", "Auth"],
	category_summaries: { dev: "Code and research" },
	notable: ["Implemented PKCE flow"],
	questions: ["Should we use sessions or JWTs?", "Is PKCE worth the complexity?"],
};

const Q1 = "Should we use sessions or JWTs?";
const Q2 = "Is PKCE worth the complexity?";
const SLUG1 = `reflect_${slugifyQuestion(Q1)}`;
const SLUG2 = `reflect_${slugifyQuestion(Q2)}`;

function render(ai: AISummary | null = aiSummary): string {
	return renderMarkdown(DATE, visits, searches, claude, [], categorized, ai);
}

// ── Mock Vault ───────────────────────────────────────────

function createMockVault(): VaultAdapter & {
	files: Map<string, string>;
	folders: Set<string>;
} {
	const files = new Map<string, string>();
	const folders = new Set<string>();
	return {
		files,
		folders,
		getAbstractFileByPath(path: string) {
			if (files.has(path) || folders.has(path)) {
				return { path };
			}
			return null;
		},
		async create(path: string, content: string) {
			files.set(path, content);
			return { path };
		},
		async createFolder(path: string) {
			folders.add(path);
		},
	};
}

// ═══════════════════════════════════════════════════════════
// Full Round-Trip Tests
// ═══════════════════════════════════════════════════════════

describe("full round-trip: generate -> edit -> regenerate", () => {
	it("preserves user notes across regeneration", () => {
		// Step 1: Generate initial note
		const initial = render();

		// Step 2: User adds notes
		const edited = initial.replace(
			"_Anything else on your mind today?_",
			"Today was productive. I finally understood PKCE.\n\nNext step: implement refresh tokens."
		);

		// Step 3: Regenerate (different AI summary simulating new data)
		const newSummary: AISummary = {
			...aiSummary,
			headline: "Auth day continued",
			tldr: "Continued work on OAuth implementation.",
		};
		const regenerated = renderMarkdown(DATE, visits, searches, claude, [], categorized, newSummary);

		// Step 4: Merge
		const extraction = extractUserContent(edited);
		const merged = mergeContent(regenerated, extraction);

		// Verify: user notes preserved
		expect(merged).toContain("Today was productive. I finally understood PKCE.");
		expect(merged).toContain("Next step: implement refresh tokens.");
		// Verify: new AI content present
		expect(merged).toContain("Auth day continued");
		expect(merged).toContain("Continued work on OAuth implementation.");
		// Verify: old placeholder NOT present
		// Soft close placeholder should still exist (user notes prepended before it)
		expect(merged).toContain("Anything else on your mind today?");
	});

	it("preserves reflection answers across regeneration", () => {
		const initial = render();

		// User answers both reflection questions via Dataview inline fields
		let edited = initial.replace(
			`${SLUG1}:: `,
			`${SLUG1}:: JWTs with short expiry and refresh rotation`
		);
		edited = edited.replace(
			`${SLUG2}:: `,
			`${SLUG2}:: Yes, essential for public clients`
		);

		const regenerated = render();
		const extraction = extractUserContent(edited);
		const merged = mergeContent(regenerated, extraction);

		expect(merged).toContain("JWTs with short expiry and refresh rotation");
		expect(merged).toContain("Yes, essential for public clients");
	});

	it("preserves custom sections across regeneration", () => {
		const initial = render();

		// User adds a custom section
		const customSection = "## Action Items\n\n- [ ] Review PR #42\n- [ ] Update API docs\n- [x] Fix auth bug";
		const footerIdx = initial.lastIndexOf("\n---\n");
		const edited = initial.slice(0, footerIdx) + "\n\n" + customSection + initial.slice(footerIdx);

		const regenerated = render();
		const extraction = extractUserContent(edited);
		const merged = mergeContent(regenerated, extraction);

		expect(merged).toContain("## Action Items");
		expect(merged).toContain("- [ ] Review PR #42");
		expect(merged).toContain("- [x] Fix auth bug");
	});

	it("preserves all user content types together across regeneration", () => {
		const initial = render();

		// User edits notes
		let edited = initial.replace(
			"_Anything else on your mind today?_",
			"Great progress today on the auth system."
		);
		// User answers a question
		edited = edited.replace(
			`${SLUG1}:: `,
			`${SLUG1}:: Leaning toward sessions for simplicity`
		);
		// User adds a custom section
		const customSection = "## Tomorrow\n\n- Deploy to staging\n- Write migration script";
		const footerIdx = edited.lastIndexOf("\n---\n");
		edited = edited.slice(0, footerIdx) + "\n\n" + customSection + edited.slice(footerIdx);

		const regenerated = render();
		const extraction = extractUserContent(edited);
		const merged = mergeContent(regenerated, extraction);

		expect(merged).toContain("Great progress today on the auth system.");
		expect(merged).toContain("Leaning toward sessions for simplicity");
		expect(merged).toContain("## Tomorrow");
		expect(merged).toContain("Deploy to staging");
	});
});

// ═══════════════════════════════════════════════════════════
// Multiple Regeneration Cycles
// ═══════════════════════════════════════════════════════════

describe("multiple regeneration cycles", () => {
	it("does not accumulate duplicate content across 5 regenerations", () => {
		const userNotes = "My important reflection that must survive.";
		let current = render();
		current = current.replace("_Anything else on your mind today?_", userNotes);

		for (let cycle = 0; cycle < 5; cycle++) {
			const fresh = render();
			const extraction = extractUserContent(current);
			current = mergeContent(fresh, extraction);
		}

		// Count occurrences -- should be exactly 1
		const count = (current.match(/My important reflection that must survive\./g) || []).length;
		expect(count).toBe(1);
	});

	it("preserves user content that was added in different regeneration cycles", () => {
		// Cycle 1: user adds notes
		let current = render();
		current = current.replace("_Anything else on your mind today?_", "Notes from cycle 1");

		// Cycle 2: regenerate and user adds a custom section
		let fresh = render();
		let extraction = extractUserContent(current);
		current = mergeContent(fresh, extraction);
		const customSection = "## Cycle 2 Additions\n\n- Added in cycle 2";
		const footerIdx = current.lastIndexOf("\n---\n");
		current = current.slice(0, footerIdx) + "\n\n" + customSection + current.slice(footerIdx);

		// Cycle 3: regenerate again
		fresh = render();
		extraction = extractUserContent(current);
		current = mergeContent(fresh, extraction);

		// Both should survive
		expect(current).toContain("Notes from cycle 1");
		expect(current).toContain("## Cycle 2 Additions");
		expect(current).toContain("Added in cycle 2");
	});
});

// ═══════════════════════════════════════════════════════════
// Backup Safety
// ═══════════════════════════════════════════════════════════

describe("backup safety", () => {
	let vault: ReturnType<typeof createMockVault>;

	beforeEach(() => {
		vault = createMockVault();
	});

	it("backup contains exact copy of original file", async () => {
		const original = render().replace("_Anything else on your mind today?_", "My precious notes");
		const backupPath = await createBackup(vault, "daily/2025-06-15.md", original);

		const backupContent = vault.files.get(backupPath);
		expect(backupContent).toBe(original);
	});

	it("backup is recoverable even if merge produces garbage", async () => {
		const original = "User's important content\n\nWith multiple\nparagraphs.";
		const backupPath = await createBackup(vault, "daily/2025-06-15.md", original);

		// Simulate a catastrophic merge failure
		vault.files.set("daily/2025-06-15.md", "CORRUPTED CONTENT");

		// Recovery: backup still has the original
		const recovered = vault.files.get(backupPath);
		expect(recovered).toBe(original);
		expect(recovered).toContain("User's important content");
		expect(recovered).toContain("With multiple\nparagraphs.");
	});

	it("creates separate backups for each regeneration", async () => {
		const v1 = "Version 1 content";
		const v2 = "Version 2 content";

		const path1 = await createBackup(vault, "daily/2025-06-15.md", v1);
		await new Promise(r => setTimeout(r, 5));
		const path2 = await createBackup(vault, "daily/2025-06-15.md", v2);

		expect(vault.files.get(path1)).toBe(v1);
		expect(vault.files.get(path2)).toBe(v2);
		expect(path1).not.toBe(path2);
	});

	it("skips backup when file has no user edits", () => {
		const unedited = render();
		const extraction = extractUserContent(unedited);
		expect(hasUserEdits(extraction)).toBe(false);
	});

	it("requires backup when file has user edits", () => {
		const edited = render().replace("_Anything else on your mind today?_", "User was here");
		const extraction = extractUserContent(edited);
		expect(hasUserEdits(extraction)).toBe(true);
	});
});

// ═══════════════════════════════════════════════════════════
// Fallback Merge (extraction failure)
// ═══════════════════════════════════════════════════════════

describe("fallback merge safety", () => {
	it("preserves entire old content when extraction returns null", () => {
		const oldContent = [
			"# My Custom Daily Note",
			"",
			"I created this manually before the plugin existed.",
			"",
			"## My Section",
			"",
			"- Important item 1",
			"- Important item 2",
			"",
			"## Another Section",
			"",
			"Detailed notes about my day...",
		].join("\n");

		const newMd = render();
		const extraction: ExtractionResult = { content: null, raw: oldContent };
		const merged = mergeContent(newMd, extraction);

		// New content present
		expect(merged).toContain("Deep dive into React auth");
		// Old content fully preserved
		expect(merged).toContain("Previous Content (preserved)");
		expect(merged).toContain("I created this manually before the plugin existed.");
		expect(merged).toContain("Important item 1");
		expect(merged).toContain("Important item 2");
		expect(merged).toContain("Detailed notes about my day...");
	});

	it("fallback includes user-friendly explanation", () => {
		const extraction: ExtractionResult = { content: null, raw: "old stuff" };
		const merged = mergeContent(render(), extraction);

		expect(merged).toContain("had content written before Daily Digest first generated it");
		expect(merged).toContain("will remain through future regenerations");
	});
});

// ═══════════════════════════════════════════════════════════
// Edge Cases & Stress Tests
// ═══════════════════════════════════════════════════════════

describe("edge cases and stress tests", () => {
	it("handles very large user notes (10KB+)", () => {
		const largeNotes = Array.from({ length: 200 }, (_, i) =>
			`Paragraph ${i + 1}: ${"Lorem ipsum dolor sit amet. ".repeat(5)}`
		).join("\n\n");

		const edited = render().replace("_Anything else on your mind today?_", largeNotes);
		const extraction = extractUserContent(edited);
		const merged = mergeContent(render(), extraction);

		expect(merged).toContain("Paragraph 1:");
		expect(merged).toContain("Paragraph 100:");
		expect(merged).toContain("Paragraph 200:");
	});

	it("handles user notes with code blocks containing markdown headings", () => {
		const notes = [
			"Here's an example:",
			"",
			"```markdown",
			"## This is inside a code block",
			"### This too",
			"```",
			"",
			"And back to normal notes.",
		].join("\n");

		const edited = render().replace("_Anything else on your mind today?_", notes);
		const extraction = extractUserContent(edited);
		const merged = mergeContent(render(), extraction);

		expect(merged).toContain("Here's an example:");
		expect(merged).toContain("And back to normal notes.");
	});

	it("handles file that was manually created (not by plugin)", () => {
		const manualFile = [
			"---",
			"date: 2025-06-15",
			"---",
			"",
			"# My Manual Notes",
			"",
			"I wrote this before installing the plugin.",
			"",
			"## Important Thoughts",
			"",
			"These must survive plugin regeneration.",
		].join("\n");

		const extraction = extractUserContent(manualFile);
		const merged = mergeContent(render(), extraction);

		// The manual content should be preserved as custom sections
		expect(merged).toContain("Important Thoughts");
		expect(merged).toContain("These must survive plugin regeneration.");
	});

	it("handles note with no AI summary (no reflection section)", () => {
		const noAiNote = renderMarkdown(
			DATE, visits, searches, claude, [], categorized, null,
		);
		// Without AI summary, there's no Reflection section or soft close.
		// Add a custom section to simulate user content.
		const footerIdx = noAiNote.lastIndexOf("\n---\n");
		const edited = noAiNote.slice(0, footerIdx) + "\n\n## My Notes\n\nNotes without AI" + noAiNote.slice(footerIdx);
		const extraction = extractUserContent(edited);
		const merged = mergeContent(render(), extraction);

		expect(merged).toContain("Notes without AI");
	});

	it("does not lose data when new note has fewer sections than old", () => {
		// Old note had AI summary, new note doesn't
		const oldWithAI = render(aiSummary).replace("_Anything else on your mind today?_", "My reflections");
		const newWithoutAI = renderMarkdown(DATE, visits, searches, claude, [], categorized, null);

		const extraction = extractUserContent(oldWithAI);
		const merged = mergeContent(newWithoutAI, extraction);

		expect(merged).toContain("My reflections");
	});

	it("handles empty string as existing file content", () => {
		const extraction = extractUserContent("");
		const merged = mergeContent(render(), extraction);
		// Should just return the new content unchanged
		expect(merged).toBe(render());
	});
});

// ═══════════════════════════════════════════════════════════
// Privacy: No Data Retention
// ═══════════════════════════════════════════════════════════

describe("privacy: no external data retention", () => {
	it("merge operates purely on in-memory strings", () => {
		const edited = render().replace("_Anything else on your mind today?_", "Private thoughts");
		const extraction = extractUserContent(edited);
		const merged = mergeContent(render(), extraction);

		expect(typeof extraction.raw).toBe("string");
		expect(typeof merged).toBe("string");
	});

	it("backup only writes to vault (user's local filesystem)", async () => {
		const vault = createMockVault();
		const content = "User's private data";

		await createBackup(vault, "daily/note.md", content);

		const backupEntries = Array.from(vault.files.entries())
			.filter(([k]) => k.startsWith(".daily-digest-backup/"));

		expect(backupEntries.length).toBe(1);
		expect(backupEntries[0][1]).toBe(content);
	});

	it("extraction result contains no references beyond the input string", () => {
		const md = render().replace("_Anything else on your mind today?_", "Secret notes");
		const extraction = extractUserContent(md);

		expect(extraction.raw).toBe(md);
		expect(extraction.content!.notesText).toBe("Secret notes");
	});
});
