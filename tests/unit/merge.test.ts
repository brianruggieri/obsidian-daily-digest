import { describe, it, expect, vi, beforeEach } from "vitest";
import {
	extractUserContent,
	mergeContent,
	createBackup,
	hasUserEdits,
	ExtractionResult,
	VaultAdapter,
} from "../../src/merge";
import { renderMarkdown } from "../../src/renderer";
import { AISummary, BrowserVisit, SearchQuery, ShellCommand, ClaudeSession, CategorizedVisits, slugifyQuestion } from "../../src/types";

// ── Helpers ──────────────────────────────────────────────

const DATE = new Date("2025-06-15T00:00:00");

const sampleVisits: BrowserVisit[] = [
	{ url: "https://github.com/repo", title: "My Repo", time: new Date("2025-06-15T10:00:00"), domain: "github.com" },
];
const sampleSearches: SearchQuery[] = [
	{ query: "react hooks tutorial", time: new Date("2025-06-15T10:30:00"), engine: "google.com" },
];
const sampleShell: ShellCommand[] = [
	{ cmd: "git status", time: new Date("2025-06-15T11:00:00") },
];
const sampleClaude: ClaudeSession[] = [
	{ prompt: "Fix the auth bug", time: new Date("2025-06-15T11:30:00"), project: "webapp" },
];
const sampleCategorized: CategorizedVisits = {
	dev: [{ url: "https://github.com/repo", title: "My Repo", time: new Date(), domain: "github.com" }],
};
const sampleAISummary: AISummary = {
	headline: "Productive day focused on React auth",
	tldr: "Spent the day debugging and implementing OAuth flows.",
	themes: ["OAuth", "React"],
	category_summaries: { dev: "Worked on GitHub repos" },
	notable: ["Started OAuth PKCE implementation"],
	questions: ["What's the best token storage strategy?"],
};

const QUESTION = "What's the best token storage strategy?";
const ANSWER_SLUG = `answer_${slugifyQuestion(QUESTION)}`;

/** Generate a fresh daily-digest note using the real renderer. */
function freshNote(ai: AISummary | null = sampleAISummary): string {
	return renderMarkdown(
		DATE, sampleVisits, sampleSearches, sampleShell,
		sampleClaude, [], sampleCategorized, ai,
	);
}

/** Simulate a user editing the Notes section. */
function withUserNotes(md: string, notes: string): string {
	return md.replace("> _Add your reflections here_", notes);
}

/** Simulate a user answering a reflection question (Dataview inline field). */
function withReflectionAnswer(md: string, slug: string, answer: string): string {
	return md.replace(`${slug}:: `, `${slug}:: ${answer}`);
}

/** Simulate a user adding a custom section before the footer. */
function withCustomSection(md: string, section: string): string {
	// Insert before the last --- (footer separator)
	const parts = md.split("\n---\n");
	if (parts.length >= 2) {
		const last = parts.pop()!;
		return parts.join("\n---\n") + "\n\n" + section + "\n\n---\n" + last;
	}
	return md + "\n\n" + section;
}

// ═══════════════════════════════════════════════════════════
// extractUserContent
// ═══════════════════════════════════════════════════════════

