/**
 * Cost Tracking & Reporting for LLM Testing
 *
 * Captures token usage and costs across all providers and personas.
 * Generates cost breakdowns and long-term projections for:
 * - Testing costs (per run, per persona, per tier)
 * - User-facing costs (if plugin uses paid APIs)
 * - ROI analysis (cost vs quality improvements)
 *
 * Pricing as of Feb 2025:
 *   Claude Haiku: $0.80/1M input tokens, $0.40/1M output tokens
 *   Local LLM: $0.00 (runs locally, some compute cost)
 *   Mock: $0.00
 */

export interface CostEntry {
	provider: "mock" | "anthropic" | "local";
	persona: string;
	tier: string;
	inputTokens: number;
	outputTokens: number;
	estimatedCost: number; // USD
	responseTime: number; // ms
	timestamp: number;
}

export interface CostAnalysis {
	entries: CostEntry[];
	summary: {
		totalCost: number;
		perProvider: Record<string, number>;
		perPersona: Record<string, number>;
		perTier: Record<string, number>;
	};
	projections: {
		perDay: number; // daily usage
		perWeek: number;
		perMonth: number;
		perYear: number;
	};
	userPresentation: {
		userFacingCostPerDay: number;
		userFacingCostPerMonth: number;
		recommendations: string[];
		tiersAndCosts: Record<string, { cost: number; privacy: string; useCase: string }>;
	};
}

// ─ Pricing Constants ────────────────────────────────────────────────

const ANTHROPIC_PRICING = {
	"claude-3-5-haiku-20241022": {
		input: 0.80 / 1_000_000, // $0.80 per 1M input tokens
		output: 0.40 / 1_000_000, // $0.40 per 1M output tokens
	},
	"claude-3-5-sonnet-20241022": {
		input: 3 / 1_000_000, // $3 per 1M input tokens
		output: 15 / 1_000_000, // $15 per 1M output tokens
	},
};

// ─ Tracking ────────────────────────────────────────────────────────

export class CostTracker {
	private entries: CostEntry[] = [];

	record(
		provider: "mock" | "anthropic" | "local",
		persona: string,
		tier: string,
		inputTokens: number,
		outputTokens: number,
		responseTime: number,
		model = "claude-3-5-haiku-20241022"
	): void {
		let estimatedCost = 0;

		if (provider === "anthropic") {
			const pricing =
				ANTHROPIC_PRICING[
					model as keyof typeof ANTHROPIC_PRICING
				] || ANTHROPIC_PRICING["claude-3-5-haiku-20241022"];

			estimatedCost = inputTokens * pricing.input + outputTokens * pricing.output;
		}
		// Local and mock are free

		this.entries.push({
			provider,
			persona,
			tier,
			inputTokens,
			outputTokens,
			estimatedCost,
			responseTime,
			timestamp: Date.now(),
		});
	}

	analyze(): CostAnalysis {
		const perProvider: Record<string, number> = {};
		const perPersona: Record<string, number> = {};
		const perTier: Record<string, number> = {};

		let totalCost = 0;

		for (const entry of this.entries) {
			totalCost += entry.estimatedCost;

			perProvider[entry.provider] =
				(perProvider[entry.provider] || 0) + entry.estimatedCost;
			perPersona[entry.persona] =
				(perPersona[entry.persona] || 0) + entry.estimatedCost;
			perTier[entry.tier] = (perTier[entry.tier] || 0) + entry.estimatedCost;
		}

		// Estimate daily/monthly usage
		// Assume: 1 run per day, 6 personas, 2 tiers = 12 API calls per run
		const costPerRun = totalCost;

		return {
			entries: this.entries,
			summary: {
				totalCost,
				perProvider,
				perPersona,
				perTier,
			},
			projections: {
				perDay: costPerRun,
				perWeek: costPerRun * 7,
				perMonth: costPerRun * 30,
				perYear: costPerRun * 365,
			},
			userPresentation: this.generateUserPresentation(totalCost, perTier),
		};
	}

	private generateUserPresentation(
		totalCost: number,
		perTier: Record<string, number>
	): CostAnalysis["userPresentation"] {
		// Estimate user-facing costs based on daily digest generation
		// Assuming: 1 digest per day, user chooses a tier

		const costPerDay = totalCost / (Math.max(1, this.entries.length) / 12); // Normalize

		return {
			userFacingCostPerDay: costPerDay,
			userFacingCostPerMonth: costPerDay * 30,
			recommendations: [
				costPerDay < 0.01
					? "✅ Tier 1 (Standard): < $0.01/day — use for full context"
					: "⚠️ Tier 1 (Standard): > $0.01/day — consider privacy tier routing",
				costPerDay < 0.003
					? "✅ Tier 3 (Classified): < $0.003/day — excellent privacy/cost balance"
					: "⚠️ Tier 3 (Classified): cost-effective privacy",
				costPerDay < 0.001
					? "✅ Tier 4 (Deidentified): < $0.001/day — maximum privacy, minimal cost"
					: "ℹ️ Tier 4 (Deidentified): lowest cost option",
				"💡 Average user: ~$0.10-0.30/month for daily digests",
			],
			tiersAndCosts: {
				"tier-1-standard": {
					cost: perTier["tier-1-standard"] || costPerDay * 0.04,
					privacy: "Low (sanitized data)",
					useCase: "Full context summaries",
				},
				"tier-2-rag": {
					cost: perTier["tier-2-rag"] || costPerDay * 0.025,
					privacy: "Medium (retrieved chunks)",
					useCase: "Relevant chunk summaries",
				},
				"tier-3-classified": {
					cost: perTier["tier-3-classified"] || costPerDay * 0.015,
					privacy: "High (abstractions only)",
					useCase: "Privacy-conscious users",
				},
				"tier-4-deidentified": {
					cost: perTier["tier-4-deidentified"] || costPerDay * 0.005,
					privacy: "Very High (aggregates only)",
					useCase: "Maximum privacy option",
				},
			},
		};
	}

