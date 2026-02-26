/**
 * Privacy Transparency Reporter
 *
 * Generates human-readable privacy tier transparency reports showing exactly what data
 * leaves the user's machine at each privacy level. Designed for user-facing documentation
 * and settings UI to explain the privacy/performance tradeoff.
 *
 * Privacy tiers:
 * - Tier 1 (Standard): Full sanitized context — best summary quality
 * - Tier 2 (Balanced): RAG-selected chunks only — balanced quality/privacy
 * - Tier 3 (High Privacy): Classified abstractions only — strong privacy
 * - Tier 4 (Maximum Privacy): Aggregated statistics only — strongest privacy
 */

/**
 * Data leaving machine policy for each privacy tier.
 * Describes exactly what personal data leaves the device.
 */
export interface DataLeavingMachine {
	/** Raw URLs of visited websites */
	urls: boolean;
	/** CLI commands from Codex/Claude Code sessions */
	commands: boolean;
	/** Actual file contents from Claude Code sessions */
	fileContents: boolean;
	/** Personal data like names, emails, identifiable information */
	personalData: boolean;
	/** Aggregated patterns and statistics only */
	aggregates: boolean;
}

/**
 * Complete tier information including visibility, cost, and data policy.
 */
export interface PrivacyTierInfo {
	/** Tier identifier: tier-1-standard, tier-2-rag, tier-3-classified, tier-4-deidentified */
	tier: "tier-1-standard" | "tier-2-rag" | "tier-3-classified" | "tier-4-deidentified";
	/** Human-readable tier name */
	name: string;
	/** One-line explanation of the tier */
	description: string;
	/** Exactly what data leaves the machine at this tier */
	dataLeavingMachine: DataLeavingMachine;
	/** Estimated monthly API cost in USD */
	costPerMonth: number;
	/** Visual privacy level indicator (█ blocks, 2-12 blocks) */
	privacyLevel: string;
}

/**
 * Privacy transparency reporter for user-facing documentation and settings UI.
 */
export class PrivacyReporter {
	/**
	 * Generate the complete privacy tier transparency matrix.
	 * Returns all four tiers with complete information.
	 *
	 * @returns Array of all privacy tiers with full transparency info
	 */
	generateTransparencyMatrix(): PrivacyTierInfo[] {
		return [
			{
				tier: "tier-1-standard",
				name: "Full Context",
				description: "Complete sanitized activity data for optimal summary quality.",
				dataLeavingMachine: {
					urls: true,
					commands: true,
					fileContents: true,
					personalData: false,
					aggregates: true,
				},
				costPerMonth: 0.31,
				privacyLevel: "██", // 2/12 blocks (least privacy)
			},
			{
				tier: "tier-2-rag",
				name: "Balanced",
				description: "Retrieval-augmented generation: only relevant context chunks sent to AI.",
				dataLeavingMachine: {
					urls: true,
					commands: false,
					fileContents: false,
					personalData: false,
					aggregates: true,
				},
				costPerMonth: 0.21,
				privacyLevel: "██████", // 6/12 blocks
			},
			{
				tier: "tier-3-classified",
				name: "High Privacy",
				description: "Classified abstractions only: activity types and intent, never raw data.",
				dataLeavingMachine: {
					urls: false,
					commands: false,
					fileContents: false,
					personalData: false,
					aggregates: true,
				},
				costPerMonth: 0.12,
				privacyLevel: "████████", // 8/12 blocks
			},
			{
				tier: "tier-4-deidentified",
				name: "Maximum Privacy",
				description: "Aggregated statistics only: zero per-event data leaves your machine.",
				dataLeavingMachine: {
					urls: false,
					commands: false,
					fileContents: false,
					personalData: false,
					aggregates: true,
				},
				costPerMonth: 0.03,
				privacyLevel: "████████████", // 12/12 blocks (maximum privacy)
			},
		];
	}

