import { CATEGORY_LABELS } from "../filter/categorize";
import {
	AISummary,
	BrowserVisit,
	CategorizedVisits,
	ClaudeSession,
	GitCommit,
	SearchQuery,
	slugifyQuestion,
} from "../types";
import { AIProvider } from "../settings/types";
import { KnowledgeSections } from "../analyze/knowledge";
import { formatDetailsBlock, type PromptLog } from "../../scripts/lib/prompt-logger";
import { escapeForMarkdown, escapeForLinkText, escapeForTableCell, escapeForYaml } from "./escape";
import { cleanUrlForDisplay } from "./url-display";

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

/**
 * Renders the Knowledge Insights section into the provided lines array.
 * Extracted as a helper so the block can be positioned differently depending
 * on whether an AI summary is present (AI-on: before raw data; no-AI: after).
 */
function renderKnowledgeInsights(lines: string[], knowledge: KnowledgeSections): void {
	lines.push("## \u{1F9E0} Knowledge Insights");
	lines.push("");

	// Focus summary
	lines.push(`> ${escapeForMarkdown(knowledge.focusSummary)}`);
	lines.push("");

	// Temporal clusters
	if (knowledge.temporalInsights.length > 0) {
		lines.push("### \u{23F0} Activity Clusters");
		lines.push("");
		for (const insight of knowledge.temporalInsights) {
			lines.push(`- ${escapeForMarkdown(insight)}`);
		}
		lines.push("");
	}

	// Topic map
	if (knowledge.topicMap.length > 0) {
		lines.push("### \u{1F5FA}\u{FE0F} Topic Map");
		lines.push("");
		for (const line of knowledge.topicMap) {
			lines.push(`- ${escapeForMarkdown(line)}`);
		}
		lines.push("");
	}

	// Entity graph
	if (knowledge.entityGraph.length > 0) {
		lines.push("### \u{1F517} Entity Relations");
		lines.push("");
		for (const line of knowledge.entityGraph) {
			lines.push(`- ${escapeForMarkdown(line)}`);
		}
		lines.push("");
	}

	// Recurrence signals
	if (knowledge.recurrenceNotes.length > 0) {
		lines.push("### \u{1F504} Recurrence Patterns");
		lines.push("");
		for (const note of knowledge.recurrenceNotes) {
			lines.push(`- ${escapeForMarkdown(note)}`);
		}
		lines.push("");
	}

	// Knowledge delta
	if (knowledge.knowledgeDeltaLines.length > 0) {
		lines.push("### \u{1F4A1} Knowledge Delta");
		lines.push("");
		for (const line of knowledge.knowledgeDeltaLines) {
			lines.push(`- ${escapeForMarkdown(line)}`);
		}
		lines.push("");
	}

	lines.push("---");
	lines.push("");
}

