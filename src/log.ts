/**
 * Namespaced logging for Daily Digest.
 *
 * Plugin code should use these functions instead of raw console.* calls.
 * The no-console eslint rule is disabled for this file only (see eslint.config.mjs).
 */

const PREFIX = "Daily Digest";

/** Debug-level logging — useful during development. */
export function debug(...args: unknown[]): void {
	console.debug(`${PREFIX}:`, ...args);
}

/** Warning-level logging — non-fatal issues worth investigating. */
export function warn(...args: unknown[]): void {
	console.warn(`${PREFIX}:`, ...args);
}

/** Error-level logging — unexpected failures. */
export function error(...args: unknown[]): void {
	console.error(`${PREFIX}:`, ...args);
}
