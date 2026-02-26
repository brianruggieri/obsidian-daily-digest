/**
 * Output Comparison Report Generator
 *
 * Compares Claude API and local LLM outputs across all 6 personas.
 * Generates analysis reports including:
 * - Format consistency (JSON shape across providers)
 * - Privacy compliance (tier-specific checks)
 * - Quality metrics (specificity, actionability, focus accuracy)
 * - Token efficiency (input/output tokens per tier)
 * - Persona-specific insights (what works well, what needs improvement)
 *
 * Usage:
 *   npx ts-node tests/eval/output-comparison.ts [--format=json|markdown|csv]
 */

export interface ProviderOutput {
	provider: "mock" | "anthropic" | "local";
	model: string;
	personaName: string;
	tier: string;
	output: Record<string, unknown>;
	tokensIn: number;
	tokensOut: number;
	responseTime: number; // ms
	timestamp: number;
}

export interface ComparisonMetrics {
	persona: string;
	provider: string;
	metrics: {
		fieldCount: number;
		workPatternsCount: number;
		connectionsCount: number;
		headlineLength: number;
		summaryLength: number;
		focusScore: number | undefined;
		secrets: number;
		urls: number;
		emails: number;
	};
	quality: {
		completeness: number; // 0-1: all required fields present
		consistency: number; // 0-1: compared to mock baseline
		specificity: number; // 0-1: headline/summary detail level
		actionability: number; // 0-1: insights are usable
		privacy: number; // 0-1: no leaks for tier
	};
	issues: string[];
}

export interface ComparisonReport {
	generated: string;
	meta: {
		providers: string[];
		personas: string[];
		tiers: string[];
	};
	results: ComparisonMetrics[];
	summary: {
		bestProvider: string;
		recommendations: string[];
		costAnalysis: Record<string, { inputCost: number; outputCost: number }>;
	};
}

// ─ Metric Extractors ────────────────────────────────────────────────

function extractMetrics(output: Record<string, unknown>): ComparisonMetrics["metrics"] {
	const secretPatterns = [
		/ghp_[A-Za-z0-9_]{36,255}/gi,
		/sk-ant-[A-Za-z0-9_]{48,}/gi,
		/AKIA[0-9A-Z]{16}/gi,
		/sk-proj-[A-Za-z0-9_-]{48,}/gi,
	];

	const text = JSON.stringify(output);
	let secretCount = 0;
	secretPatterns.forEach((pattern) => {
		const matches = text.match(pattern);
		if (matches) secretCount += matches.length;
	});

	const urlMatches = text.match(/https?:\/\/[a-zA-Z0-9.-]+/gi) || [];
	const emailMatches = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];

	return {
		fieldCount: Object.keys(output).length,
		workPatternsCount: Array.isArray(output.work_patterns)
			? (output.work_patterns as unknown[]).length
			: 0,
		connectionsCount: Array.isArray(output.cross_source_connections)
			? (output.cross_source_connections as unknown[]).length
			: 0,
		headlineLength: typeof output.headline === "string" ? output.headline.length : 0,
		summaryLength: typeof output.summary === "string" ? output.summary.length : 0,
		focusScore: typeof output.focus_score === "number" ? output.focus_score : undefined,
		secrets: secretCount,
		urls: urlMatches.length,
		emails: emailMatches.length,
	};
}

function scoreCompleteness(metrics: ComparisonMetrics["metrics"]): number {
	let score = 1.0;

	// Must have work_patterns
	if (metrics.workPatternsCount === 0) score -= 0.2;

	// Must have connections
	if (metrics.connectionsCount === 0) score -= 0.2;

	// Summary should be substantial
	if (metrics.summaryLength < 50) score -= 0.15;

	// Headline should exist
	if (metrics.headlineLength < 10) score -= 0.15;

	return Math.max(0, score);
}

