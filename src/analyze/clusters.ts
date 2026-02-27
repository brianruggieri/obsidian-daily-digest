/**
 * TF-IDF Article Clustering — Stage D of the article-first browsing pipeline.
 *
 * Groups substantive browser visits (engagement score >= 0.5) into thematic
 * clusters using TF-IDF vectorisation and cosine similarity. Each cluster
 * represents a focused reading/research session.
 *
 * The result is an `ArticleCluster[]` added to `KnowledgeSections` and
 * rendered as the "Today I Read About" section in the daily note.
 *
 * Algorithm:
 * 1. Filter visits to those with engagement score >= 0.5
 * 2. Build a TF-IDF matrix over cleaned titles
 * 3. Greedily assign each visit to an existing cluster if:
 *    - The time gap from the last cluster visit < sessionGapMs (45 min default)
 *    - Cosine similarity to the cluster centroid >= similarityThreshold (0.3)
 * 4. Otherwise start a new cluster
 * 5. Label each cluster with top-3 most frequent meaningful words
 * 6. Infer intent from domain diversity and revisit patterns
 * 7. Drop singleton clusters (< 2 articles) — they appear in domain view instead
 *
 * No LLM calls. No network. No external libraries.
 */

import { ArticleCluster, BrowserVisit } from "../types";
import { ENTITY_STOPWORDS } from "../filter/classify";
import { cleanTitle } from "../collect/browser";

// ── TF-IDF Tokenizer ─────────────────────────────────────

/**
 * A lowercase-normalised copy of ENTITY_STOPWORDS for case-insensitive matching.
 * ENTITY_STOPWORDS stores capitalized forms ("The", "HTML", "API"); the tokenizer
 * works on lowercased tokens, so we need a lowercased set for the check.
 */
const STOPWORDS_LOWER = new Set(
	[...ENTITY_STOPWORDS].map((w) => w.toLowerCase()),
);

/**
 * Tokenise a cleaned article title for TF-IDF.
 * - Lowercase
 * - Remove punctuation
 * - Split on whitespace
 * - Keep tokens longer than 2 chars
 * - Remove tokens in ENTITY_STOPWORDS (case-insensitive)
 */
function tokenize(text: string): string[] {
	return text
		.toLowerCase()
		.replace(/[^\w\s]/g, " ")
		.split(/\s+/)
		.filter((w) => w.length > 2 && !STOPWORDS_LOWER.has(w));
}

// ── TF-IDF Matrix ────────────────────────────────────────

/**
 * Build a TF-IDF matrix for a list of titles.
 *
 * Returns a Map keyed by document index (as string) where each value is a Map
 * from term to TF-IDF score.
 *
 * TF  = term frequency within document (count / doc token count)
 * IDF = log(N / document frequency)
 */
export function buildTfIdf(titles: string[]): Map<string, Map<string, number>> {
	const termFreqs = titles.map((t) => {
		const tokens = tokenize(t);
		const freq = new Map<string, number>();
		for (const tok of tokens) {
			freq.set(tok, (freq.get(tok) ?? 0) + 1);
		}
		return freq;
	});

	const docFreq = new Map<string, number>();
	for (const tf of termFreqs) {
		for (const term of tf.keys()) {
			docFreq.set(term, (docFreq.get(term) ?? 0) + 1);
		}
	}

	const N = titles.length;
	const tfidfMatrix = new Map<string, Map<string, number>>();
	titles.forEach((_, i) => {
		const row = new Map<string, number>();
		const tf = termFreqs[i];
		const docSize = tf.size || 1;
		for (const [term, count] of tf) {
			// Use 1 + log(N/df) (smooth IDF) to avoid IDF = 0 for terms appearing in all docs.
			// Without smoothing, shared terms across a 2-doc corpus get IDF = log(1) = 0,
			// making cosine similarity always 0 on small corpora.
			const df = docFreq.get(term) ?? 1;
			const idf = 1 + Math.log(N / df);
			row.set(term, (count / docSize) * idf);
		}
		tfidfMatrix.set(String(i), row);
	});

	return tfidfMatrix;
}

// ── Cosine Similarity ────────────────────────────────────

/**
 * Compute cosine similarity between two sparse TF-IDF vectors.
 * Returns 0 if either vector is zero-length.
 */
export function cosineSimilarity(
	a: Map<string, number>,
	b: Map<string, number>,
): number {
	let dot = 0;
	let normA = 0;
	let normB = 0;
	for (const [k, va] of a) {
		const vb = b.get(k) ?? 0;
		dot += va * vb;
		normA += va * va;
	}
	for (const vb of b.values()) {
		normB += vb * vb;
	}
	const denom = Math.sqrt(normA) * Math.sqrt(normB);
	return denom > 0 ? dot / denom : 0;
}

// ── Cluster Centroid ─────────────────────────────────────

/**
 * Compute the centroid (element-wise average) of a list of TF-IDF vectors.
 * Used to compare new visits to an existing cluster's centre of mass.
 */
function buildCentroid(vectors: Map<string, number>[]): Map<string, number> {
	const centroid = new Map<string, number>();
	const n = vectors.length;
	if (n === 0) return centroid;
	for (const vec of vectors) {
		for (const [term, score] of vec) {
			centroid.set(term, (centroid.get(term) ?? 0) + score / n);
		}
	}
	return centroid;
}

// ── Cluster Labelling ────────────────────────────────────

/**
 * Produce a short human-readable label for a cluster from its articles.
 *
 * Takes the top-3 most frequent meaningful words across all article titles
 * (> 3 chars, not in stopwords) and joins them with a space.
 */
