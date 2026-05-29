#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
repo_root=$(cd -- "$script_dir/.." && pwd)
cd "$repo_root"

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

mkdir -p dist
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -buildvcs=false -ldflags "-H=windowsgui" -o dist/work-light.exe .

echo "Windows executable: $repo_root/dist/work-light.exe"

