#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
repo_root=$(cd -- "$script_dir/.." && pwd)
cd "$repo_root"

if [[ "$(go env GOOS)" != "linux" ]]; then
	echo "Linux builds must run on Linux because Wails uses native GTK/WebKitGTK and CGO." >&2
	exit 1
fi

if ! command -v pkg-config >/dev/null 2>&1; then
	echo "pkg-config is required. On Ubuntu, install: sudo apt-get install build-essential pkg-config libgtk-3-dev libwebkit2gtk-4.1-dev" >&2
	exit 1
fi

if [[ -f frontend/package-lock.json ]]; then
	npm --prefix frontend ci
else
	npm --prefix frontend install
fi

npm --prefix frontend run build

if [[ ! -f frontend/dist/index.html ]]; then
	echo "frontend/dist/index.html not found; frontend build did not produce embeddable assets" >&2
	exit 1
fi

goarch=${GOARCH:-$(go env GOARCH)}
mkdir -p dist
CGO_ENABLED=${CGO_ENABLED:-1} GOOS=linux GOARCH="$goarch" go build -buildvcs=false -o "dist/work-light-linux-$goarch" .

echo "Linux executable: $repo_root/dist/work-light-linux-$goarch"
