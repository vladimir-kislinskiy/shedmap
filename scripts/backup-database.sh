#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"
OUTPUT_DIR="${1:-$ROOT_DIR/backups}"

if [[ -f "$ENV_FILE" ]]; then
	set -a
	# shellcheck disable=SC1090
	source <(grep -E '^[A-Z_]+=' "$ENV_FILE" | sed 's/^/export /')
	set +a
fi

if [[ -z "${FIREBASE_DATABASE_URL:-}" ]]; then
	echo "FIREBASE_DATABASE_URL is not set. Add it to .env or export it in the shell." >&2
	exit 1
fi

mkdir -p "$OUTPUT_DIR"

BASE_URL="${FIREBASE_DATABASE_URL%/}"
STAMP="$(date -u +%Y-%m-%dT%H%M%SZ)"
OUT_FILE="$OUTPUT_DIR/hayShedState-$STAMP.json"

echo "Downloading hayShedState from $BASE_URL ..."
curl -fsSL "$BASE_URL/hayShedState.json" -o "$OUT_FILE"

if command -v jq >/dev/null 2>&1; then
	jq empty "$OUT_FILE"
	echo "Backup saved and validated: $OUT_FILE"
else
	echo "Backup saved: $OUT_FILE (install jq to validate JSON automatically)"
fi
