import { CATEGORY_LABELS } from "./categorize";
import {
	AISummary,
	BrowserVisit,
	CategorizedVisits,
	ClaudeSession,
	GitCommit,
	SearchQuery,
	ShellCommand,
	slugifyQuestion,
} from "./types";
import { AIProvider } from "./settings";
import { KnowledgeSections } from "./knowledge";
import { formatDetailsBlock, type PromptLog } from "../scripts/lib/prompt-logger";

function formatTime(d: Date | null): string {
	if (!d) return "";
	return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function formatDate(d: Date): string {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayOfWeek(d: Date): string {
	return d.toLocaleDateString("en-US", { weekday: "long" });
}

function longDate(d: Date): string {
	return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

export function renderMarkdown(
	date: Date,
	visits: BrowserVisit[],
	searches: SearchQuery[],
	shell: ShellCommand[],
	claudeSessions: ClaudeSession[],
	gitCommits: GitCommit[],
	categorized: CategorizedVisits,
	aiSummary: AISummary | null,
	aiProviderUsed: AIProvider | "none" = "none",
	knowledge?: KnowledgeSections,
	promptLog?: PromptLog
): string {
	const today = formatDate(date);
	const dow = dayOfWeek(date);
	const lines: string[] = [];

	// Theme tags from AI
	const themeTags: string[] = [];
	if (aiSummary?.themes) {
		for (const t of aiSummary.themes) {
			themeTags.push(t.toLowerCase().replace(/ /g, "-").replace(/\//g, "-"));
		}
	}
	const catTags = Object.keys(categorized).filter((k) => k !== "other");

	// ── Frontmatter ──────────────────────────────
	const knowledgeTags = knowledge?.tags ?? [];
	const allTags = ["daily", "daily-digest", ...catTags, ...themeTags, ...knowledgeTags];
	lines.push("---");
	lines.push(`date: ${today}`);
	lines.push(`day: ${dow}`);
	lines.push(`tags: [${allTags.join(", ")}]`);
	lines.push(`generated: ${formatDate(new Date())} ${formatTime(new Date())}`);
	lines.push(`categories: [${catTags.join(", ")}]`);
	if (aiSummary?.themes?.length) {
		lines.push(`themes: [${aiSummary.themes.join(", ")}]`);
	}
	// Add prompt IDs to frontmatter for Dataview discoverability
	const prompts = aiSummary?.prompts ?? [];
	if (prompts.length) {
		lines.push(`prompts: [${prompts.map((p) => p.id).join(", ")}]`);
	}
	if (knowledge) {
		// Add focus score and activity types to frontmatter
		lines.push(`focus_score: ${Math.round(knowledge.focusScore * 100)}%`);
	}
	if (gitCommits.length > 0) {
		lines.push(`git-commits: ${gitCommits.length}`);
	}
	lines.push("---");
	lines.push("");

	// ── Title ────────────────────────────────────
	lines.push(`# \u{1F4C5} ${longDate(date)}`);
	lines.push("");

	// ── Stats ────────────────────────────────────
	lines.push(
		`> [!info] ${visits.length} visits \u00B7 ${searches.length} searches \u00B7 ` +
			`${shell.length} commands \u00B7 ${claudeSessions.length} AI prompts \u00B7 ` +
			`${gitCommits.length} commits \u00B7 ` +
			`${Object.keys(categorized).length} categories`
	);
	lines.push("");

	// ── AI Headline & TL;DR ─────────────────────
	if (aiSummary) {
		if (aiSummary.headline) {
			lines.push(`> [!tip] ${aiSummary.headline}`);
			lines.push("");
		}
		if (aiSummary.tldr) {
			lines.push(`> [!abstract] ${aiSummary.tldr}`);
			lines.push("");
		}
		if (aiSummary.themes?.length) {
			const chips = aiSummary.themes.map((t) => `\`${t}\``).join(" \u00B7 ");
			lines.push(`**Themes:** ${chips}`);
			lines.push("");
		}
		lines.push("---");
		lines.push("");

		// Inject prompt visibility blocks if log provided
		if (promptLog && promptLog.length > 0) {
			for (const entry of promptLog) {
				lines.push("");
				lines.push(formatDetailsBlock(entry));
			}
		}
	}

	// ── Notable ──────────────────────────────────
	if (aiSummary?.notable?.length) {
		lines.push("## \u2728 Notable");
		lines.push("");
		for (const item of aiSummary.notable) {
			lines.push(`- ${item}`);
		}
		lines.push("");
	}

	// ── Category Summaries Table (C2) ───────────
	const catSumsEarly = aiSummary?.category_summaries ?? {};
	if (Object.keys(catSumsEarly).length > 0) {
		lines.push("| Category | Activity |");
		lines.push("|---|---|");
		for (const [cat, summary] of Object.entries(catSumsEarly)) {
			const [_emoji, label] = CATEGORY_LABELS[cat] ?? ["\u{1F310}", cat];
			lines.push(`| ${label} | ${summary} |`);
		}
		lines.push("");
	}

	// ── Work Patterns (C2) ───────────────────────
	if (aiSummary?.work_patterns?.length || aiSummary?.cross_source_connections?.length) {
		lines.push("## \u26A1 Work Patterns");
		lines.push("");
		if (aiSummary.work_patterns?.length) {
			for (const p of aiSummary.work_patterns) {
				lines.push(`- ${p}`);
			}
			lines.push("");
		}
		if (aiSummary.cross_source_connections?.length) {
			lines.push("### \u{1F517} Cross-Source Connections");
			lines.push("");
			for (const c of aiSummary.cross_source_connections) {
				lines.push(`> [!note] ${c}`);
				lines.push("");
			}
		}
		lines.push("---");
		lines.push("");
	}

	// ── Meta Insights (Phase 4) ─────────────────
	if (aiSummary?.meta_insights?.length || aiSummary?.quirky_signals?.length || aiSummary?.focus_narrative) {
		lines.push("## \u{1F52D} Cognitive Patterns");
		lines.push("");

		if (aiSummary.focus_narrative) {
			lines.push(`> ${aiSummary.focus_narrative}`);
			lines.push("");
		}

		if (aiSummary.meta_insights?.length) {
			lines.push("### Insights");
			lines.push("");
			for (const insight of aiSummary.meta_insights) {
				lines.push(`- ${insight}`);
			}
			lines.push("");
		}

		if (aiSummary.quirky_signals?.length) {
			lines.push("### \u{1F50E} Unusual Signals");
			lines.push("");
			for (const signal of aiSummary.quirky_signals) {
				lines.push(`- ${signal}`);
			}
			lines.push("");
		}

		lines.push("---");
		lines.push("");
	}

	// ── Knowledge Insights (Phase 3) ────────────
	if (knowledge) {
		lines.push("## \u{1F9E0} Knowledge Insights");
		lines.push("");

		// Focus summary
		lines.push(`> ${knowledge.focusSummary}`);
		lines.push("");

		// Temporal clusters
		if (knowledge.temporalInsights.length > 0) {
			lines.push("### \u{23F0} Activity Clusters");
			lines.push("");
			for (const insight of knowledge.temporalInsights) {
				lines.push(`- ${insight}`);
			}
			lines.push("");
		}

		// Topic map
		if (knowledge.topicMap.length > 0) {
			lines.push("### \u{1F5FA}\u{FE0F} Topic Map");
			lines.push("");
			for (const line of knowledge.topicMap) {
				lines.push(`- ${line}`);
			}
			lines.push("");
		}

		// Entity graph
		if (knowledge.entityGraph.length > 0) {
			lines.push("### \u{1F517} Entity Relations");
			lines.push("");
			for (const line of knowledge.entityGraph) {
				lines.push(`- ${line}`);
			}
			lines.push("");
		}

		// Recurrence signals
		if (knowledge.recurrenceNotes.length > 0) {
			lines.push("### \u{1F504} Recurrence Patterns");
			lines.push("");
			for (const note of knowledge.recurrenceNotes) {
				lines.push(`- ${note}`);
			}
			lines.push("");
		}

		// Knowledge delta
		if (knowledge.knowledgeDeltaLines.length > 0) {
			lines.push("### \u{1F4A1} Knowledge Delta");
			lines.push("");
			for (const line of knowledge.knowledgeDeltaLines) {
				lines.push(`- ${line}`);
			}
			lines.push("");
		}

		lines.push("---");
		lines.push("");
	}

	// ── Searches ─────────────────────────────────
	if (searches.length) {
		lines.push("## \u{1F50D} Searches");
		lines.push("");
		for (const s of searches) {
			const ts = formatTime(s.time);
			const engine = s.engine.replace(".com", "");
			const badge = engine ? `\`${engine}\`` : "";
			lines.push(`- ${badge} **${s.query}**` + (ts ? ` \u2014 ${ts}` : ""));
		}
		lines.push("");
	}

	// ── Claude Code sessions ─────────────────────
	if (claudeSessions.length) {
		lines.push("## \u{1F916} Claude Code / AI Work");
		lines.push("");
		for (const e of claudeSessions) {
			const ts = formatTime(e.time);
			const project = e.project ? `\`${e.project}\`` : "";
			const prompt = e.prompt.replace(/\n/g, " ").trim();
			lines.push(`- ${project} ${prompt}` + (ts ? ` \u2014 ${ts}` : ""));
		}
		lines.push("");
	}

	// ── Categorized browser activity ─────────────
	if (Object.keys(categorized).length) {
		lines.push("## \u{1F310} Browser Activity");
		lines.push("");

		for (const [cat, catVisits] of Object.entries(categorized)) {
			const [emoji, label] = CATEGORY_LABELS[cat] ?? ["\u{1F310}", cat];
			lines.push(`### ${emoji} ${label} (${catVisits.length})`);
			lines.push("");

			// Group by domain
			const byDomain: Record<string, BrowserVisit[]> = {};
			for (const v of catVisits) {
				const d = v.domain || "unknown";
				if (!byDomain[d]) byDomain[d] = [];
				byDomain[d].push(v);
			}

			const sorted = Object.entries(byDomain).sort((a, b) => b[1].length - a[1].length);
			for (const [domain, dvs] of sorted) {
				lines.push(`**${domain}** (${dvs.length})`);
				for (const v of dvs.slice(0, 5)) {
					const ts = formatTime(v.time);
					let title = (v.title || "").trim() || v.url;
					if (title.length > 75) title = title.slice(0, 75) + "\u2026";
					lines.push(`  - [${title}](${v.url})` + (ts ? ` \u2014 ${ts}` : ""));
				}
			}
			lines.push("");
		}
	}

	// ── Shell ────────────────────────────────────
	if (shell.length) {
		lines.push("## \u{1F4BB} Shell");
		lines.push("");
		lines.push(`<details><summary>${shell.length} commands</summary>`);
		lines.push("");
		lines.push("```bash");
		for (const e of shell) {
			const ts = formatTime(e.time) || "     ";
			lines.push(`# ${ts}  ${e.cmd}`);
		}
		lines.push("```");
		lines.push("");
		lines.push("</details>");
		lines.push("");
	}

	// ── Git Activity ────────────────────────────────
	if (gitCommits.length) {
		lines.push("## \u{1F4E6} Git Activity");
		lines.push("");

		// Group by repo
		const byRepo: Record<string, GitCommit[]> = {};
		for (const c of gitCommits) {
			const repo = c.repo || "unknown";
			if (!byRepo[repo]) byRepo[repo] = [];
			byRepo[repo].push(c);
		}

		for (const [repo, repoCommits] of Object.entries(byRepo)) {
			lines.push(`### ${repo} (${repoCommits.length} commits)`);
			lines.push("");
			for (const c of repoCommits) {
				const ts = formatTime(c.time);
				const stats = c.filesChanged > 0
					? ` (+${c.insertions}/-${c.deletions})`
					: "";
				lines.push(`- \`${c.hash.slice(0, 7)}\` ${c.message}${stats}` + (ts ? ` \u2014 ${ts}` : ""));
			}
			lines.push("");
		}
	}

	// ── Reflection ───────────────────────────────
	if (prompts.length) {
		lines.push("## \u{1FA9E} Reflection");
		lines.push("");
		for (const p of prompts) {
			lines.push(`### ${p.question}`);
			lines.push(`answer_${p.id}:: `);
			lines.push("");
		}
	} else if (aiSummary?.questions?.length) {
		// Fallback: plain questions without structured IDs
		lines.push("## \u{1FA9E} Reflection");
		lines.push("");
		for (const q of aiSummary.questions) {
			const id = slugifyQuestion(q);
			lines.push(`### ${q}`);
			lines.push(`answer_${id}:: `);
			lines.push("");
		}
	}

	// ── Notes ────────────────────────────────────
	lines.push("---");
	lines.push("");
	lines.push("## \u{1F4DD} Notes");
	lines.push("");
	lines.push("> _Add your reflections here_");
	lines.push("");

	// ── Generation footer ────────────────────────
	lines.push("---");
	lines.push("");
	if (aiProviderUsed === "anthropic") {
		lines.push(
			"*Generated by Daily Digest. AI summary provided by Anthropic API " +
			"([privacy policy](https://www.anthropic.com/policies/privacy)).*"
		);
	} else if (aiProviderUsed === "local") {
		lines.push(
			"*Generated by Daily Digest. AI summary processed locally. " +
			"No data was sent externally.*"
		);
	} else {
		lines.push("*Generated locally by Daily Digest. No data was sent externally.*");
	}
	lines.push("");

	return lines.join("\n");
}
