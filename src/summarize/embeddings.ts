import { requestUrl } from "obsidian";
import { ActivityChunk, EmbeddedChunk } from "../types";
import * as log from "../plugin/log";

// ── Fetch helper (localhost-aware) ──────────────────────

async function embeddingFetch(
	url: string,
	body: string
): Promise<unknown> {
	const isLocalhost =
		url.includes("localhost") ||
		url.includes("127.0.0.1") ||
		url.includes("0.0.0.0");

	if (isLocalhost) {
		const resp = await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
			},
			body,
		});
		if (!resp.ok) {
			const text = await resp.text().catch(() => "");
			throw new Error(`HTTP ${resp.status}: ${text.slice(0, 200)}`);
		}
		return await resp.json();
	} else {
		const resp = await requestUrl({
			url,
			method: "POST",
			contentType: "application/json",
			body,
		});
		if (resp.status !== 200) {
			throw new Error(`HTTP ${resp.status}`);
		}
		return resp.json;
	}
}

// ── Embedding generation ────────────────────────────────

interface EmbeddingResponse {
	data?: { embedding: number[]; index: number }[];
	embeddings?: number[][];
}

/**
 * Generate embeddings for an array of texts via OpenAI-compatible endpoint.
 * Tries batch first, falls back to sequential if batch fails.
 */
export async function generateEmbeddings(
	texts: string[],
	endpoint: string,
	model: string
): Promise<number[][]> {
	const baseUrl = endpoint.replace(/\/+$/, "");
	const url = `${baseUrl}/v1/embeddings`;

	// Try batch request first
	try {
		const data = (await embeddingFetch(
			url,
			JSON.stringify({ model, input: texts })
		)) as EmbeddingResponse;

		if (data.data && data.data.length === texts.length) {
			// OpenAI format: { data: [{ embedding, index }] }
			const sorted = [...data.data].sort((a, b) => a.index - b.index);
			return sorted.map((d) => d.embedding);
		}
		if (data.embeddings && data.embeddings.length === texts.length) {
			// Ollama native format: { embeddings: [[...], [...]] }
			return data.embeddings;
		}
		throw new Error("Unexpected embedding response format");
	} catch (batchErr) {
		log.debug("Daily Digest: Batch embedding failed, trying sequential:", batchErr);

		// Fall back to sequential
		const results: number[][] = [];
		for (const text of texts) {
			const data = (await embeddingFetch(
				url,
				JSON.stringify({ model, input: text })
			)) as EmbeddingResponse;

			if (data.data && data.data.length > 0) {
				results.push(data.data[0].embedding);
			} else if (data.embeddings && data.embeddings.length > 0) {
				results.push(data.embeddings[0]);
			} else {
				throw new Error("No embedding returned for text");
			}
		}
		return results;
	}
}

// ── Embed all chunks ────────────────────────────────────

export async function embedChunks(
	chunks: ActivityChunk[],
	endpoint: string,
	model: string
): Promise<EmbeddedChunk[]> {
	const texts = chunks.map((c) => c.text);
	const embeddings = await generateEmbeddings(texts, endpoint, model);

	return chunks.map((chunk, i) => ({
		...chunk,
		embedding: embeddings[i],
	}));
}

// ── Vector math ─────────────────────────────────────────

export function cosineSimilarity(a: number[], b: number[]): number {
	if (a.length !== b.length || a.length === 0) return 0;

	let dot = 0;
	let magA = 0;
	let magB = 0;
	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i];
		magA += a[i] * a[i];
		magB += b[i] * b[i];
	}

	const denom = Math.sqrt(magA) * Math.sqrt(magB);
	return denom === 0 ? 0 : dot / denom;
}

// ── Retrieval ───────────────────────────────────────────

export function retrieveTopK(
	queryEmbedding: number[],
	chunks: EmbeddedChunk[],
	topK: number
): { chunk: EmbeddedChunk; score: number }[] {
	const scored = chunks.map((chunk) => ({
		chunk,
		score: cosineSimilarity(queryEmbedding, chunk.embedding),
	}));
	scored.sort((a, b) => b.score - a.score);
	return scored.slice(0, topK);
}

// ── Auto-generate search queries from activity data ─────

export function autoGenerateQueries(chunks: ActivityChunk[]): string[] {
	const queries: string[] = [];

	for (const chunk of chunks) {
		if (chunk.type === "search") {
			// Search chunks contain the user's actual interests
			// Extract a few representative queries
			const lines = chunk.text.split("\n");
			const queryLine = lines.find((l) => l.startsWith("Queries:"));
			if (queryLine) {
				const allQueries = queryLine
					.replace("Queries: ", "")
					.split(" | ")
					.slice(0, 3);
				queries.push(allQueries.join(", "));
			}
		}

		if (chunk.type === "browser" && chunk.category) {
			// Summarize the category focus
			const domains = chunk.metadata.domains?.slice(0, 3).join(", ") || "";
			if (domains) {
				const label =
					chunk.category.charAt(0).toUpperCase() + chunk.category.slice(1);
				queries.push(`${label} activity: ${domains}`);
			}
		}

		if (chunk.type === "claude") {
			const projects = chunk.metadata.projects?.join(", ") || "";
			if (projects) {
				queries.push(`AI coding work on ${projects}`);
			}
		}
	}

	// Deduplicate and cap at 5 queries
	const unique = [...new Set(queries)].slice(0, 5);

	// If we have no queries at all, use a generic one
	if (unique.length === 0) {
		unique.push("Main activities and focus areas for the day");
	}

	return unique;
}

// ── Full retrieval pipeline ─────────────────────────────

export async function retrieveRelevantChunks(
	chunks: ActivityChunk[],
	endpoint: string,
	model: string,
	topK: number
): Promise<EmbeddedChunk[]> {
	log.debug(`Daily Digest RAG: Embedding ${chunks.length} chunks...`);

	// 1. Embed all activity chunks
	const embeddedChunks = await embedChunks(chunks, endpoint, model);
	log.debug(`Daily Digest RAG: Embedded ${embeddedChunks.length} chunks`);

	// 2. Generate search queries from the data
	const queries = autoGenerateQueries(chunks);
	log.debug(`Daily Digest RAG: Generated ${queries.length} queries`);

	// 3. Embed the queries
	const queryEmbeddings = await generateEmbeddings(queries, endpoint, model);

	// 4. Retrieve top-K for each query
	const seen = new Set<string>();
	const allRetrieved: { chunk: EmbeddedChunk; score: number }[] = [];

	for (let i = 0; i < queryEmbeddings.length; i++) {
		const results = retrieveTopK(queryEmbeddings[i], embeddedChunks, topK);
		for (const r of results) {
			if (!seen.has(r.chunk.id)) {
				seen.add(r.chunk.id);
				allRetrieved.push(r);
			}
		}
	}

	// 5. Sort by best score and take top-K unique
	allRetrieved.sort((a, b) => b.score - a.score);
	const final = allRetrieved.slice(0, topK).map((r) => r.chunk);

	log.debug(
		`Daily Digest RAG: Retrieved ${final.length} chunks (from ${embeddedChunks.length} total)`
	);

	return final;
}

// Phase 3 stubs (persistDayIndex, queryAcrossDays) removed — see roadmap in README.