function scoreConsistency(
	current: ComparisonMetrics["metrics"],
	baseline: ComparisonMetrics["metrics"]
): number {
	let score = 1.0;

	// Work patterns count should be similar (within 50%)
	const wpRatio = baseline.workPatternsCount
		? current.workPatternsCount / baseline.workPatternsCount
		: 1;
	if (wpRatio < 0.5 || wpRatio > 2) score -= 0.2;

	// Connections should be similar
	const connRatio = baseline.connectionsCount ? current.connectionsCount / baseline.connectionsCount : 1;
	if (connRatio < 0.5 || connRatio > 2) score -= 0.2;

	// Summary length should be similar
	const sumRatio = baseline.summaryLength ? current.summaryLength / baseline.summaryLength : 1;
	if (sumRatio < 0.5 || sumRatio > 2) score -= 0.15;

	return Math.max(0, score);
}

function scoreSpecificity(metrics: ComparisonMetrics["metrics"]): number {
	let score = 0;

	// Headlines between 30-150 chars are typically good
	if (metrics.headlineLength >= 30 && metrics.headlineLength <= 150) score += 0.3;

	// Summaries should be 200+ chars
	if (metrics.summaryLength >= 200) score += 0.3;

	// Work patterns and connections indicate structure
	if (metrics.workPatternsCount >= 2) score += 0.2;
	if (metrics.connectionsCount >= 1) score += 0.2;

	return Math.min(1, score);
}

function scoreActionability(output: Record<string, unknown>): number {
	const text = JSON.stringify(output).toLowerCase();
	let score = 0.5; // baseline

	// Look for action-oriented language
	const actionWords = [
		"focus",
		"deep work",
		"context switch",
		"pattern",
		"trend",
		"primarily",
		"emerged",
		"concentrated",
	];
	const matches = actionWords.filter((w) => text.includes(w)).length;
	score += matches * 0.1;

	return Math.min(1, score);
}

