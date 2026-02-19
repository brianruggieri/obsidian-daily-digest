import { CATEGORY_LABELS } from "./categorize";
import {
	AISummary,
	BrowserVisit,
	CategorizedVisits,
	ClaudeSession,
	SearchQuery,
	ShellCommand,
	slugifyQuestion,
} from "./types";

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
	categorized: CategorizedVisits,
	aiSummary: AISummary | null
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
	const allTags = ["daily", "daily-digest", ...catTags, ...themeTags];
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
	lines.push("---");
	lines.push("");

	// ── Title ────────────────────────────────────
	lines.push(`# \u{1F4C5} ${longDate(date)}`);
	lines.push("");

	// ── AI Headline & TL;DR ─────────────────────
	if (aiSummary) {
		if (aiSummary.headline) {
			lines.push(`> **${aiSummary.headline}**`);
			lines.push("");
		}
		if (aiSummary.tldr) {
			lines.push(aiSummary.tldr);
			lines.push("");
		}
		if (aiSummary.themes?.length) {
			const chips = aiSummary.themes.map((t) => `\`${t}\``).join(" \u00B7 ");
			lines.push(`**Themes:** ${chips}`);
			lines.push("");
		}
		lines.push("---");
		lines.push("");
	}

	// ── Stats ────────────────────────────────────
	lines.push(
		`*${visits.length} visits \u00B7 ${searches.length} searches \u00B7 ` +
			`${shell.length} commands \u00B7 ${claudeSessions.length} Claude prompts \u00B7 ` +
			`${Object.keys(categorized).length} categories*`
	);
	lines.push("");
	lines.push("---");
	lines.push("");

	// ── Notable ──────────────────────────────────
	if (aiSummary?.notable?.length) {
		lines.push("## \u2728 Notable");
		lines.push("");
		for (const item of aiSummary.notable) {
			lines.push(`- ${item}`);
		}
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

	// ── Claude sessions ──────────────────────────
	if (claudeSessions.length) {
		lines.push("## \u{1F916} Claude / AI Work");
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
		const catSums = aiSummary?.category_summaries ?? {};

		for (const [cat, catVisits] of Object.entries(categorized)) {
			const [emoji, label] = CATEGORY_LABELS[cat] ?? ["\u{1F310}", cat];
			lines.push(`### ${emoji} ${label} (${catVisits.length})`);

			const summary = catSums[cat];
			if (summary) {
				lines.push(`> ${summary}`);
				lines.push("");
			}

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
		lines.push("```bash");
		for (const e of shell) {
			const ts = formatTime(e.time) || "     ";
			lines.push(`# ${ts}  ${e.cmd}`);
		}
		lines.push("```");
		lines.push("");
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

	return lines.join("\n");
}
