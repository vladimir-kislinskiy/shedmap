#!/usr/bin/env bash
# Upload userProfiles to RTDB (one-time / when adding people).
# Profiles are NOT shipped in client JS — each signed-in user can only read their own row.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROFILES="$ROOT/data/user-profiles.json"
TOOLS_DIR="$ROOT/.tools"
FB_CLI_DIR="$TOOLS_DIR/firebase-cli"
ARCH="$(uname -m | sed 's/x86_64/x64/')"
NODE_DIR="$TOOLS_DIR/node-v20.18.0-darwin-$ARCH"
NODE_BIN="$NODE_DIR/bin/node"
NPM_BIN="$NODE_DIR/bin/npm"
FB_BIN="$FB_CLI_DIR/node_modules/.bin/firebase"
ARCHIVE="node-v20.18.0-darwin-$ARCH.tar.gz"
NODE_URL="https://nodejs.org/dist/v20.18.0/$ARCHIVE"

if [ ! -f "$PROFILES" ]; then
	echo "Missing $PROFILES"
	exit 1
fi

mkdir -p "$TOOLS_DIR"

if [ ! -x "$NODE_BIN" ]; then
	echo "Downloading Node.js 20..."
	curl -fsSL -o "$TOOLS_DIR/$ARCHIVE" "$NODE_URL"
	tar -xzf "$TOOLS_DIR/$ARCHIVE" -C "$TOOLS_DIR"
fi

if [ ! -x "$FB_BIN" ]; then
	echo "Installing firebase-tools..."
	mkdir -p "$FB_CLI_DIR"
	cd "$FB_CLI_DIR"
	"$NODE_BIN" "$NPM_BIN" init -y >/dev/null 2>&1 || true
	"$NODE_BIN" "$NPM_BIN" install firebase-tools@11.30.0
fi

cd "$ROOT"

if ! "$FB_BIN" projects:list >/dev/null 2>&1; then
	"$FB_BIN" login
fi

"$FB_BIN" use hayshed-f65b3
# Force overwrite of /userProfiles tree
"$FB_BIN" database:set /userProfiles "$PROFILES" --confirm

echo ""
echo "userProfiles seeded from data/user-profiles.json"