export function renderMarkdown(
	date: Date,
	visits: BrowserVisit[],
	searches: SearchQuery[],
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
		lines.push(`themes: [${aiSummary.themes.map((t) => escapeForYaml(t)).join(", ")}]`);
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
			`${claudeSessions.length} AI prompts \u00B7 ` +
			`${gitCommits.length} commits \u00B7 ` +
			`${Object.keys(categorized).length} categories`
	);
	lines.push("");

	// ── AI Headline ──────────────────────────────
	if (aiSummary) {
		if (aiSummary.headline) {
			lines.push(`> [!tip] ${escapeForMarkdown(aiSummary.headline)}`);
			lines.push("");
		}
		// TL;DR callout removed — work_story (prose narrative) is the primary
		// high-level summary.  If work_story is absent, fall back to rendering
		// tldr as a plain paragraph so the day still has a human-readable lead.
		if (!aiSummary.work_story && aiSummary.tldr) {
			lines.push(escapeForMarkdown(aiSummary.tldr));
			lines.push("");
		}
		if (aiSummary.themes?.length) {
			const chips = aiSummary.themes.map((t) => `\`${t}\``).join(" \u00B7 ");
			lines.push(`**Themes:** ${chips}`);
			lines.push("");
		}
		if (aiSummary.work_story) {
			lines.push(escapeForMarkdown(aiSummary.work_story));
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
		lines.push("---");
		lines.push("");
	}

	// ── Notable ──────────────────────────────────
	if (aiSummary?.notable?.length) {
		lines.push("## \u2728 Notable");
		lines.push("");
		for (const item of aiSummary.notable) {
			lines.push(`- ${escapeForMarkdown(item)}`);
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
			lines.push(`| ${escapeForTableCell(label)} | ${escapeForTableCell(summary)} |`);
		}
		lines.push("");
	}

	// ── Work Patterns (C2) ───────────────────────
	// Rendered as a collapsed callout so verbose bullet lists don't dominate
	// the initial view — the reader can expand on demand.
	if (aiSummary?.work_patterns?.length || aiSummary?.cross_source_connections?.length) {
		lines.push(`> [!info]- \u26A1 Work Patterns`);
		if (aiSummary.work_patterns?.length) {
			for (const p of aiSummary.work_patterns) {
				lines.push(`> - ${escapeForMarkdown(p)}`);
			}
		}
		if (aiSummary.cross_source_connections?.length) {
			lines.push(`> `);
			lines.push(`> **\u{1F517} Cross-Source Connections**`);
			lines.push(`> `);
			for (const c of aiSummary.cross_source_connections) {
				lines.push(`> - ${escapeForMarkdown(c)}`);
			}
		}
		lines.push("");
		lines.push("---");
		lines.push("");
	}

	// ── Meta Insights (Phase 4) ─────────────────
	if (aiSummary?.meta_insights?.length || aiSummary?.quirky_signals?.length || aiSummary?.focus_narrative) {
		lines.push("## \u{1F52D} Cognitive Patterns");
		lines.push("");

		if (aiSummary.focus_narrative) {
			lines.push(`> ${escapeForMarkdown(aiSummary.focus_narrative)}`);
			lines.push("");
		}

		if (aiSummary.meta_insights?.length) {
			lines.push("### Insights");
			lines.push("");
			for (const insight of aiSummary.meta_insights) {
				lines.push(`- ${escapeForMarkdown(insight)}`);
			}
			lines.push("");
		}

		if (aiSummary.quirky_signals?.length) {
			lines.push("### \u{1F50E} Unusual Signals");
			lines.push("");
			for (const signal of aiSummary.quirky_signals) {
				lines.push(`- ${escapeForMarkdown(signal)}`);
			}
			lines.push("");
		}

		lines.push("---");
		lines.push("");
	}

	// ── Knowledge Insights (AI-on mode position) ─
	// In AI-on mode, Knowledge Insights renders here — after Cognitive Patterns
	// but before the raw data sections.  In no-AI mode, it renders after Git
	// Activity so the reader sees raw data before synthesized conclusions.
	if (knowledge && aiSummary) {
		renderKnowledgeInsights(lines, knowledge);
	}

	// ── Searches ─────────────────────────────────
	if (searches.length) {
		lines.push("## \u{1F50D} Searches");
		lines.push("");
		for (const s of searches) {
			const ts = formatTime(s.time);
			const engine = s.engine.replace(".com", "");
			const badge = engine ? `\`${engine}\`` : "";
			lines.push(`- ${badge} **${escapeForMarkdown(s.query)}**` + (ts ? ` \u2014 ${ts}` : ""));
		}
		lines.push("");
	}

	// ── Today I Read About (article clusters) ────
	if (knowledge?.articleClusters && knowledge.articleClusters.length > 0) {
		lines.push("> [!info]- \u{1F4D6} Today I Read About");
		for (const cluster of knowledge.articleClusters) {
			const startTs = cluster.timeRange.start ? formatTime(cluster.timeRange.start) : "";
			const endTs = cluster.timeRange.end ? formatTime(cluster.timeRange.end) : "";
			const timeRange = startTs && endTs && startTs !== endTs ? `${startTs}\u2013${endTs}` : startTs;
			const intentLabel = cluster.intentSignal === "research" ? "Research session"
				: cluster.intentSignal === "reference" ? "Reference"
				: cluster.intentSignal === "implementation" ? "Implementation reference"
				: "Reading session";
			const articleCount = cluster.articles.length;
			const articleWord = articleCount === 1 ? "article" : "articles";

			lines.push(`> `);
			lines.push(`> ### ${escapeForMarkdown(cluster.label)}`);
			const meta = [intentLabel, timeRange, `${articleCount} ${articleWord}`]
				.filter(Boolean)
				.join(" \u00B7 ");
			lines.push(`> *${meta}*`);

			// Render each article with domain attribution
			for (let ai = 0; ai < cluster.articles.length; ai++) {
				const title = cluster.articles[ai];
				const visit = cluster.visits[ai];
				let domain = "";
				try {
					domain = new URL(visit.url).hostname.replace(/^www\./, "");
				} catch {
					// ignore invalid URLs
				}
				const domainLabel = domain ? ` \u2014 ${domain}` : "";
				lines.push(`> - "${escapeForMarkdown(title)}"${domainLabel}`);
			}
		}
		lines.push("");
	}

	// ── Today I Worked On (commit work units) ────
	if (knowledge?.commitWorkUnits && knowledge.commitWorkUnits.length > 0) {
		lines.push("> [!info]- \u{1F528} Today I Worked On");
		for (const unit of knowledge.commitWorkUnits) {
			if (unit.isGeneric) continue; // skip low-signal WIP units
			const commitWord = unit.commits.length === 1 ? "commit" : "commits";
			const insertions = unit.commits.reduce((sum, c) => sum + c.insertions, 0);
			const deletions = unit.commits.reduce((sum, c) => sum + c.deletions, 0);
			const stats = insertions > 0 || deletions > 0
				? `, ${insertions} insertions`
				: "";
			lines.push(`> - **${escapeForMarkdown(unit.label)}** \u2014 ${unit.commits.length} ${commitWord}${stats}`);
			if (unit.hasWhyInformation && unit.whyClause) {
				lines.push(`>   *${escapeForMarkdown(unit.whyClause)}*`);
			} else if (unit.commits.length > 0) {
				// Show the most descriptive commit message as a sub-line
				const best = unit.commits.reduce((a, b) =>
					b.message.length > a.message.length ? b : a
				);
				if (best.message && !unit.label.toLowerCase().includes(best.message.slice(0, 20).toLowerCase())) {
					lines.push(`>   _${escapeForMarkdown(best.message.slice(0, 120))}_`);
				}
			}
		}
		lines.push("");
	}

	// ── Today I Asked Claude About (task sessions) ────
	if (knowledge?.claudeTaskSessions && knowledge.claudeTaskSessions.length > 0) {
		lines.push("> [!info]- \u{1F916} Today I Asked Claude About");
		for (const session of knowledge.claudeTaskSessions) {
			const turnWord = session.turnCount === 1 ? "turn" : "turns";
			const depthLabel = session.isDeepLearning ? "deep exploration"
				: session.interactionMode === "exploration" ? "exploration"
				: "implementation";
			const topicBadge = session.topicCluster !== "general"
				? ` \u2014 \`${session.topicCluster}\`` : "";
			lines.push(
				`> - **${escapeForMarkdown(session.taskTitle)}**${topicBadge} ` +
				`_(${session.taskType}, ${session.turnCount} ${turnWord}, ${depthLabel})_`
			);
		}
		lines.push("");
	}

	// ── Task Sessions (cross-source unified sessions) ────
	// Only rendered when cross-source fusion has produced results.
	// The fusion stub in task-sessions.ts returns [] so this section
	// is currently suppressed. It will activate once fusion is implemented.
	if (knowledge?.commitWorkUnits || knowledge?.claudeTaskSessions) {
		// Placeholder: Task Sessions section is reserved for cross-source fusion output.
		// When unifiedTaskSessions are available they will be rendered here as:
		//   ## 🔗 Task Sessions
		//   **HH:MM – HH:MM · <label>**
		//   _lifecycle stages_
		//   - Read: <articles>
		//   - Asked Claude: <prompts>
		//   - Committed: <commits>
	}

	// ── Claude Code sessions ─────────────────────
	if (claudeSessions.length) {
		lines.push("## \u{1F916} Claude Code / AI Work");
		lines.push("");
		for (const e of claudeSessions) {
			const ts = formatTime(e.time);
			const project = e.project ? `\`${e.project}\`` : "";
			const prompt = escapeForMarkdown(e.prompt.replace(/\n/g, " ").trim());
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
					const displayUrl = cleanUrlForDisplay(v.url).replace(/\)/g, "%29");
					lines.push(`  - [${escapeForLinkText(title)}](${displayUrl})` + (ts ? ` \u2014 ${ts}` : ""));
				}
			}
			lines.push("");
		}
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
				lines.push(`- \`${c.hash.slice(0, 7)}\` ${escapeForMarkdown(c.message)}${stats}` + (ts ? ` \u2014 ${ts}` : ""));
			}
			lines.push("");
		}
	}

	// ── Knowledge Insights (no-AI mode position) ─
	// In no-AI mode, render Knowledge Insights here — after all raw data
	// sections — so readers encounter evidence before synthesized conclusions.
	if (knowledge && !aiSummary) {
		renderKnowledgeInsights(lines, knowledge);
	}

	// ── Learnings ────────────────────────────────
	if (aiSummary?.learnings?.length) {
		lines.push("## \u{1F4DA} Learnings");
		lines.push("");
		for (const item of aiSummary.learnings) {
			lines.push(`- ${escapeForMarkdown(item)}`);
		}
		lines.push("");
	}

	// ── Remember ─────────────────────────────────
	if (aiSummary?.remember?.length) {
		lines.push("## \u{1F5D2}\uFE0F Remember");
		lines.push("");
		for (const item of aiSummary.remember) {
			lines.push(`- ${escapeForMarkdown(item)}`);
		}
		lines.push("");
	}

	// ── Note Seeds ───────────────────────────────
	if (aiSummary?.note_seeds?.length) {
		lines.push("## \u{1F331} Note Seeds");
		lines.push("");
		for (const seed of aiSummary.note_seeds) {
			lines.push(`- [[${escapeForMarkdown(seed)}]]`);
		}
		lines.push("");
	}

	// ── Reflection ───────────────────────────────
	if (prompts.length) {
		lines.push("## \u{1FA9E} Reflection");
		lines.push("");
		for (const p of prompts) {
			lines.push(`### ${escapeForMarkdown(p.question)}`);
			lines.push(`answer_${p.id}:: `);
			lines.push("");
		}
	} else if (aiSummary?.questions?.length) {
		// Fallback: plain questions without structured IDs
		lines.push("## \u{1FA9E} Reflection");
		lines.push("");
		for (const q of aiSummary.questions) {
			const id = slugifyQuestion(q);
			lines.push(`### ${escapeForMarkdown(q)}`);
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
