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
version=${GITHUB_REF_NAME:-dev}
version=${version#v}
commit=$(git rev-parse --short=12 HEAD 2>/dev/null || echo unknown)
date=$(date -u +%Y-%m-%dT%H:%M:%SZ)
ldflags="-H=windowsgui -X main.version=$version -X main.commit=$commit -X main.date=$date"
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -buildvcs=false -ldflags "$ldflags" -o dist/work-light.exe .

echo "Windows executable: $repo_root/dist/work-light.exe"