	/**
	 * Generate a human-readable markdown report of privacy tiers.
	 * Suitable for user-facing settings UI, documentation, or transparency reports.
	 *
	 * @param tiers - Array of privacy tier info (typically from generateTransparencyMatrix)
	 * @returns Formatted markdown report
	 */
	generateMarkdownReport(tiers: PrivacyTierInfo[]): string {
		const lines: string[] = [];

		// ── Header ──────────────────────────────────────────
		lines.push("# Privacy Transparency Report");
		lines.push("");
		lines.push("## What Leaves Your Machine Per Privacy Tier");
		lines.push("");
		lines.push(
			"Daily Digest gives you control over what personal data reaches Anthropic's API. " +
			"Each tier trades privacy for summary quality and cost."
		);
		lines.push("");

		// ── Comparison Table ────────────────────────────────
		lines.push("## Privacy Tier Comparison");
		lines.push("");
		lines.push(
			"| Tier | Name | Privacy Level | URLs | Commands | File Contents | Cost/Month |"
		);
		lines.push("|------|------|---------------|------|----------|---------------|------------|");

		for (const tier of tiers) {
			const tierNum = tier.tier.match(/tier-(\d)/)?.[1] ?? "?";
			const urls = tier.dataLeavingMachine.urls ? "✓" : "—";
			const commands = tier.dataLeavingMachine.commands ? "✓" : "—";
			const files = tier.dataLeavingMachine.fileContents ? "✓" : "—";
			const cost = `$${tier.costPerMonth.toFixed(2)}`;

			lines.push(
				`| ${tierNum} | ${tier.name} | ${tier.privacyLevel} | ${urls} | ${commands} | ${files} | ${cost} |`
			);
		}
		lines.push("");

		// ── Detailed Tier Descriptions ──────────────────────
		lines.push("## Tier Details");
		lines.push("");

		for (const tier of tiers) {
			const tierNum = tier.tier.match(/tier-(\d)/)?.[1] ?? "?";
			lines.push(`### Tier ${tierNum}: ${tier.name}`);
			lines.push("");
			lines.push(`**${tier.description}**`);
			lines.push("");

			// What leaves your machine
			lines.push("**What Leaves Your Machine:**");
			lines.push("");
			if (tier.dataLeavingMachine.urls) {
				lines.push("- ✓ Visited URLs (browser history)");
			} else {
				lines.push("- ✓ Stays local: Visited URLs");
			}

			if (tier.dataLeavingMachine.commands) {
				lines.push("- ✓ CLI commands (Codex, Claude Code)");
			} else {
				lines.push("- ✓ Stays local: CLI commands");
			}

			if (tier.dataLeavingMachine.fileContents) {
				lines.push("- ✓ File contents (from code sessions)");
			} else {
				lines.push("- ✓ Stays local: File contents");
			}

			if (tier.dataLeavingMachine.personalData) {
				lines.push("- ✓ Personal data (names, emails, etc.)");
			} else {
				lines.push("- ✓ Stays local: Personal data");
			}

			if (tier.dataLeavingMachine.aggregates) {
				lines.push("- ✓ Aggregated statistics (patterns, focus score, categories)");
			}

			lines.push("");

			// Cost per month
			lines.push(`**Monthly Cost:** $${tier.costPerMonth.toFixed(2)}`);
			lines.push("");

			// Privacy level narrative
			this.addPrivacyNarrative(tier, lines);
			lines.push("");
		}

		// ── Recommendation ─────────────────────────────────
		lines.push("## Recommendations");
		lines.push("");
		lines.push("- **Start with Tier 4** if privacy is your top priority.");
		lines.push(
			"- **Use Tier 3** for strong privacy with better summary quality."
		);
		lines.push(
			"- **Choose Tier 2** for a good balance of privacy and detailed insights."
		);
		lines.push(
			"- **Use Tier 1** only if you want the highest quality summaries and don't mind sending full context."
		);
		lines.push("");

		// ── Data Retention ─────────────────────────────────
		lines.push("## Data Retention");
		lines.push("");
		lines.push(
			"Anthropic's API processes your data according to their privacy policy. " +
			"No data is permanently stored by Daily Digest—only the AI-generated summary is saved to your vault. " +
			"All intermediate processing (chunking, sanitization, classification) happens locally."
		);
		lines.push("");

		// ── Local Processing ────────────────────────────────
		lines.push("## Always Local (Never Leaves Your Machine)");
		lines.push("");
		lines.push("- Raw browser history from SQLite databases");
		lines.push("- CLI commands and file contents (before optional Tier 1 transmission)");
		lines.push("- Search queries and Claude Code prompts");
		lines.push("- Git commit messages and diffs");
		lines.push("- Secret sanitization (API keys, tokens, passwords)");
		lines.push("- Sensitivity filtering (private domains, custom exclusions)");
		lines.push("- Pattern extraction (temporal clusters, focus scores)");
		lines.push("- Optional local LLM classification");
		lines.push("- Markdown note generation and merging");
		lines.push("");

		return lines.join("\n");
	}

	/**
	 * Add a tier-specific privacy narrative explaining the level of privacy.
	 */
	private addPrivacyNarrative(tier: PrivacyTierInfo, lines: string[]): void {
		switch (tier.tier) {
			case "tier-1-standard":
				lines.push(
					"**Privacy Level:** Low — secrets are stripped, but all events and raw URLs are sent. " +
					"Best for users who trust Anthropic and want the most detailed summaries."
				);
				break;

			case "tier-2-rag":
				lines.push(
					"**Privacy Level:** Moderate — only the most relevant activity chunks are sent. " +
					"URLs that might be relevant are included, but raw commands and file contents stay local. " +
					"Good balance of privacy and quality."
				);
				break;

			case "tier-3-classified":
				lines.push(
					"**Privacy Level:** High — raw event data never leaves your machine. " +
					"Only abstract activity types (e.g., 'web research', 'coding', 'writing') are sent. " +
					"Requires local LLM classification to work."
				);
				break;

			case "tier-4-deidentified":
				lines.push(
					"**Privacy Level:** Maximum — zero per-event data leaves your machine. " +
					"Only aggregated statistics (time spent by category, focus score, activity counts) are sent. " +
					"Minimal but sufficient for pattern-based summaries."
				);
				break;
		}
	}
}
