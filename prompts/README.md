# Daily Digest Prompt Templates

These files are loaded at runtime by `src/prompt-templates.ts`.
Edit them to customize the AI instructions without rebuilding the plugin.

## Variables

Each template uses `{{variable}}` placeholders. Unknown variables are left as-is.

| Template | Key variables |
|---|---|
| standard.txt | dateStr, contextHint, browserActivity, searches, claudePrompts, gitCommits |
| compressed.txt | dateStr, contextHint, totalEvents, browserActivity, searches, claudePrompts, gitCommits |
| rag.txt | dateStr, contextHint, chunkTexts |
| classified.txt | dateStr, contextHint, totalProcessed, llmClassified, ruleClassified, allTopics, allEntities, activitySections |
| deidentified.txt | dateStr, contextHint, activityDist, temporalShape, topTopics, entityClusters, topicConnections, recurrenceLines, focusScore, knowledgeDeltaLines, peakHours |

## Override location

Set `promptsDir` in plugin settings (or `--prompts-dir` CLI flag) to a directory
containing `.txt` files. Missing files fall back to built-in defaults.
