// Directly test sql.js + Chrome history reading
import initSqlJs from "sql.js";
// @ts-ignore
import sqlWasm from "sql.js/dist/sql-wasm.wasm";
import { copyFileSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const historyPath = `${process.env.HOME}/Library/Application Support/Google/Chrome/Default/History`;
const tmp = join(tmpdir(), `test-chrome-${Date.now()}.db`);

try {
	process.stdout.write("Copying DB...\n");
	copyFileSync(historyPath, tmp);
	process.stdout.write("Copied OK\n");

	process.stdout.write("sqlWasm type: " + typeof sqlWasm + "\n");
	process.stdout.write("sqlWasm length: " + (sqlWasm as any)?.length + "\n");

	process.stdout.write("Initializing sql.js...\n");
	const SQL = await initSqlJs({ wasmBinary: sqlWasm });
	process.stdout.write("sql.js initialized OK\n");

	const buf = readFileSync(tmp);
	const db = new SQL.Database(buf);
	process.stdout.write("DB opened OK\n");

	const since = BigInt(Math.floor((new Date(2026, 1, 19).getTime() / 1000 + 11644473600) * 1_000_000));
	const stmt = db.prepare(`SELECT COUNT(*) FROM visits WHERE visit_time > ${since}`);
	stmt.step();
	const row = stmt.get();
	process.stdout.write("Visits since Feb 19: " + row[0] + "\n");
	stmt.free();
	db.close();
} catch (e) {
	process.stdout.write("ERROR: " + (e as Error).message + "\n");
	process.stdout.write((e as Error).stack + "\n");
}