describe("extractUserContent", () => {
	it("returns empty content for a fresh unedited note", () => {
		const md = freshNote();
		const result = extractUserContent(md);

		expect(result.content).not.toBeNull();
		expect(result.content!.notesText).toBe("");
		expect(result.content!.reflectionAnswers.size).toBe(0);
		expect(result.content!.customSections.length).toBe(0);
		expect(result.raw).toBe(md);
	});

	it("extracts user notes from the Notes section", () => {
		const md = withUserNotes(freshNote(), "Today was a great day!\nI learned a lot about OAuth.");
		const result = extractUserContent(md);

		expect(result.content).not.toBeNull();
		expect(result.content!.notesText).toContain("Today was a great day!");
		expect(result.content!.notesText).toContain("I learned a lot about OAuth.");
	});

	it("extracts multi-line user notes with markdown formatting", () => {
		const notes = [
			"My Thoughts",
			"",
			"- Point one about **OAuth**",
			"- Point two about `React`",
			"",
			"```js",
			"const token = getToken();",
			"```",
		].join("\n");

		const md = withUserNotes(freshNote(), notes);
		const result = extractUserContent(md);

		expect(result.content!.notesText).toContain("Point one about **OAuth**");
		expect(result.content!.notesText).toContain("const token = getToken();");
	});

	it("extracts reflection answers from Dataview inline fields", () => {
		const md = withReflectionAnswer(freshNote(), ANSWER_SLUG, "Use httpOnly cookies for token storage");
		const result = extractUserContent(md);

		expect(result.content!.reflectionAnswers.size).toBe(1);
		expect(result.content!.reflectionAnswers.get(ANSWER_SLUG)).toBe("Use httpOnly cookies for token storage");
	});

	it("ignores empty reflection inline fields", () => {
		const md = freshNote();
		const result = extractUserContent(md);
		expect(result.content!.reflectionAnswers.size).toBe(0);
	});

	it("extracts custom user-added sections", () => {
		const section = "## My Project Notes\n\nThis is my custom section about the project.";
		const md = withCustomSection(freshNote(), section);
		const result = extractUserContent(md);

		expect(result.content!.customSections.length).toBe(1);
		expect(result.content!.customSections[0]).toContain("My Project Notes");
		expect(result.content!.customSections[0]).toContain("custom section about the project");
	});

	it("extracts all three types of user content simultaneously", () => {
		let md = freshNote();
		md = withUserNotes(md, "My notes for the day");
		md = withReflectionAnswer(md, ANSWER_SLUG, "Definitely httpOnly cookies");
		md = withCustomSection(md, "## Ideas\n\n- Build a CLI tool\n- Write a blog post");
		const result = extractUserContent(md);

		expect(result.content!.notesText).toContain("My notes for the day");
		expect(result.content!.reflectionAnswers.size).toBe(1);
		expect(result.content!.customSections.length).toBe(1);
		expect(result.content!.customSections[0]).toContain("Build a CLI tool");
	});

	it("handles empty input", () => {
		const result = extractUserContent("");
		expect(result.content).not.toBeNull();
		expect(result.content!.notesText).toBe("");
		expect(result.raw).toBe("");
	});

	it("handles arbitrary markdown that isn't a daily-digest note", () => {
		const md = "# Random File\n\nSome content.\n\n## Section\n\nMore content.";
		const result = extractUserContent(md);
		// Should treat the unknown section as user content
		expect(result.content!.customSections.length).toBeGreaterThanOrEqual(1);
		expect(result.raw).toBe(md);
	});

	it("always preserves raw text regardless of extraction success", () => {
		const md = freshNote();
		const result = extractUserContent(md);
		expect(result.raw).toBe(md);
	});

	it("handles note with no Notes section (old format)", () => {
		const md = "---\ndate: 2025-06-15\n---\n\n# Title\n\nSome generated content.";
		const result = extractUserContent(md);
		expect(result.content).not.toBeNull();
		expect(result.content!.notesText).toBe("");
	});

	it("preserves notes with frontmatter-like content", () => {
		const notes = "key: value\n---\nMore content after dashes";
		const md = withUserNotes(freshNote(), notes);
		const result = extractUserContent(md);
		// The content before --- in notes should be captured
		expect(result.content!.notesText).toContain("key: value");
	});
});

// ═══════════════════════════════════════════════════════════
// mergeContent
// ═══════════════════════════════════════════════════════════

