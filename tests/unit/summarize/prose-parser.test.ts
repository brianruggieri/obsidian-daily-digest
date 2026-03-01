import { describe, it, expect } from "vitest";
import { parseProseSections } from "../../../src/summarize/prose-parser";

describe("parseProseSections", () => {
	it("parses a complete well-formed prose response", () => {
		const raw = `
## Headline
Deep-dive into OAuth patterns and auth middleware implementation

## Day Story
Started the morning researching OAuth 2.0 PKCE flows, then shifted to implementing the auth middleware. By afternoon, the callback handler was working and tests were passing.

## Mindset
Execution mode — methodical implementation with targeted research breaks to resolve specific unknowns.

## TLDR
Built the complete OAuth callback handler with PKCE support. Learned that the state parameter is essential for CSRF protection. Sets up the token refresh flow for tomorrow.

## Learnings
- PKCE flow requires a code_verifier stored in session before the redirect
- The state parameter prevents CSRF — not optional for production
- Ollama's JSON mode uses GBNF grammar constraints under the hood

## Remember
- \`oauth2-proxy\` config: set \`--cookie-secret\` to a 32-byte base64 value
- The redirect_uri must exactly match what's registered in the OAuth app
- \`vitest --reporter=verbose\` shows individual test names

## Connections
Researched PKCE flows in the morning, then the auth middleware commit directly implemented those patterns — the search-to-code pipeline was tight today.

## Questions
- Why does the auth system use session storage for the code_verifier instead of a signed cookie?

## Note Seeds
- OAuth 2.0 PKCE Flow
- CSRF Protection Patterns
- Vitest Configuration
`;

		const summary = parseProseSections(raw);

		expect(summary.headline).toBe(
			"Deep-dive into OAuth patterns and auth middleware implementation"
		);
		expect(summary.work_story).toContain("OAuth 2.0 PKCE flows");
		expect(summary.mindset).toContain("Execution mode");
		expect(summary.tldr).toContain("OAuth callback handler");
		expect(summary.learnings).toHaveLength(3);
		expect(summary.learnings![0]).toContain("PKCE flow");
		expect(summary.remember).toHaveLength(3);
		expect(summary.remember![0]).toContain("oauth2-proxy");
		expect(summary.cross_source_connections).toHaveLength(1);
		expect(summary.cross_source_connections![0]).toContain("PKCE flows");
		expect(summary.questions).toHaveLength(1);
		expect(summary.questions[0]).toContain("code_verifier");
		expect(summary.note_seeds).toHaveLength(3);
		expect(summary.note_seeds![0]).toBe("OAuth 2.0 PKCE Flow");
	});

	it("derives structured prompts from questions", () => {
		const raw = `
## Headline
A productive day

## Questions
- Why do the tests keep flaking on CI?
- Is the caching layer actually needed?
`;

		const summary = parseProseSections(raw);
		expect(summary.prompts).toHaveLength(2);
		expect(summary.prompts![0].id).toBe("why_do_the_tests_keep_flaking_on_ci");
		expect(summary.prompts![0].question).toContain("flaking");
		expect(summary.prompts![1].id).toBe("is_the_caching_layer_actually_needed");
	});

	it("handles missing sections gracefully", () => {
		const raw = `
## Headline
Quiet day

## Day Story
Not much happened.
`;

		const summary = parseProseSections(raw);
		expect(summary.headline).toBe("Quiet day");
		expect(summary.work_story).toBe("Not much happened.");
		// Missing sections default to empty
		expect(summary.learnings).toBeUndefined();
		expect(summary.remember).toBeUndefined();
		expect(summary.questions).toEqual([]);
		expect(summary.themes).toEqual([]);
	});

	it("handles extra unrecognized sections without breaking", () => {
		const raw = `
## Headline
Mixed signals day

## Bonus Section
This section is not in the schema and should be ignored.

## Learnings
- Learned something new
`;

		const summary = parseProseSections(raw);
		expect(summary.headline).toBe("Mixed signals day");
		expect(summary.learnings).toEqual(["Learned something new"]);
	});

	it("handles preamble text before first heading", () => {
		const raw = `Here is the daily note:

## Headline
Preamble ignored

## TLDR
The preamble text before the first heading should be discarded.
`;

		const summary = parseProseSections(raw);
		expect(summary.headline).toBe("Preamble ignored");
		expect(summary.tldr).toContain("preamble text");
	});

	it("falls back to default headline when none is provided", () => {
		const raw = `
## Day Story
Just a story, no headline.
`;

		const summary = parseProseSections(raw);
		expect(summary.headline).toBe("Activity summary");
	});

	it("parses continuation lines in bullet lists", () => {
		const raw = `
## Headline
Test

## Learnings
- First learning that spans
  across two lines
- Second learning
`;

		const summary = parseProseSections(raw);
		expect(summary.learnings).toHaveLength(2);
		expect(summary.learnings![0]).toBe(
			"First learning that spans across two lines"
		);
	});

	it("handles bullet variants (* and •)", () => {
		const raw = `
## Headline
Test

## Remember
* Star bullet item
• Unicode bullet item
- Dash bullet item
`;

		const summary = parseProseSections(raw);
		expect(summary.remember).toHaveLength(3);
		expect(summary.remember![0]).toBe("Star bullet item");
		expect(summary.remember![1]).toBe("Unicode bullet item");
		expect(summary.remember![2]).toBe("Dash bullet item");
	});

	it("handles completely empty input", () => {
		const summary = parseProseSections("");
		expect(summary.headline).toBe("Activity summary");
		expect(summary.themes).toEqual([]);
		expect(summary.questions).toEqual([]);
	});

	it("parses tagged reflections from ## Reflections heading", () => {
		const raw = `
## Headline
Auth deep-dive day

## Reflections
- **token-storage**: You spent 3 hours researching token storage but never committed a solution. What's blocking the decision?
- **pkce-flow**: The PKCE implementation went smoothly. What made that flow easier than expected?
`;

		const summary = parseProseSections(raw);
		expect(summary.prompts).toHaveLength(2);
		expect(summary.prompts![0].id).toBe("token-storage");
		expect(summary.prompts![0].question).toContain("blocking the decision");
		expect(summary.prompts![1].id).toBe("pkce-flow");
		expect(summary.prompts![1].question).toContain("easier than expected");
	});

	it("prefers tagged reflections over legacy questions", () => {
		const raw = `
## Headline
Test day

## Questions
- Why did the tests flake?

## Reflections
- **test-flake**: Your CI flaked 3 times on the same test. Is the test actually non-deterministic or is there an env issue?
`;

		const summary = parseProseSections(raw);
		// Reflections should take priority over Questions
		expect(summary.prompts).toHaveLength(1);
		expect(summary.prompts![0].id).toBe("test-flake");
		expect(summary.prompts![0].question).toContain("non-deterministic");
	});

	it("deduplicates theme IDs in reflections", () => {
		const raw = `
## Headline
Test

## Reflections
- **auth**: First question about auth?
- **auth**: Second question about auth?
`;

		const summary = parseProseSections(raw);
		expect(summary.prompts).toHaveLength(2);
		expect(summary.prompts![0].id).toBe("auth");
		expect(summary.prompts![1].id).toBe("auth_2");
	});

	it("parses Voice & Vernacular into quirky_signals", () => {
		const raw = `
## Headline
Chatty research day

## Voice & Vernacular
- You searched "how do I" 6 times today — you're in learning mode
- Your Claude prompts got noticeably shorter after 4pm
- Misspelling streak: "recieve", "seperate" — afternoon typing is creative
`;

		const summary = parseProseSections(raw);
		expect(summary.quirky_signals).toHaveLength(3);
		expect(summary.quirky_signals![0]).toContain("how do I");
		expect(summary.quirky_signals![2]).toContain("recieve");
	});

	it("parses Cognitive Patterns into meta_insights", () => {
		const raw = `
## Headline
Deep focus day

## Cognitive Patterns
- Research spiral: approached OAuth from 3 different angles before committing
- Sustained 3-hour implementation block with zero context switches
`;

		const summary = parseProseSections(raw);
		expect(summary.meta_insights).toHaveLength(2);
		expect(summary.meta_insights![0]).toContain("Research spiral");
		expect(summary.meta_insights![1]).toContain("implementation block");
	});

	it("parses Focus Narrative as a string", () => {
		const raw = `
## Headline
Scattered day

## Focus Narrative
This was a fragmented day with constant context-switching between three unrelated projects.
`;

		const summary = parseProseSections(raw);
		expect(summary.focus_narrative).toContain("fragmented day");
	});
});
