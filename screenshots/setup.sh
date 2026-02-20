#!/usr/bin/env bash
#
# Set up the screenshot test vault template.
#
# Run from the project root:
#   npm run screenshots:setup
#
# This creates a minimal Obsidian vault in screenshots/vault/ that
# wdio-obsidian-service copies into a sandbox at test time.
#
# Plugin loading is handled by the service (plugins: ["."] in wdio.conf.ts),
# so we only need the vault structure and example notes here.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VAULT="$ROOT/screenshots/vault"

echo "Setting up screenshot test vault at $VAULT"

# ── Create directories ─────────────────────────────────────
mkdir -p "$VAULT/daily" "$VAULT/.obsidian"

# ── Symlink example notes ──────────────────────────────────
ln -sf "$ROOT/examples/2025-06-18.md"       "$VAULT/daily/2025-06-18.md"
ln -sf "$ROOT/examples/2025-06-19.md"       "$VAULT/daily/2025-06-19.md"
ln -sf "$ROOT/examples/2025-06-20-no-ai.md" "$VAULT/daily/2025-06-20.md"

# ── Obsidian vault configuration ───────────────────────────
# Enable the daily-digest community plugin
cat > "$VAULT/.obsidian/community-plugins.json" << 'EOF'
["daily-digest"]
EOF

# Minimal appearance config — default theme, readable font size
cat > "$VAULT/.obsidian/appearance.json" << 'EOF'
{
  "accentColor": "",
  "translucency": false,
  "baseFontSize": 16,
  "cssTheme": ""
}
EOF

# App config — enable community plugins, disable safe mode
cat > "$VAULT/.obsidian/app.json" << 'EOF'
{
  "promptDelete": false,
  "alwaysUpdateLinks": true,
  "newFileLocation": "folder",
  "newFileFolderPath": "daily"
}
EOF

# Core plugins — disable ones that add noise to screenshots
cat > "$VAULT/.obsidian/core-plugins.json" << 'EOF'
[
  "file-explorer",
  "search",
  "markdown-importer",
  "page-preview"
]
EOF

echo "Done. Run 'npm run build' then 'npm run screenshots' to capture."
