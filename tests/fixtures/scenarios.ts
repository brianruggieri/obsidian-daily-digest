/**
 * Pre-built test scenarios — composable wrappers around personas
 * for specific test needs.
 */

import {
	BrowserVisit,
	SearchQuery,
	ClaudeSession,
	SanitizeConfig,
	SensitivityConfig,
	PatternConfig,
	ClassificationConfig,
} from "../../src/types";
import { PersonaOutput } from "./personas";

// ── Privacy Test Scenario ───────────────────────────────

export interface PrivacyTestScenario {
	dirtyVisits: BrowserVisit[];
	dirtySearches: SearchQuery[];
	dirtyClaude: ClaudeSession[];
	expectedRedactions: string[];
}

const BASE_DATE = new Date("2025-06-15T10:00:00");

/** Create data with embedded secrets for testing sanitization. */
export function createPrivacyTestScenario(): PrivacyTestScenario {
	return {
		dirtyVisits: [
			{
				url: "https://github.com/myorg/repo?access_token=ghp_abc123def456ghi789jkl012mno345pqr678&state=random123",
				title: "Pull Request #42",
				time: BASE_DATE,
				domain: "github.com",
			},
			{
				url: "https://app.example.com/callback?code=auth_code_secret&redirect_uri=http://localhost:3000",
				title: "OAuth Callback",
				time: BASE_DATE,
				domain: "app.example.com",
			},
			{
				url: "https://user:password123@internal.example.com/admin",
				title: "Admin Panel",
				time: BASE_DATE,
				domain: "internal.example.com",
			},
			{
				url: "https://example.com/page#access_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature",
				title: "Token Page",
				time: BASE_DATE,
				domain: "example.com",
			},
		],
		dirtySearches: [
			{
				query: "my password is hunter2 how to change it",
				time: BASE_DATE,
				engine: "google.com",
			},
			{
				query: "john.doe@company.com email settings",
				time: BASE_DATE,
				engine: "google.com",
			},
		],
		dirtyClaude: [
			{
				prompt: "Here's my AWS key AKIAIOSFODNN7EXAMPLE and secret. Fix the S3 upload function.",
				time: BASE_DATE,
				project: "aws-project",
			},
			{
				prompt: "The file at /Users/testuser/Documents/tax-returns/2024.pdf needs processing. Also email me at testuser@personal-email.com",
				time: BASE_DATE,
				project: "personal",
			},
		],
		expectedRedactions: [
			"ghp_", "sk-ant-", "sk-1234", "AKIA", "npm_", "sk_test_",
			"Bearer eyJ", "supersecret", "password123", "auth_code_secret",
			"/Users/testuser", "testuser@personal-email.com",
		],
	};
}

// ── Default Configs ─────────────────────────────────────

export function defaultSanitizeConfig(): SanitizeConfig {
	return {
		enabled: true,
		level: "standard",
		excludedDomains: [],
		redactPaths: true,
		scrubEmails: true,
	};
}

export function defaultSensitivityConfig(): SensitivityConfig {
	return {
		enabled: false,
		categories: [],
		customDomains: [],
		action: "exclude",
	};
}

export function defaultPatternConfig(): PatternConfig {
	return {
		enabled: true,
		cooccurrenceWindow: 30,
		minClusterSize: 3,
		trackRecurrence: true,
	};
}

export function defaultClassificationConfig(): ClassificationConfig {
	return {
		enabled: true,
		endpoint: "http://localhost:11434",
		model: "test-model",
		batchSize: 8,
	};
}

// ── Edge Case Scenarios ─────────────────────────────────

export function createEmptyScenario(): PersonaOutput {
	return {
		name: "Empty Day",
		description: "No activity at all",
		visits: [],
		searches: [],
		claude: [],
		git: [],
		expectedThemes: [],
		expectedActivityTypes: [],
		expectedFocusRange: [0, 0],
		narrative: "An empty day with no recorded activity.",
	};
}

export function createSingleEventScenario(): PersonaOutput {
	return {
		name: "Single Event",
		description: "Just one browser visit",
		visits: [{
			url: "https://github.com/myorg/repo",
			title: "My Repository - GitHub",
			time: BASE_DATE,
			visitCount: 1,
			domain: "github.com",
		}],
		searches: [],
		claude: [],
		git: [],
		expectedThemes: ["development"],
		expectedActivityTypes: ["implementation"],
		expectedFocusRange: [0.8, 1.0],
		narrative: "A day with just a single GitHub visit.",
	};
}

export function createMalformedDataScenario(): PersonaOutput {
	return {
		name: "Malformed Data",
		description: "Data with invalid URLs, null times, empty strings",
		visits: [
			{ url: "not-a-url", title: "", time: null, domain: "" },
			{ url: "https://", title: "Empty URL", time: null, domain: "" },
			{ url: "ftp://files.example.com/doc.pdf", title: "FTP Link", time: BASE_DATE, domain: "files.example.com" },
			{ url: "https://github.com/valid", title: "Valid Repo", time: BASE_DATE, domain: "github.com" },
		],
		searches: [
			{ query: "", time: null, engine: "" },
			{ query: "valid search query", time: BASE_DATE, engine: "google.com" },
		],
		claude: [
			{ prompt: "help", time: BASE_DATE, project: "" },
		],
		git: [],
		expectedThemes: [],
		expectedActivityTypes: ["implementation"],
		expectedFocusRange: [0, 1],
		narrative: "A scenario with malformed and edge-case data to test robustness.",
	};
}
