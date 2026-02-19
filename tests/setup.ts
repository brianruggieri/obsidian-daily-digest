/**
 * Vitest global setup.
 *
 * - Registers custom matchers (promptfoo semantic similarity, LLM rubric)
 * - Configures AI eval environment when DAILY_DIGEST_AI_EVAL=true
 */

export const AI_EVAL_ENABLED = process.env.DAILY_DIGEST_AI_EVAL === "true";
export const AI_EVAL_PROVIDER = process.env.DAILY_DIGEST_AI_EVAL_PROVIDER || "anthropic";
export const AI_EVAL_MODEL = process.env.DAILY_DIGEST_AI_EVAL_MODEL || "claude-sonnet-4-20250514";

// Log eval configuration on startup
if (AI_EVAL_ENABLED) {
	console.log(
		`\n🧪 AI Evaluation enabled: provider=${AI_EVAL_PROVIDER}, model=${AI_EVAL_MODEL}\n`
	);
}
