import { describe, it, expect } from "vitest";
import {
	escapeForMarkdown,
	escapeForLinkText,
	escapeForTableCell,
	escapeForYaml,
	stripAnsi,
} from "../../../src/render/escape";

describe("stripAnsi", () => {
	it("strips bold sequences", () => {
		expect(stripAnsi("\x1B[1mbold\x1B[22m")).toBe("bold");
	});

	it("strips color sequences", () => {
		expect(stripAnsi("\x1B[31mred\x1B[0m")).toBe("red");
	});

	it("strips 256-color sequences", () => {
		expect(stripAnsi("\x1B[38;5;208morange\x1B[0m")).toBe("orange");
	});

	it("returns plain text unchanged", () => {
		expect(stripAnsi("no ansi here")).toBe("no ansi here");
	});

	it("strips mixed ANSI and returns readable text", () => {
		expect(stripAnsi("Set model to \x1B[1mDefault (Opus 4.6)\x1B[22m"))
			.toBe("Set model to Default (Opus 4.6)");
	});
});

describe("escapeForMarkdown", () => {
	it("escapes HTML angle brackets", () => {
		expect(escapeForMarkdown("<div>hello</div>")).toBe("&lt;div&gt;hello&lt;/div&gt;");
	});

	it("escapes XML-like protocol tags", () => {
		expect(escapeForMarkdown("<local-command-caveat>text</local-command-caveat>"))
			.toBe("&lt;local-command-caveat&gt;text&lt;/local-command-caveat&gt;");
	});

	it("escapes accidental Obsidian tags at word boundaries", () => {
		expect(escapeForMarkdown("fix #bug and #auth issue")).toBe("fix \\#bug and \\#auth issue");
	});

	it("does not escape mid-word # (e.g. C#)", () => {
		expect(escapeForMarkdown("C# code")).toBe("C# code");
	});

	it("does not escape # followed by numbers", () => {
		expect(escapeForMarkdown("issue #123")).toBe("issue #123");
	});

	it("escapes Dataview :: fields", () => {
		expect(escapeForMarkdown("std::vector<int>")).toBe("std:\u200B:vector&lt;int&gt;");
	});

	it("strips ANSI codes before escaping", () => {
		expect(escapeForMarkdown("\x1B[1mbold\x1B[22m <tag>"))
			.toBe("bold &lt;tag&gt;");
	});

	it("handles empty string", () => {
		expect(escapeForMarkdown("")).toBe("");
	});

	it("leaves plain text unchanged", () => {
		expect(escapeForMarkdown("Just a normal sentence")).toBe("Just a normal sentence");
	});
});

describe("escapeForLinkText", () => {
	it("escapes ] in link text", () => {
		expect(escapeForLinkText("Best Practices]")).toBe("Best Practices\\]");
	});

	it("escapes [ in link text", () => {
		expect(escapeForLinkText("[2024] Best Practices")).toBe("\\[2024\\] Best Practices");
	});

	it("also escapes HTML in link text", () => {
		expect(escapeForLinkText("<img> Tag - MDN")).toBe("&lt;img&gt; Tag - MDN");
	});
});

describe("escapeForTableCell", () => {
	it("escapes pipe characters", () => {
		expect(escapeForTableCell("foo | bar")).toBe("foo \\| bar");
	});

	it("also escapes HTML in table cells", () => {
		expect(escapeForTableCell("<b>bold</b>")).toBe("&lt;b&gt;bold&lt;/b&gt;");
	});
});

describe("escapeForYaml", () => {
	it("returns plain values unquoted", () => {
		expect(escapeForYaml("simple")).toBe("simple");
	});

	it("quotes values containing colons", () => {
		expect(escapeForYaml("work: debugging")).toBe('"work: debugging"');
	});

	it("quotes values containing #", () => {
		expect(escapeForYaml("C# basics")).toBe('"C# basics"');
	});

	it("quotes values containing brackets", () => {
		expect(escapeForYaml("[nested]")).toBe('"[nested]"');
	});

	it("escapes internal double quotes", () => {
		expect(escapeForYaml('say "hello"')).toBe('"say \\"hello\\""');
	});

	it("quotes values containing ---", () => {
		expect(escapeForYaml("a---b")).toBe('"a---b"');
	});

	it("quotes values containing newlines", () => {
		expect(escapeForYaml("line1\nline2")).toBe('"line1\nline2"');
	});
});
