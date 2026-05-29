#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
repo_root=$(cd -- "$script_dir/.." && pwd)
work_light_dir=${1:-$repo_root}
forwarder="$work_light_dir/scripts/codex-hook-forward.sh"

events=(
	"SessionStart"
	"UserPromptSubmit"
	"PreToolUse"
	"PostToolUse"
	"PermissionRequest"
	"SubagentStart"
	"SubagentStop"
	"Stop"
)

for event in "${events[@]}"; do
	cat <<TOML
[[hooks.$event]]
[[hooks.$event.hooks]]
type = "command"
command = "$forwarder"
timeout = 2

TOML
done
