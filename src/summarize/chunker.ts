// ── Token estimation ────────────────────────────────────

/** Rough token count: ~4 chars per token on average. */
export function estimateTokens(text: string): number {
	return Math.ceil(text.length / 4);
}