	getEntries(): CostEntry[] {
		return this.entries;
	}

	reset(): void {
		this.entries = [];
	}
}

// ─ Report Generators ────────────────────────────────────────────────

export function formatCostReportConsole(analysis: CostAnalysis): string {
	const lines: string[] = [];

	lines.push("\n💰 COST ANALYSIS\n");
	lines.push("═".repeat(60));

	// Summary
	lines.push("\n📊 Total Test Cost");
	lines.push(
		`   ${analysis.summary.totalCost.toFixed(4)} USD (${(analysis.summary.totalCost * 100).toFixed(2)} cents)`
	);

	// Per Provider
	if (Object.keys(analysis.summary.perProvider).length > 0) {
		lines.push("\n📍 Cost by Provider");
		Object.entries(analysis.summary.perProvider).forEach(([provider, cost]) => {
			const icon =
				provider === "mock"
					? "⚪"
					: provider === "anthropic"
						? "🤖"
						: "🖥️ ";
			lines.push(
				`   ${icon} ${provider.padEnd(12)} $${cost.toFixed(4)} (${(cost * 100).toFixed(2)}¢)`
			);
		});
	}

	// Per Persona
	if (Object.keys(analysis.summary.perPersona).length > 0) {
		lines.push("\n👤 Cost by Persona");
		Object.entries(analysis.summary.perPersona)
			.sort((a, b) => b[1] - a[1])
			.slice(0, 3)
			.forEach(([persona, cost]) => {
				lines.push(
					`   • ${persona.substring(0, 30).padEnd(32)} $${cost.toFixed(4)}`
				);
			});
	}

	// Per Tier
	if (Object.keys(analysis.summary.perTier).length > 0) {
		lines.push("\n🔐 Cost by Privacy Tier");
		Object.entries(analysis.summary.perTier)
			.sort((a, b) => b[1] - a[1])
			.forEach(([tier, cost]) => {
				const tierNum = tier.match(/\d+/)?.[0] || "?";
				lines.push(
					`   Tier ${tierNum} (${tier.split("-").slice(1).join(" ")}) $${cost.toFixed(4)}`
				);
			});
	}

	// Projections
	lines.push("\n📈 Cost Projections (if used daily)");
	lines.push(
		`   Per day:    $${analysis.projections.perDay.toFixed(4)}`
	);
	lines.push(
		`   Per week:   $${analysis.projections.perWeek.toFixed(4)}`
	);
	lines.push(
		`   Per month:  $${analysis.projections.perMonth.toFixed(4)}`
	);
	lines.push(
		`   Per year:   $${analysis.projections.perYear.toFixed(2)}`
	);

	// User Presentation
	lines.push("\n👥 USER-FACING COSTS (If Plugin Becomes Public)");
	lines.push(
		`   Cost per daily digest: ~$${analysis.userPresentation.userFacingCostPerDay.toFixed(4)}/day`
	);
	lines.push(
		`   Cost per month: ~$${analysis.userPresentation.userFacingCostPerMonth.toFixed(2)}/month`
	);

	lines.push("\n🔐 Privacy Tier Costs (Per Tier)");
	Object.entries(analysis.userPresentation.tiersAndCosts).forEach(
		([tier, info]) => {
			lines.push(
				`   ${tier.padEnd(25)} $${info.cost.toFixed(4)}/day | Privacy: ${info.privacy}`
			);
		}
	);

	lines.push("\n💡 Recommendations");
	analysis.userPresentation.recommendations.forEach((rec) => {
		lines.push(`   ${rec}`);
	});

	lines.push("\n" + "═".repeat(60) + "\n");

	return lines.join("\n");
}