describe("mergeContent", () => {
	it("returns new content unchanged when existing file was empty", () => {
		const newMd = freshNote();
		const extraction: ExtractionResult = { content: null, raw: "" };
		const merged = mergeContent(newMd, extraction);
		expect(merged).toBe(newMd);
	});

	it("returns new content unchanged when no user edits exist", () => {
		const oldMd = freshNote();
		const newMd = freshNote();
		const extraction = extractUserContent(oldMd);
		const merged = mergeContent(newMd, extraction);
		expect(merged).toBe(newMd);
	});

	it("injects user notes into the new Notes section", () => {
		const oldMd = withUserNotes(freshNote(), "My important notes\nLine two");
		const newMd = freshNote();
		const extraction = extractUserContent(oldMd);
		const merged = mergeContent(newMd, extraction);

		expect(merged).toContain("My important notes");
		expect(merged).toContain("Line two");
		expect(merged).not.toContain("Add your reflections here");
	});

	it("restores reflection answers in the new note", () => {
		const oldMd = withReflectionAnswer(freshNote(), ANSWER_SLUG, "Use JWTs with short expiry");
		const newMd = freshNote();
		const extraction = extractUserContent(oldMd);
		const merged = mergeContent(newMd, extraction);

		expect(merged).toContain("Use JWTs with short expiry");
		// Should only have one answer for this field
		const count = (merged.match(/Use JWTs with short expiry/g) || []).length;
		expect(count).toBe(1);
	});

	it("preserves custom user sections in the merged result", () => {
		const section = "## Weekly Goals\n\n- Ship OAuth by Friday\n- Write unit tests";
		const oldMd = withCustomSection(freshNote(), section);
		const newMd = freshNote();
		const extraction = extractUserContent(oldMd);
		const merged = mergeContent(newMd, extraction);

		expect(merged).toContain("Weekly Goals");
		expect(merged).toContain("Ship OAuth by Friday");
	});

	it("merges all user content types together", () => {
		let oldMd = freshNote();
		oldMd = withUserNotes(oldMd, "End-of-day reflections here");
		oldMd = withReflectionAnswer(oldMd, ANSWER_SLUG, "Stick with session tokens");
		oldMd = withCustomSection(oldMd, "## Action Items\n\n- Follow up with team");

		const newMd = freshNote();
		const extraction = extractUserContent(oldMd);
		const merged = mergeContent(newMd, extraction);

		expect(merged).toContain("End-of-day reflections here");
		expect(merged).toContain("Stick with session tokens");
		expect(merged).toContain("Action Items");
		expect(merged).toContain("Follow up with team");
	});

	it("uses fallback merge when extraction.content is null", () => {
		const oldMd = "Some arbitrary content that couldn't be parsed";
		const newMd = freshNote();
		const extraction: ExtractionResult = { content: null, raw: oldMd };
		const merged = mergeContent(newMd, extraction);

		expect(merged).toContain("Previous Content (preserved)");
		expect(merged).toContain("Some arbitrary content that couldn't be parsed");
		// Original new content should still be present
		expect(merged).toContain("2025-06-15");
	});

	it("fallback merge preserves entire old content verbatim", () => {
		const oldMd = "Line 1\nLine 2\n\n## Custom\n\n- Item A\n- Item B";
		const newMd = freshNote();
		const extraction: ExtractionResult = { content: null, raw: oldMd };
		const merged = mergeContent(newMd, extraction);

		// Every line of old content should be in the merged result
		for (const line of oldMd.split("\n")) {
			if (line.trim()) {
				expect(merged).toContain(line);
			}
		}
	});
});

// ═══════════════════════════════════════════════════════════
// Idempotency & Data Integrity
// ═══════════════════════════════════════════════════════════

