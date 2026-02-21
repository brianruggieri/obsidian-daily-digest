/**
 * Stub for sql.js in test environment.
 * The git collector tests don't exercise SQLite — they only need collectors.ts
 * to import without throwing. Any test that actually calls querySqlite will
 * get an empty result set (the try/catch in querySqlite handles init failure).
 */
export default function initSqlJs() {
	throw new Error("sql.js is not available in the test environment");
}
