#!/usr/bin/env bash
# Usage:
#   bash scripts/install-launchd.sh install
#   MATRIX_HOUR=22 bash scripts/install-launchd.sh install
#   bash scripts/install-launchd.sh uninstall

set -e

LABEL="com.brianruggieri.daily-matrix"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
HOUR="${MATRIX_HOUR:-7}"
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG_FILE="$HOME/Library/Logs/daily-matrix.log"
NVM_DIR="${NVM_DIR:-$HOME/.nvm}"

action="${1:-install}"

if [[ "$action" == "uninstall" ]]; then
  launchctl unload "$PLIST" 2>/dev/null || true
  rm -f "$PLIST"
  echo "Uninstalled $LABEL"
  exit 0
fi

if [[ "$action" != "install" ]]; then
  echo "Usage: $0 [install|uninstall]"
  exit 1
fi

mkdir -p "$HOME/Library/LaunchAgents"
mkdir -p "$HOME/Library/Logs"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>-lc</string>
    <string>source ${NVM_DIR}/nvm.sh &amp;&amp; cd ${REPO_DIR} &amp;&amp; nvm use &amp;&amp; npm run matrix</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>${HOUR}</integer>
    <key>Minute</key>
    <integer>0</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>${LOG_FILE}</string>
  <key>StandardErrorPath</key>
  <string>${LOG_FILE}</string>
  <key>RunAtLoad</key>
  <false/>
</dict>
</plist>
EOF

launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"

echo "Installed $LABEL — runs daily at ${HOUR}:00"
echo "Log: $LOG_FILE"
echo "To uninstall: bash scripts/install-launchd.sh uninstall"