export function labelCluster(articles: string[]): string {
	const freq = new Map<string, number>();
	for (const a of articles) {
		const words = a
			.toLowerCase()
			.split(/\s+/)
			.filter((w) => w.length > 3 && !STOPWORDS_LOWER.has(w));
		for (const w of words) {
			freq.set(w, (freq.get(w) ?? 0) + 1);
		}
	}
	const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]);
	return sorted
		.slice(0, 3)
		.map(([w]) => w)
		.join(" ");
}

// ── Intent Inference ─────────────────────────────────────

/**
 * Infer the intent signal for a cluster based on its visits.
 *
 * - "research"       — 3+ distinct domains (consulted multiple sources)
 * - "reference"      — any URL appears more than once (kept referring back)
 * - "implementation" — only 1–2 domains but revisit detected (building something)
 * - "browsing"       — default: single-domain, single-pass reading
 */
export function inferIntent(cluster: ArticleCluster): ArticleCluster["intentSignal"] {
	const domains = new Set(
		cluster.visits.map((v) => {
			try {
				return new URL(v.url).hostname.replace(/^www\./, "");
			} catch {
				return "";
			}
		}),
	);
	if (domains.size >= 3) return "research";

	// Revisit: same URL appears more than once
	const urlCounts = new Map<string, number>();
	for (const v of cluster.visits) {
		urlCounts.set(v.url, (urlCounts.get(v.url) ?? 0) + 1);
	}
	const hasRevisit = [...urlCounts.values()].some((c) => c > 1);
	if (hasRevisit) return "reference";

	return "browsing";
}

// ── Main Clustering Function ─────────────────────────────

/**
 * Group substantive browser visits into thematic article clusters.
 *
 * Only visits with `engagementScores[i] >= 0.5` are included. Singletons
 * (clusters with fewer than 2 articles) are dropped — they appear in the
 * domain-grouped browser activity view instead.
 *
 * @param visits             - All browser visits for the day
 * @param cleanedTitles      - `cleanTitle(v.title)` for each visit (parallel array)
 * @param engagementScores   - `computeEngagementScore()` for each visit (parallel array)
 * @param sessionGapMs       - Max milliseconds between visits to stay in same cluster (default: 45 min)
 * @param similarityThreshold - Min cosine similarity to join an existing cluster (default: 0.3)
 */
export function clusterArticles(
	visits: BrowserVisit[],
	cleanedTitles: string[],
	engagementScores: number[],
	sessionGapMs = 45 * 60 * 1000,
	similarityThreshold = 0.3,
): ArticleCluster[] {
	// Filter to substantive visits only
	const substantive: BrowserVisit[] = [];
	const substantiveTitles: string[] = [];
	const substantiveScores: number[] = [];
	for (let i = 0; i < visits.length; i++) {
		if (engagementScores[i] >= 0.5) {
			substantive.push(visits[i]);
			substantiveTitles.push(cleanedTitles[i]);
			substantiveScores.push(engagementScores[i]);
		}
	}

	if (substantive.length === 0) return [];

	// Sort by timestamp ascending for greedy left-to-right session assignment
	const sortedIndices = substantive
		.map((_, i) => i)
		.sort((a, b) => (substantive[a].time?.getTime() ?? 0) - (substantive[b].time?.getTime() ?? 0));

	const sortedVisits = sortedIndices.map((i) => substantive[i]);
	const sortedTitles = sortedIndices.map((i) => substantiveTitles[i]);
	const sortedScores = sortedIndices.map((i) => substantiveScores[i]);

	const tfidf = buildTfIdf(sortedTitles);
	const clusters: ArticleCluster[] = [];

	// Track which corpus indices belong to each cluster for centroid computation
	const clusterMemberIndices: number[][] = [];

	for (let i = 0; i < sortedVisits.length; i++) {
		const visit = sortedVisits[i];
		const title = sortedTitles[i];
		const score = sortedScores[i];
		const vec = tfidf.get(String(i)) ?? new Map<string, number>();

		let placed = false;

		for (let ci = 0; ci < clusters.length; ci++) {
			const cluster = clusters[ci];
			const lastVisit = cluster.visits[cluster.visits.length - 1];
			if (!lastVisit.time || !visit.time) continue;
			const gap = visit.time.getTime() - lastVisit.time.getTime();
			if (gap > sessionGapMs) continue;

			// Compare to cluster centroid using the same full-corpus TF-IDF vectors
			const memberVectors = clusterMemberIndices[ci].map(
				(idx) => tfidf.get(String(idx)) ?? new Map<string, number>(),
			);
			const centroid = buildCentroid(memberVectors);

			if (cosineSimilarity(vec, centroid) >= similarityThreshold) {
				cluster.visits.push(visit);
				cluster.articles.push(title);
				clusterMemberIndices[ci].push(i);
				if (visit.time) cluster.timeRange.end = visit.time;
				// Update running average engagement score
				cluster.engagementScore =
					(cluster.engagementScore * (cluster.visits.length - 1) + score) /
					cluster.visits.length;
				placed = true;
				break;
			}
		}

		if (!placed) {
			clusters.push({
				label: "", // computed after all visits are placed
				articles: [title],
				visits: [visit],
				timeRange: {
					start: visit.time ?? new Date(),
					end: visit.time ?? new Date(),
				},
				engagementScore: score,
				intentSignal: "browsing",
			});
			clusterMemberIndices.push([i]);
		}
	}

	// Label each cluster and infer intent
	for (const cluster of clusters) {
		cluster.label = labelCluster(cluster.articles);
		cluster.intentSignal = inferIntent(cluster);
	}

	// Drop singleton clusters (< 2 articles)
	return clusters.filter((c) => c.articles.length >= 2);
}

// ── Convenience re-export ─────────────────────────────────

export { cleanTitle };
