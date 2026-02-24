import { detectAllBrowsers } from "../src/collect/browser-profiles";
const browsers = await detectAllBrowsers();
process.stdout.write("browsers found: " + browsers.length + "\n");
for (const b of browsers) {
	process.stdout.write(b.browserId + ": " + b.profiles.length + " profiles\n");
	for (const p of b.profiles) {
		process.stdout.write("  " + p.profileDir + " hasHistory=" + p.hasHistory + " path=" + p.historyPath + "\n");
	}
}
