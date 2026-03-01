// ── UT1 category → plugin category mapping ──────────────────
//
// Maps UT1 Blacklist directory names to this plugin's category keys
// (defined in src/filter/categorize.ts CATEGORY_RULES).
//
// Each entry also carries:
//   - cap: max domains to import from this UT1 category
//   - trancoLimit: popularity threshold (domains must rank ≤ this in Tranco)

export interface CategoryMapping {
	ut1Category: string;
	pluginCategory: string;
	cap: number;
	trancoLimit: number;
}

export const CATEGORY_MAP: CategoryMapping[] = [
	{ ut1Category: "press", pluginCategory: "news", cap: 500, trancoLimit: 50_000 },
	{ ut1Category: "bank", pluginCategory: "finance", cap: 300, trancoLimit: 50_000 },
	{ ut1Category: "financial", pluginCategory: "finance", cap: 200, trancoLimit: 50_000 },
	{ ut1Category: "social_networks", pluginCategory: "social", cap: 200, trancoLimit: 50_000 },
	{ ut1Category: "audio-video", pluginCategory: "media", cap: 300, trancoLimit: 50_000 },
	{ ut1Category: "shopping", pluginCategory: "shopping", cap: 200, trancoLimit: 30_000 },
	{ ut1Category: "games", pluginCategory: "gaming", cap: 200, trancoLimit: 30_000 },
	{ ut1Category: "blog", pluginCategory: "research", cap: 150, trancoLimit: 50_000 },
	{ ut1Category: "cooking", pluginCategory: "personal", cap: 37, trancoLimit: 50_000 },
	{ ut1Category: "sports", pluginCategory: "media", cap: 200, trancoLimit: 50_000 },
	{ ut1Category: "jobsearch", pluginCategory: "work", cap: 150, trancoLimit: 50_000 },
	{ ut1Category: "ai", pluginCategory: "ai_tools", cap: 71, trancoLimit: 50_000 },
	{ ut1Category: "forums", pluginCategory: "social", cap: 100, trancoLimit: 50_000 },
];

/** UT1 categories we intentionally skip (ambiguous mapping or low value). */
export const SKIPPED_CATEGORIES = ["dating", "webmail", "educational_games"];

/** Get all unique plugin categories that receive ETL imports. */
export function getTargetPluginCategories(): string[] {
	return [...new Set(CATEGORY_MAP.map((m) => m.pluginCategory))];
}

/** Look up all UT1 mappings that feed into a given plugin category. */
export function getMappingsForPlugin(pluginCategory: string): CategoryMapping[] {
	return CATEGORY_MAP.filter((m) => m.pluginCategory === pluginCategory);
}
