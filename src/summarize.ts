import { requestUrl } from "obsidian";
import { CATEGORY_LABELS, scrubSecrets } from "./categorize";
import { AISummary, CategorizedVisits, SearchQuery, ShellCommand, ClaudeSession } from "./types";

export async function callClaude(
	prompt: string,
	apiKey: string,
	model: string,
	maxTokens = 800
): Promise<string> {
	try {
		const response = await requestUrl({
			url: "https://api.anthropic.com/v1/messages",
			method: "POST",
			contentType: "application/json",
			headers: {
				"x-api-key": apiKey,
				"anthropic-version": "2023-06-01",
			},
			body: JSON.stringify({
				model,
				max_tokens: maxTokens,
				messages: [{ role: "user", content: prompt }],
			}),
		});

		if (response.status === 200) {
			const data = response.json;
			return data.content[0].text.trim();
		}
		return `[AI summary unavailable: HTTP ${response.status}]`;
	} catch (e) {
		return `[AI summary unavailable: ${e}]`;
	}
}

export async function summarizeDay(
	date: Date,
	categorized: CategorizedVisits,
	searches: SearchQuery[],
	shellCmds: ShellCommand[],
	claudeSessions: ClaudeSession[],
	apiKey: string,
	model: string,
	profile: string
): Promise<AISummary> {
	const catLines: string[] = [];
	for (const [cat, visits] of Object.entries(categorized)) {
		const label = CATEGORY_LABELS[cat]?.[1] ?? cat;
		const domains = [...new Set(visits.map((v) => v.domain || ""))].slice(0, 8);
		const titles = visits
			.slice(0, 5)
			.map((v) => v.title?.slice(0, 60))
			.filter((t) => t);
		catLines.push(
			`  [${label}] domains: ${domains.join(", ")}` +
				(titles.length ? ` | sample titles: ${titles.join("; ")}` : "")
		);
	}

	const searchList = searches.slice(0, 20).map((s) => s.query);
	const claudeList = claudeSessions.slice(0, 10).map((e) => e.prompt.slice(0, 120));
	const shellList = shellCmds.slice(0, 15).map((e) => scrubSecrets(e.cmd).slice(0, 80));
	const contextHint = profile ? `\nUser profile context: ${profile}` : "";

	const dateStr = date.toLocaleDateString("en-US", {
		weekday: "long",
		year: "numeric",
		month: "long",
		day: "numeric",
	});

	const prompt = `You are summarizing a person's digital activity for ${dateStr}.
Your job is to distill raw activity logs into useful, human-readable intelligence for a personal knowledge base.${contextHint}

## Browser activity by category:
${catLines.length ? catLines.join("\n") : "  (none)"}

## Search queries:
${searchList.length ? searchList.map((q) => `  - ${q}`).join("\n") : "  (none)"}

## Claude / AI prompts:
${claudeList.length ? claudeList.map((p) => `  - ${p}`).join("\n") : "  (none)"}

## Shell commands (secrets redacted):
${shellList.length ? shellList.map((c) => `  - ${c}`).join("\n") : "  (none)"}

Return ONLY a JSON object with these exact keys — no markdown, no preamble:
{
  "headline": "one punchy sentence summarizing the whole day (max 15 words)",
  "tldr": "2-3 sentence paragraph. What was this person focused on? What did they accomplish or investigate?",
  "themes": ["3-5 short theme labels inferred from activity, e.g. 'API integration', 'market research', 'debugging'"],
  "category_summaries": {
    "<category_name>": "1-sentence plain-English summary of what they did in this category"
  },
  "notable": ["2-4 specific notable things: interesting searches, unusual patterns, apparent decisions or pivots"],
  "questions": ["1-2 open questions this day's activity raises, useful for future reflection"]
}

Be specific and concrete. Prefer "researched OAuth 2.0 flows for a GitHub integration" over "did some dev work".
Only include category_summaries for categories that actually had activity.
Do not include categories with zero visits.`;

	const raw = await callClaude(prompt, apiKey, model, 1000);

	// Strip markdown fences if the model wrapped it
	const cleaned = raw
		.replace(/^```json?\s*/m, "")
		.replace(/\s*```$/m, "")
		.trim();

	try {
		return JSON.parse(cleaned) as AISummary;
	} catch {
		return {
			headline: "Activity summary unavailable",
			tldr: cleaned.slice(0, 400),
			themes: [],
			category_summaries: {},
			notable: [],
			questions: [],
		};
	}
}