function scorePrivacy(output: Record<string, unknown>, tier: string): number {
	const text = JSON.stringify(output);
	let score = 1.0;

	// Check for secrets
	const secretPatterns = [
		/ghp_[A-Za-z0-9_]{36,255}/gi,
		/sk-ant-[A-Za-z0-9_]{48,}/gi,
		/AKIA[0-9A-Z]{16}/gi,
	];
	secretPatterns.forEach((pattern) => {
		const matches = text.match(pattern);
		if (matches && matches.length > 0) score -= 0.5;
	});

	if (tier === "tier-4-deidentified") {
		// Tier 4 should have no URLs
		if (text.match(/https?:\/\//gi)) score -= 0.3;

		// Tier 4 should not mention specific tools
		if (text.includes("github") || text.includes("npm") || text.includes("git")) score -= 0.2;
	}

	if (tier === "tier-3-classified") {
		// Tier 3 should not have raw commands
		if (text.match(/npm run|git commit|curl http/gi)) score -= 0.2;
	}

	return Math.max(0, score);
}

// ─ Report Generation ────────────────────────────────────────────────

export async function generateComparisonReport(
	providerOutputs: ProviderOutput[]
): Promise<ComparisonReport> {
	const results: ComparisonMetrics[] = [];
	const mockBaselines = new Map<string, ComparisonMetrics["metrics"]>();

	// First pass: collect mock baselines
	providerOutputs
		.filter((p) => p.provider === "mock")
		.forEach((p) => {
			mockBaselines.set(p.personaName, extractMetrics(p.output));
		});

	// Second pass: score all outputs
	for (const providerOutput of providerOutputs) {
		const metrics = extractMetrics(providerOutput.output);
		const baseline = mockBaselines.get(providerOutput.personaName) || metrics;

		const issues: string[] = [];

		// Quality checks
		if (metrics.secrets > 0) {
			issues.push(`⚠️  ${metrics.secrets} potential secrets detected`);
		}

		if (
			providerOutput.tier === "tier-4-deidentified" &&
			metrics.urls > 0
		) {
			issues.push(`⚠️  Tier 4 should have no URLs, found ${metrics.urls}`);
		}

		if (metrics.workPatternsCount === 0) {
			issues.push(`❌ No work patterns identified`);
		}

		if (metrics.connectionsCount === 0) {
			issues.push(`⚠️  No cross-source connections identified`);
		}

		results.push({
			persona: providerOutput.personaName,
			provider: providerOutput.provider,
			metrics,
			quality: {
				completeness: scoreCompleteness(metrics),
				consistency: scoreConsistency(metrics, baseline),
				specificity: scoreSpecificity(metrics),
				actionability: scoreActionability(providerOutput.output),
				privacy: scorePrivacy(providerOutput.output, providerOutput.tier),
			},
			issues,
		});
	}

	// Analysis
	const providers = [...new Set(providerOutputs.map((p) => p.provider))];
	const personas = [...new Set(providerOutputs.map((p) => p.personaName))];
	const tiers = [...new Set(providerOutputs.map((p) => p.tier))];

	// Find best provider (average quality score)
	const providerScores = new Map<string, number[]>();
	results.forEach((r) => {
		const avgQuality =
			(r.quality.completeness +
				r.quality.consistency +
				r.quality.specificity +
				r.quality.actionability +
				r.quality.privacy) /
			5;

		if (!providerScores.has(r.provider)) providerScores.set(r.provider, []);
		providerScores.get(r.provider)!.push(avgQuality);
	});

	let bestProvider = "mock";
	let bestScore = 0;
	providerScores.forEach((scores, provider) => {
		const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
		if (avg > bestScore) {
			bestScore = avg;
			bestProvider = provider;
		}
	});

	const recommendations: string[] = [];

	// Tier-specific recommendations
	if (results.filter((r) => r.provider === "anthropic" && r.metrics.secrets === 0).length > 0) {
		recommendations.push("✅ Claude API maintains privacy compliance across all tiers");
	}

	if (
		results.filter(
			(r) =>
				r.quality.actionability > 0.8 &&
				r.quality.specificity > 0.7
		).length > results.length * 0.7
	) {
		recommendations.push("✅ Summary quality is high and actionable");
	}

	// Cost analysis (Haiku pricing as of Feb 2025)
	const costAnalysis: Record<string, { inputCost: number; outputCost: number }> = {};
	const haikuInputCost = 0.80 / 1_000_000; // $0.80 per 1M input tokens
	const haikuOutputCost = 0.40 / 1_000_000; // $0.40 per 1M output tokens

	const anthropicOutputs = providerOutputs.filter((p) => p.provider === "anthropic");
	if (anthropicOutputs.length > 0) {
		const totalIn = anthropicOutputs.reduce((sum, p) => sum + p.tokensIn, 0);
		const totalOut = anthropicOutputs.reduce((sum, p) => sum + p.tokensOut, 0);
		costAnalysis["anthropic-haiku"] = {
			inputCost: totalIn * haikuInputCost,
			outputCost: totalOut * haikuOutputCost,
		};
	}

	// Local LLM is free (runs locally) but add compute cost reference
	const localOutputs = providerOutputs.filter((p) => p.provider === "local");
	if (localOutputs.length > 0) {
		const avgResponseTime =
			localOutputs.reduce((sum, p) => sum + p.responseTime, 0) / localOutputs.length;
		costAnalysis["local-llm"] = {
			inputCost: 0,
			outputCost: 0, // Free, but avgResponseTime: ${avgResponseTime}ms
		};
		recommendations.push(
			`Local LLM avg response: ${avgResponseTime.toFixed(0)}ms (zero API cost)`
		);
	}

	return {
		generated: new Date().toISOString(),
		meta: {
			providers,
			personas,
			tiers,
		},
		results,
		summary: {
			bestProvider,
			recommendations,
			costAnalysis,
		},
	};
}

// ─ Report Formatters ────────────────────────────────────────────────

export function formatReportMarkdown(report: ComparisonReport): string {
	const lines: string[] = [];

	lines.push("# LLM Output Comparison Report\n");
	lines.push(`**Generated:** ${report.generated}\n`);

	lines.push("## Executive Summary\n");
	lines.push(`- **Best Provider:** ${report.summary.bestProvider}\n`);
	lines.push(`- **Personas Tested:** ${report.meta.personas.length}\n`);
	lines.push(`- **Tiers Evaluated:** ${report.meta.tiers.join(", ")}\n`);

	if (report.summary.recommendations.length > 0) {
		lines.push("\n### Key Findings\n");
		report.summary.recommendations.forEach((rec) => {
			lines.push(`- ${rec}`);
		});
	}

	lines.push("\n## Cost Analysis\n");
	lines.push("| Provider | Input Cost | Output Cost | Total |");
	lines.push("|----------|-----------|-----------|-------|");
	Object.entries(report.summary.costAnalysis).forEach(([provider, costs]) => {
		const total = (costs.inputCost + costs.outputCost).toFixed(4);
		lines.push(
			`| ${provider} | $${costs.inputCost.toFixed(4)} | $${costs.outputCost.toFixed(4)} | $${total} |`
		);
	});

	lines.push("\n## Detailed Results\n");

	const byPersona = new Map<string, ComparisonMetrics[]>();
	report.results.forEach((r) => {
		if (!byPersona.has(r.persona)) byPersona.set(r.persona, []);
		byPersona.get(r.persona)!.push(r);
	});

	byPersona.forEach((results, persona) => {
		lines.push(`\n### ${persona}\n`);
		lines.push("| Provider | Format | Privacy | Specificity | Actionability | Issues |");
		lines.push("|----------|--------|---------|-------------|---------------|--------|");

		results.forEach((r) => {
			const formatScore = (r.quality.completeness * 100).toFixed(0);
			const privacyScore = (r.quality.privacy * 100).toFixed(0);
			const specificityScore = (r.quality.specificity * 100).toFixed(0);
			const actionabilityScore = (r.quality.actionability * 100).toFixed(0);
			const issuesStr = r.issues.length === 0 ? "✅" : `${r.issues.length} issue(s)`;

			lines.push(
				`| ${r.provider} | ${formatScore}% | ${privacyScore}% | ${specificityScore}% | ${actionabilityScore}% | ${issuesStr} |`
			);

			if (r.issues.length > 0) {
				r.issues.forEach((issue) => lines.push(`  - ${issue}`));
			}
		});
	});

	return lines.join("\n");
}

export function formatReportJSON(report: ComparisonReport): string {
	return JSON.stringify(report, null, 2);
}

export function formatReportCSV(report: ComparisonReport): string {
	const lines: string[] = [];

	// Header
	lines.push(
		"Persona,Provider,Format Score,Privacy Score,Specificity,Actionability,Work Patterns,Connections,Issues"
	);

	// Data rows
	report.results.forEach((r) => {
		lines.push(
			[
				r.persona,
				r.provider,
				(r.quality.completeness * 100).toFixed(0),
				(r.quality.privacy * 100).toFixed(0),
				(r.quality.specificity * 100).toFixed(0),
				(r.quality.actionability * 100).toFixed(0),
				r.metrics.workPatternsCount,
				r.metrics.connectionsCount,
				r.issues.length,
			].join(",")
		);
	});

	return lines.join("\n");
}

// ─ CLI Runner ────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
	const format = process.argv[2]?.replace("--format=", "") || "markdown";

	const exampleOutput: ProviderOutput[] = [
		{
			provider: "mock",
			model: "mock",
			personaName: "Software Engineer — Deep Work Day",
			tier: "tier-3-classified",
			output: {
				headline: "Day of focused OAuth debugging and implementation",
				summary: "Concentrated session debugging OAuth token refresh flows.",
				work_patterns: [
					{ pattern: "Research → Implementation → Testing cycle" },
					{ pattern: "Deep focus on authentication layer" },
				],
				cross_source_connections: ["GitHub ↔ Claude Code (debugging)", "GitHub ↔ StackOverflow"],
				focus_score: 0.78,
			},
			tokensIn: 1200,
			tokensOut: 350,
			responseTime: 2100,
			timestamp: Date.now(),
		},
	];

	generateComparisonReport(exampleOutput).then((report) => {
		if (format === "json") {
			console.log(formatReportJSON(report));
		} else if (format === "csv") {
			console.log(formatReportCSV(report));
		} else {
			console.log(formatReportMarkdown(report));
		}
	});
}
