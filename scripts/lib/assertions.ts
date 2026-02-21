export interface AssertionResult {
	passed: boolean;
	failures: string[];
}

const REQUIRED_FRONTMATTER = ["date", "tags", "focus_score"];
const PLACEHOLDER_STRINGS = ["[object Object]", "undefined", "NaN"];
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

	for (const placeholder of PLACEHOLDER_STRINGS) {
		if (md.includes(placeholder)) {
			failures.push(`Contains placeholder string: "${placeholder}"`);
		}
	}

	return { passed: failures.length === 0, failures };
}

export function runQualityAssertions(
	md: string,
	options: { aiEnabled: boolean }
): AssertionResult {
	const failures: string[] = [];

	const fsMatch = md.match(/focus_score:\s*([\d.]+)/);
	if (fsMatch) {
		const score = parseFloat(fsMatch[1]);
		if (isNaN(score) || score < 0 || score > 1) {
			failures.push(`focus_score out of range [0,1]: ${fsMatch[1]}`);
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
