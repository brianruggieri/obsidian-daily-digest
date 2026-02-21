export interface AssertionResult {
	passed: boolean;
	failures: string[];
}

const REQUIRED_FRONTMATTER = ["date", "tags", "focus_score"];
// Patterns that indicate template rendering artifacts (not content that happens to contain these words)
const PLACEHOLDER_PATTERNS: RegExp[] = [
	/\[object Object\]/,
	// "undefined" as a bare value (not embedded in longer phrases like "Cannot read properties of undefined")
	/(?:^|:\s*)undefined(?:\s*$|\n)/m,
	/(?:^|\s)NaN(?:\s|$)/m,
];
const MIN_FILE_SIZE = 300;

export function runStructuralAssertions(md: string): AssertionResult {
	const failures: string[] = [];

	if (md.length < MIN_FILE_SIZE) {
		failures.push(`File too short: ${md.length} bytes (minimum ${MIN_FILE_SIZE})`);
	}

	const fmMatch = md.match(/^---\n([\s\S]*?)\n---/);
	if (!fmMatch) {
		failures.push("No frontmatter found");
	} else {
		for (const field of REQUIRED_FRONTMATTER) {
			if (!fmMatch[1].includes(`${field}:`)) {
				failures.push(`Frontmatter missing required field: ${field}`);
			}
		}
	}

	for (const pattern of PLACEHOLDER_PATTERNS) {
		const match = md.match(pattern);
		if (match) {
			failures.push(`Contains rendering artifact matching ${pattern}: "${match[0].trim()}"`);
		}
	}

	return { passed: failures.length === 0, failures };
}

export function runQualityAssertions(
	md: string,
	options: { aiEnabled: boolean }
): AssertionResult {
	const failures: string[] = [];

	const fsMatch = md.match(/focus_score:\s*(\d+)%/);
	if (fsMatch) {
		const score = parseInt(fsMatch[1], 10);
		if (isNaN(score) || score < 0 || score > 100) {
			failures.push(`focus_score out of range [0,100]: ${fsMatch[1]}%`);
		}
	}

	if (options.aiEnabled) {
		const hasHeadline = /## AI Summary/.test(md) || /^> .+/m.test(md);
		if (!hasHeadline) {
			failures.push("AI enabled but no headline or summary block found");
		}
	}

	return { passed: failures.length === 0, failures };
}