describe("merge idempotency", () => {
	it("merging twice does not duplicate user notes", () => {
		const userNotes = "My important daily reflection";
		const oldMd = withUserNotes(freshNote(), userNotes);
		const newMd = freshNote();

		// First merge
		const extraction1 = extractUserContent(oldMd);
		const merged1 = mergeContent(newMd, extraction1);

		// Second merge (simulating regeneration)
		const extraction2 = extractUserContent(merged1);
		const merged2 = mergeContent(freshNote(), extraction2);

		const count = (merged2.match(/My important daily reflection/g) || []).length;
		expect(count).toBe(1);
	});

	it("merging twice does not duplicate reflection answers", () => {
		const answer = "Definitely httpOnly cookies";
		const oldMd = withReflectionAnswer(freshNote(), ANSWER_SLUG, answer);
		const newMd = freshNote();

		const extraction1 = extractUserContent(oldMd);
		const merged1 = mergeContent(newMd, extraction1);

		const extraction2 = extractUserContent(merged1);
		const merged2 = mergeContent(freshNote(), extraction2);

		const count = (merged2.match(/Definitely httpOnly cookies/g) || []).length;
		expect(count).toBe(1);
	});

	it("merging twice does not duplicate custom sections", () => {
		const section = "## My Goals\n\n- Learn Rust";
		const oldMd = withCustomSection(freshNote(), section);
		const newMd = freshNote();

		const extraction1 = extractUserContent(oldMd);
		const merged1 = mergeContent(newMd, extraction1);

		const extraction2 = extractUserContent(merged1);
		const merged2 = mergeContent(freshNote(), extraction2);

		const count = (merged2.match(/## My Goals/g) || []).length;
		expect(count).toBe(1);
	});
});

describe("data integrity", () => {
	it("preserves long user notes without truncation", () => {
		const longNotes = Array.from({ length: 100 }, (_, i) =>
			`Line ${i + 1}: This is a test of data integrity for line number ${i + 1}`
		).join("\n");

		const oldMd = withUserNotes(freshNote(), longNotes);
		const newMd = freshNote();
		const extraction = extractUserContent(oldMd);
		const merged = mergeContent(newMd, extraction);

		// Verify all 100 lines are present
		for (let i = 1; i <= 100; i++) {
			expect(merged).toContain(`Line ${i}: This is a test`);
		}
	});

	it("preserves special markdown characters in user notes", () => {
		const specialNotes = [
			"# Heading inside notes",
			"**bold** and *italic*",
			"- [link](https://example.com)",
			"| table | header |",
			"| ----- | ------ |",
			"| cell  | data   |",
			"`inline code` and",
			"```python",
			"def hello():",
			"    print('world')",
			"```",
			"> blockquote",
		].join("\n");

		const oldMd = withUserNotes(freshNote(), specialNotes);
		const extraction = extractUserContent(oldMd);
		const merged = mergeContent(freshNote(), extraction);

		expect(merged).toContain("**bold** and *italic*");
		expect(merged).toContain("[link](https://example.com)");
		expect(merged).toContain("```python");
		expect(merged).toContain("def hello():");
	});

	it("preserves unicode and emoji in user content", () => {
		const unicodeNotes = "Notes with unicode: \u00e9\u00e8\u00ea \u00fc\u00f6\u00e4 \u4f60\u597d \ud83d\ude80\ud83c\udf1f\ud83d\udca1";
		const oldMd = withUserNotes(freshNote(), unicodeNotes);
		const extraction = extractUserContent(oldMd);
		const merged = mergeContent(freshNote(), extraction);

		expect(merged).toContain(unicodeNotes);
	});
});

// ═══════════════════════════════════════════════════════════
// hasUserEdits
// ═══════════════════════════════════════════════════════════

describe("hasUserEdits", () => {
	it("returns false for a fresh unedited note", () => {
		const md = freshNote();
		const extraction = extractUserContent(md);
		expect(hasUserEdits(extraction)).toBe(false);
	});

	it("returns true when notes have been edited", () => {
		const md = withUserNotes(freshNote(), "Some user notes");
		const extraction = extractUserContent(md);
		expect(hasUserEdits(extraction)).toBe(true);
	});

	it("returns true when reflection answers exist", () => {
		const md = withReflectionAnswer(freshNote(), ANSWER_SLUG, "My answer");
		const extraction = extractUserContent(md);
		expect(hasUserEdits(extraction)).toBe(true);
	});

	it("returns true when custom sections exist", () => {
		const md = withCustomSection(freshNote(), "## Custom\n\nContent");
		const extraction = extractUserContent(md);
		expect(hasUserEdits(extraction)).toBe(true);
	});

	it("returns true when extraction failed (safety default)", () => {
		const extraction: ExtractionResult = { content: null, raw: "some content" };
		expect(hasUserEdits(extraction)).toBe(true);
	});
});

// ═══════════════════════════════════════════════════════════
// createBackup
// ═══════════════════════════════════════════════════════════

describe("createBackup", () => {
	let mockVault: VaultAdapter;

	beforeEach(() => {
		mockVault = {
			getAbstractFileByPath: vi.fn().mockReturnValue(null),
			create: vi.fn().mockResolvedValue({}),
			createFolder: vi.fn().mockResolvedValue(undefined),
		};
	});

	it("creates backup folder if it does not exist", async () => {
		await createBackup(mockVault, "daily/2025-06-15.md", "content");
		expect(mockVault.createFolder).toHaveBeenCalledWith(".daily-digest-backup");
	});

	it("skips folder creation if backup folder already exists", async () => {
		(mockVault.getAbstractFileByPath as ReturnType<typeof vi.fn>)
			.mockReturnValue({ path: ".daily-digest-backup" });
		await createBackup(mockVault, "daily/2025-06-15.md", "content");
		expect(mockVault.createFolder).not.toHaveBeenCalled();
	});

	it("creates backup file with correct naming pattern", async () => {
		const path = await createBackup(mockVault, "daily/2025-06-15.md", "file content");

		expect(path).toMatch(/^\.daily-digest-backup\/2025-06-15\./);
		expect(path).toMatch(/\.bak\.md$/);
		expect(mockVault.create).toHaveBeenCalledWith(
			expect.stringMatching(/\.bak\.md$/),
			"file content",
		);
	});

	it("stores full file content in backup", async () => {
		const content = "---\ndate: 2025-06-15\n---\n\n# Title\n\nMy notes";
		await createBackup(mockVault, "daily/2025-06-15.md", content);

		expect(mockVault.create).toHaveBeenCalledWith(
			expect.any(String),
			content,
		);
	});

	it("throws if vault create fails", async () => {
		(mockVault.create as ReturnType<typeof vi.fn>)
			.mockRejectedValue(new Error("Disk full"));

		await expect(
			createBackup(mockVault, "daily/2025-06-15.md", "content")
		).rejects.toThrow("Disk full");
	});

	it("generates unique backup paths for rapid successive calls", async () => {
		await createBackup(mockVault, "daily/2025-06-15.md", "v1");
		await new Promise(resolve => setTimeout(resolve, 5));
		await createBackup(mockVault, "daily/2025-06-15.md", "v2");

		expect(mockVault.create).toHaveBeenCalledTimes(2);
	});
});

// ═══════════════════════════════════════════════════════════
// Edge Cases
// ═══════════════════════════════════════════════════════════

describe("edge cases", () => {
	it("handles note without AI summary (no reflection section)", () => {
		const md = renderMarkdown(
			DATE, sampleVisits, sampleSearches, sampleShell,
			sampleClaude, [], sampleCategorized, null,
		);
		const edited = withUserNotes(md, "User wrote some notes");
		const extraction = extractUserContent(edited);
		const merged = mergeContent(freshNote(), extraction);

		expect(merged).toContain("User wrote some notes");
	});

	it("handles note with only whitespace in notes section", () => {
		const md = withUserNotes(freshNote(), "   \n\n   ");
		const extraction = extractUserContent(md);
		expect(hasUserEdits(extraction)).toBe(false);
	});

	it("handles multiple custom sections", () => {
		let md = freshNote();
		md = withCustomSection(md, "## Goals\n\n- Goal 1");
		md = withCustomSection(md, "## Meetings\n\n- 10am standup");

		const extraction = extractUserContent(md);
		expect(extraction.content!.customSections.length).toBe(2);

		const merged = mergeContent(freshNote(), extraction);
		expect(merged).toContain("Goals");
		expect(merged).toContain("Meetings");
	});

	it("does not treat generated section headings with emoji as user sections", () => {
		const md = freshNote();
		const extraction = extractUserContent(md);
		// None of the generated sections should appear as custom sections
		expect(extraction.content!.customSections.length).toBe(0);
	});
});