export function formatCostReportMarkdown(analysis: CostAnalysis): string {
	const lines: string[] = [];

	lines.push("## 💰 Cost Analysis & Projections\n");

	lines.push("### Summary\n");
	lines.push(`- **Total test cost:** $${analysis.summary.totalCost.toFixed(4)} (${(analysis.summary.totalCost * 100).toFixed(2)}¢)`);
	lines.push(`- **Per run estimate:** $${analysis.projections.perDay.toFixed(4)}`);
	lines.push(`- **Monthly projection:** $${analysis.projections.perMonth.toFixed(2)} (if run daily)\n`);

	lines.push("### Cost Breakdown\n");

	// By Provider
	if (Object.keys(analysis.summary.perProvider).length > 0) {
		lines.push("#### By Provider\n");
		lines.push("| Provider | Cost | % |");
		lines.push("|----------|------|---|");
		const total = Object.values(analysis.summary.perProvider).reduce((a, b) => a + b, 0);
		Object.entries(analysis.summary.perProvider).forEach(([provider, cost]) => {
			const pct = total > 0 ? ((cost / total) * 100).toFixed(1) : "0.0";
			lines.push(`| ${provider} | $${cost.toFixed(4)} | ${pct}% |`);
		});
		lines.push("");
	}

	// By Tier
	if (Object.keys(analysis.summary.perTier).length > 0) {
		lines.push("#### By Privacy Tier\n");
		lines.push("| Tier | Cost | Privacy Level | Use Case |");
		lines.push("|------|------|---------------|----------|");
		Object.entries(analysis.userPresentation.tiersAndCosts)
			.sort((a, b) => b[1].cost - a[1].cost)
			.forEach(([tier, info]) => {
				lines.push(
					`| ${tier.split("-").slice(1).join(" ")} | $${info.cost.toFixed(4)}/day | ${info.privacy} | ${info.useCase} |`
				);
			});
		lines.push("");
	}

	lines.push("### User-Facing Cost Model\n");
	lines.push(`If the plugin is released publicly, estimated costs per user:\n`);
	lines.push(
		`- **Cost per digest:** ~$${analysis.userPresentation.userFacingCostPerDay.toFixed(4)}`
	);
	lines.push(
		`- **Cost per month:** ~$${analysis.userPresentation.userFacingCostPerMonth.toFixed(2)}`
	);
	lines.push(`- **Cost per year:** ~$${(analysis.userPresentation.userFacingCostPerMonth * 12).toFixed(2)}\n`);

	lines.push("### Recommendations\n");
	analysis.userPresentation.recommendations.forEach((rec) => {
		lines.push(`- ${rec}`);
	});

	return lines.join("\n");
}

export function formatCostReportJSON(analysis: CostAnalysis): string {
	return JSON.stringify(analysis, null, 2);
}

export function formatCostReportCSV(analysis: CostAnalysis): string {
	const lines: string[] = [];

	// Header
	lines.push(
		"Provider,Persona,Tier,InputTokens,OutputTokens,EstimatedCost,ResponseTimeMs"
	);

	// Data rows
	analysis.entries.forEach((entry) => {
		lines.push(
			[
				entry.provider,
				entry.persona,
				entry.tier,
				entry.inputTokens,
				entry.outputTokens,
				entry.estimatedCost.toFixed(6),
				entry.responseTime,
			].join(",")
		);
	});

	return lines.join("\n");
}

// ─ Comparison Utilities ────────────────────────────────────────────

export function compareCostAcrossProviders(
	mockAnalysis: CostAnalysis,
	anthropicAnalysis: CostAnalysis,
	localAnalysis: CostAnalysis
): string {
	const lines: string[] = [];

	lines.push("\n📊 PROVIDER COST COMPARISON\n");
	lines.push("═".repeat(70));

	lines.push("\n| Metric | Mock | Claude (Haiku) | Local LLM |");
	lines.push("|--------|------|----------------|-----------|");

	// Total cost
	lines.push(
		`| Total Test Cost | $${mockAnalysis.summary.totalCost.toFixed(4)} | $${anthropicAnalysis.summary.totalCost.toFixed(4)} | $${localAnalysis.summary.totalCost.toFixed(4)} |`
	);

	// Per run
	lines.push(
		`| Per Run (estimated) | $0.0000 | $${anthropicAnalysis.projections.perDay.toFixed(4)} | $0.0000 |`
	);

	// Monthly
	lines.push(
		`| Monthly (daily use) | $0.00 | $${anthropicAnalysis.projections.perMonth.toFixed(2)} | $0.00 |`
	);

	// Yearly
	lines.push(
		`| Yearly (daily use) | $0.00 | $${(anthropicAnalysis.projections.perMonth * 12).toFixed(2)} | $0.00 |`
	);

	// Speed
	const mockSpeed =
		mockAnalysis.entries.reduce((sum, e) => sum + e.responseTime, 0) /
		Math.max(1, mockAnalysis.entries.length);
	const claudeSpeed =
		anthropicAnalysis.entries.reduce((sum, e) => sum + e.responseTime, 0) /
		Math.max(1, anthropicAnalysis.entries.length);
	const localSpeed =
		localAnalysis.entries.reduce((sum, e) => sum + e.responseTime, 0) /
		Math.max(1, localAnalysis.entries.length);

	lines.push(
		`| Avg Response Time | ${mockSpeed.toFixed(0)}ms | ${claudeSpeed.toFixed(0)}ms | ${localSpeed.toFixed(0)}ms |`
	);

	lines.push("\n" + "═".repeat(70) + "\n");

	return lines.join("\n");
}
