/**
 * AI evaluation helpers — LLM-as-judge scoring infrastructure.
 *
 * Uses a "judge" LLM to evaluate non-deterministic AI outputs.
 * Supports both Anthropic and local (OpenAI-compatible) providers.
 *
 * Set environment variables to configure:
 *   DAILY_DIGEST_AI_EVAL=true           — enable AI eval tests
 *   DAILY_DIGEST_AI_EVAL_PROVIDER=anthropic|local
 *   DAILY_DIGEST_AI_EVAL_MODEL=claude-sonnet-4-20250514
 *   ANTHROPIC_API_KEY=sk-ant-...         — for Anthropic provider
 *   LOCAL_EVAL_ENDPOINT=http://localhost:11434  — for local provider
 *   LOCAL_EVAL_MODEL=qwen3:8b            — for local provider
 */

import { AI_EVAL_ENABLED, AI_EVAL_PROVIDER, AI_EVAL_MODEL } from "../setup";

export interface EvalScore {
	score: number;       // 0.0 - 1.0
	reasoning: string;   // judge's explanation
	passed: boolean;     // score >= threshold
}

export interface RubricCriterion {
	name: string;
	description: string;
	weight: number;     // 0.0 - 1.0, weights should sum to ~1.0
}

/**
 * Skip AI eval tests unless the environment is configured.
 */
export function skipIfNoAI(): boolean {
	return !AI_EVAL_ENABLED;
}

/**
 * Call the judge LLM with a scoring prompt.
 * Returns the raw text response.
 */
async function callJudge(prompt: string): Promise<string> {
	if (AI_EVAL_PROVIDER === "anthropic") {
		const apiKey = process.env.ANTHROPIC_API_KEY;
		if (!apiKey) throw new Error("ANTHROPIC_API_KEY required for AI eval");

		const resp = await fetch("https://api.anthropic.com/v1/messages", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-api-key": apiKey,
				"anthropic-version": "2023-06-01",
			},
			body: JSON.stringify({
				model: AI_EVAL_MODEL,
				max_tokens: 800,
				messages: [{ role: "user", content: prompt }],
			}),
		});

		if (!resp.ok) {
			throw new Error(`Anthropic API error: ${resp.status} ${await resp.text()}`);
		}

		const data = await resp.json() as { content: { text: string }[] };
		return data.content[0].text.trim();
	}

	// Local provider (OpenAI-compatible)
	const endpoint = process.env.LOCAL_EVAL_ENDPOINT || "http://localhost:11434";
	const model = process.env.LOCAL_EVAL_MODEL || AI_EVAL_MODEL;
	const url = `${endpoint.replace(/\/+$/, "")}/v1/chat/completions`;

	const resp = await fetch(url, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			model,
			max_tokens: 800,
			temperature: 0.1,
			messages: [
				{ role: "system", content: "You are an evaluation judge. Score outputs precisely and return valid JSON." },
				{ role: "user", content: prompt },
			],
		}),
	});

	if (!resp.ok) {
		throw new Error(`Local API error: ${resp.status} ${await resp.text()}`);
	}

	const data = await resp.json() as { choices: { message: { content: string } }[] };
	return data.choices[0].message.content.trim();
}

/**
 * Parse a judge response that should contain JSON with score and reasoning.
 */
function parseJudgeResponse(raw: string, threshold: number): EvalScore {
	const cleaned = raw
		.replace(/^```json?\s*/m, "")
		.replace(/\s*```$/m, "")
		.trim();

	try {
		const parsed = JSON.parse(cleaned);
		const score = typeof parsed.score === "number" ? parsed.score : 0;
		return {
			score: Math.max(0, Math.min(1, score)),
			reasoning: parsed.reasoning || parsed.explanation || "No reasoning provided",
			passed: score >= threshold,
		};
	} catch {
		// Try to extract score from text
		const scoreMatch = raw.match(/(?:score|rating)[:\s]*(\d+(?:\.\d+)?)/i);
		const score = scoreMatch ? parseFloat(scoreMatch[1]) : 0;
		return {
			score: score > 1 ? score / 10 : score, // normalize 0-10 to 0-1
			reasoning: `Failed to parse JSON. Raw: ${raw.slice(0, 200)}`,
			passed: score >= threshold,
		};
	}
}

/**
 * LLM-as-judge: evaluate an output against a rubric.
 * Returns a score between 0 and 1 with reasoning.
 */
