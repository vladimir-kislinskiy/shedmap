#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TOOLS_DIR="$ROOT/.tools"
FB_CLI_DIR="$TOOLS_DIR/firebase-cli"
ARCH="$(uname -m | sed 's/x86_64/x64/')"
NODE_DIR="$TOOLS_DIR/node-v20.18.0-darwin-$ARCH"
NODE_BIN="$NODE_DIR/bin/node"
NPM_BIN="$NODE_DIR/bin/npm"
FB_BIN="$FB_CLI_DIR/node_modules/.bin/firebase"
ARCHIVE="node-v20.18.0-darwin-$ARCH.tar.gz"
NODE_URL="https://nodejs.org/dist/v20.18.0/$ARCHIVE"

mkdir -p "$TOOLS_DIR"

if [ ! -x "$NODE_BIN" ]; then
	echo "Downloading Node.js 20 (firebase-tools needs Node >= 18)..."
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
	echo ""
	echo "Firebase login required (one time)."
	echo "A browser window will open — sign in with your Google account for HayShed."
	echo ""
	"$FB_BIN" login
fi

"$FB_BIN" use hayshed-f65b3
"$FB_BIN" deploy --only database

echo ""
echo "Database rules deployed."
