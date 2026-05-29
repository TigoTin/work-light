param(
    [string]$WorkLightDir = ""
)

$ErrorActionPreference = "Stop"

$ScriptDir = (Resolve-Path -LiteralPath (Split-Path -Parent $MyInvocation.MyCommand.Path)).ProviderPath
if (-not $WorkLightDir) {
    $WorkLightDir = (Resolve-Path (Join-Path $ScriptDir "..")).ProviderPath
}

$Forwarder = Join-Path $WorkLightDir "scripts\codex-hook-forward.ps1"
$Command = "powershell -NoProfile -ExecutionPolicy Bypass -File `"$Forwarder`""
$TomlCommand = $Command.Replace("\", "\\").Replace('"', '\"')
$Events = @(
    "SessionStart",
    "UserPromptSubmit",
    "PreToolUse",
    "PostToolUse",
    "PermissionRequest",
    "SubagentStart",
    "SubagentStop",
    "Stop"
)

foreach ($EventName in $Events) {
@"
[[hooks.$EventName]]
[[hooks.$EventName.hooks]]
type = "command"
command = "$TomlCommand"
timeout = 2

"@
}