export async function evaluateWithRubric(
	output: string,
	rubric: string,
	threshold = 0.7
): Promise<EvalScore> {
	const prompt = `Evaluate the following output against the rubric below.

## Output to evaluate:
${output}

## Rubric:
${rubric}

Return ONLY a JSON object:
{
  "score": <number between 0.0 and 1.0>,
  "reasoning": "<1-3 sentences explaining the score>"
}

Score 1.0 = perfectly meets all rubric criteria.
Score 0.0 = completely fails all criteria.
Be precise and critical.`;

	const raw = await callJudge(prompt);
	return parseJudgeResponse(raw, threshold);
}

/**
 * LLM-as-judge: evaluate multiple criteria with individual scores.
 * Returns weighted average plus per-criterion details.
 */
export async function evaluateMultiCriteria(
	output: string,
	criteria: RubricCriterion[],
	threshold = 0.7
): Promise<{ overall: EvalScore; criteria: Record<string, EvalScore> }> {
	const criteriaList = criteria
		.map((c, i) => `${i + 1}. **${c.name}** (weight: ${c.weight}): ${c.description}`)
		.join("\n");

	const prompt = `Evaluate the following output against each criterion below. Score each independently.

## Output to evaluate:
${output}

## Criteria:
${criteriaList}

Return ONLY a JSON object with a score (0.0-1.0) and reasoning for EACH criterion:
{
  ${criteria.map((c) => `"${c.name}": { "score": <0.0-1.0>, "reasoning": "<brief>" }`).join(",\n  ")}
}

Be precise and critical.`;

	const raw = await callJudge(prompt);
	const cleaned = raw
		.replace(/^```json?\s*/m, "")
		.replace(/\s*```$/m, "")
		.trim();

	const perCriterion: Record<string, EvalScore> = {};
	let weightedSum = 0;
	let totalWeight = 0;

	try {
		const parsed = JSON.parse(cleaned);
		for (const criterion of criteria) {
			const result = parsed[criterion.name];
			if (result && typeof result.score === "number") {
				const score = Math.max(0, Math.min(1, result.score));
				perCriterion[criterion.name] = {
					score,
					reasoning: result.reasoning || "No reasoning",
					passed: score >= threshold,
				};
				weightedSum += score * criterion.weight;
				totalWeight += criterion.weight;
			} else {
				perCriterion[criterion.name] = {
					score: 0,
					reasoning: "Missing from judge response",
					passed: false,
				};
			}
		}
	} catch {
		for (const criterion of criteria) {
			perCriterion[criterion.name] = {
				score: 0,
				reasoning: `Failed to parse judge response: ${cleaned.slice(0, 100)}`,
				passed: false,
			};
		}
	}

	const overallScore = totalWeight > 0 ? weightedSum / totalWeight : 0;
	return {
		overall: {
			score: overallScore,
			reasoning: Object.entries(perCriterion)
				.map(([name, s]) => `${name}: ${s.score.toFixed(2)}`)
				.join(", "),
			passed: overallScore >= threshold,
		},
		criteria: perCriterion,
	};
}

/**
 * LLM-as-judge: check if output contains specific information.
 * Useful for factual verification without exact string matching.
 */
export async function evaluateContainment(
	output: string,
	expectedElements: string[],
	threshold = 0.7
): Promise<EvalScore> {
	const elementsList = expectedElements
		.map((e, i) => `${i + 1}. ${e}`)
		.join("\n");

	const prompt = `Check if the following output contains or addresses each of these expected elements.

## Output to evaluate:
${output}

## Expected elements (does the output address each?):
${elementsList}

Return ONLY a JSON object:
{
  "score": <fraction of elements found, 0.0-1.0>,
  "reasoning": "<which elements were found/missing>"
}`;

	const raw = await callJudge(prompt);
	return parseJudgeResponse(raw, threshold);
}

/**
 * LLM-as-judge: check if output is free from specific types of content.
 * Returns high score if prohibited content is absent.
 */
export async function evaluateAbsence(
	output: string,
	prohibitedTypes: string[],
	threshold = 0.9
): Promise<EvalScore> {
	const typesList = prohibitedTypes
		.map((t, i) => `${i + 1}. ${t}`)
		.join("\n");

	const prompt = `Check if the following output is FREE from prohibited content types.

## Output to evaluate:
${output}

## Prohibited content types (should NOT appear):
${typesList}

Return ONLY a JSON object:
{
  "score": <1.0 if completely clean, 0.0 if all types present>,
  "reasoning": "<which prohibited types were found, if any>"
}

Score 1.0 = output is completely free of all prohibited content.
Score 0.0 = output contains all prohibited types.`;

	const raw = await callJudge(prompt);
	return parseJudgeResponse(raw, threshold);
}
