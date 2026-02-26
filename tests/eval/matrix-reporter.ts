/**
 * Matrix Reporter - Generate JSON, Markdown, HTML outputs
 *
 * Produces multi-format reports from matrix validation runs for different audiences:
 * - JSON: Machine-parseable raw data
 * - Markdown: Human-readable technical summary
 * - HTML: Visual dashboard for web viewing
 */

export interface MatrixReportResult {
	provider: "mock" | "local" | "anthropic";
	persona: string;
	passed: boolean;
	privacy: { leaks: number; compliant: boolean };
	quality: number; // 0-1
	cost: number; // USD
}

export interface MatrixReport {
	generated: string; // ISO timestamp
	phase: 1 | 2;
	tier: string;
	results: MatrixReportResult[];
}

/**
 * MatrixReporter - Generates reports in multiple formats
 */
export class MatrixReporter {
	/**
	 * Generate JSON report (machine-parseable)
	 */
	generateJSON(report: MatrixReport): string {
		return JSON.stringify(report, null, 2);
	}

	/**
	 * Generate Markdown report (human-readable)
	 */
	generateMarkdown(report: MatrixReport): string {
		const lines: string[] = [];

		lines.push(`# Matrix Validation Report - ${report.tier}\n`);
		lines.push(`Generated: ${report.generated}\n`);
		lines.push(`Phase: ${report.phase}\n`);

		lines.push("## Results Summary\n");
		lines.push("| Provider | Persona | Privacy ✓/✗ | Quality | Cost | Status |");
		lines.push("|----------|---------|------------|---------|------|--------|");

		for (const result of report.results) {
			const privacyIcon = result.privacy.compliant ? "✓" : "✗";
			const quality = (result.quality * 100).toFixed(0);
			const cost = result.cost > 0 ? `$${result.cost.toFixed(4)}` : "$0.00";
			const status = result.passed ? "✅" : "❌";

			lines.push(
				`| ${result.provider} | ${result.persona.substring(0, 20)} | ${privacyIcon} | ${quality}% | ${cost} | ${status} |`
			);
		}

		return lines.join("\n");
	}

	/**
	 * Generate HTML report (visual dashboard)
	 */
	generateHTML(report: MatrixReport): string {
		const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Matrix Validation Report</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      background: white;
      border-radius: 8px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 40px;
      text-align: center;
    }
    .header h1 { font-size: 2.5em; margin-bottom: 10px; }
    .meta {
      display: flex;
      justify-content: center;
      gap: 30px;
      margin-top: 20px;
      font-size: 1.1em;
      opacity: 0.95;
    }
    .content { padding: 40px; }
    .results { margin-top: 30px; }
    table {
      width: 100%;
      border-collapse: collapse;
      background: white;
      margin-top: 20px;
    }
    th {
      background: #f8f9fa;
      padding: 12px;
      text-align: left;
      font-weight: 600;
      border-bottom: 2px solid #dee2e6;
      color: #333;
    }
    td {
      padding: 12px;
      border-bottom: 1px solid #dee2e6;
    }
    tr:hover { background: #f8f9fa; }
    .pass { color: #28a745; font-weight: 600; }
    .fail { color: #dc3545; font-weight: 600; }
    .status-pass { background: #d4edda; padding: 4px 8px; border-radius: 4px; color: #155724; }
    .status-fail { background: #f8d7da; padding: 4px 8px; border-radius: 4px; color: #721c24; }
    .footer {
      text-align: center;
      padding: 20px;
      color: #999;
      font-size: 0.9em;
      border-top: 1px solid #dee2e6;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Matrix Validation Report</h1>
      <div class="meta">
        <div><strong>Tier:</strong> ${report.tier}</div>
        <div><strong>Phase:</strong> ${report.phase}</div>
        <div><strong>Generated:</strong> ${report.generated}</div>
      </div>
    </div>
    <div class="content">
      <div class="results">
        <h2>Results Summary</h2>
        <table>
          <thead>
            <tr>
              <th>Provider</th>
              <th>Persona</th>
              <th>Privacy</th>
              <th>Quality</th>
              <th>Cost</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${report.results
	.map((r) => {
		const privacyIcon = r.privacy.compliant ? "✓" : "✗";
		const privacyClass = r.privacy.compliant ? "pass" : "fail";
		const quality = (r.quality * 100).toFixed(0);
		const cost = r.cost > 0 ? `$${r.cost.toFixed(4)}` : "$0.00";
		const statusClass = r.passed ? "status-pass" : "status-fail";
		const statusText = r.passed ? "✅ Pass" : "❌ Fail";

		return `
            <tr>
              <td><strong>${r.provider}</strong></td>
              <td>${r.persona}</td>
              <td class="${privacyClass}">${privacyIcon}</td>
              <td>${quality}%</td>
              <td>${cost}</td>
              <td><span class="${statusClass}">${statusText}</span></td>
            </tr>
          `;
	})
	.join("\n")}
          </tbody>
        </table>
      </div>
    </div>
    <div class="footer">
      Matrix Validation Report • Daily Digest Plugin • <a href="https://github.com/brianruggieri/obsidian-daily-digest">Source</a>
    </div>
  </div>
</body>
</html>
    `;
		return html;
	}
}
