param(
    [string]$Executable = "",
    [string]$FramesDir = "",
    [int]$FrameCount = 8,
    [int]$FrameDelayMs = 120
)

$ErrorActionPreference = "Stop"

$ScriptDir = (Resolve-Path -LiteralPath (Split-Path -Parent $MyInvocation.MyCommand.Path)).ProviderPath
$RepoRoot = (Resolve-Path (Join-Path $ScriptDir "..")).ProviderPath
if (-not $Executable) {
    $Executable = Join-Path $RepoRoot "dist\work-light.exe"
}
if (-not $FramesDir) {
    $FramesDir = Join-Path $RepoRoot ".tmp\readme-frames"
}
if (-not (Test-Path $Executable)) {
    throw "Executable not found: $Executable. Run scripts/build-windows.sh first."
}

$RuntimeDir = Join-Path ([System.IO.Path]::GetTempPath()) ("work-light-runtime-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null
$RuntimeExecutable = Join-Path $RuntimeDir "work-light.exe"
Copy-Item -Force $Executable $RuntimeExecutable

$FrameRoot = $FramesDir
if (Test-Path $FrameRoot) {
    Remove-Item -Recurse -Force $FrameRoot
}
New-Item -ItemType Directory -Force -Path $FrameRoot | Out-Null

Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WorkLightCapture {
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
    [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdcBlt, uint nFlags);
    [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr hWnd);
    public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
}
"@

function Stop-WorkLight {
    Get-Process work-light -ErrorAction SilentlyContinue | Stop-Process -Force
    Start-Sleep -Milliseconds 300
}

function Start-WorkLight {
    $process = Start-Process -FilePath $RuntimeExecutable -WorkingDirectory $RuntimeDir -PassThru
    $deadline = (Get-Date).AddSeconds(8)
    do {
        Start-Sleep -Milliseconds 200
        $process.Refresh()
    } while ($process.MainWindowHandle -eq 0 -and (Get-Date) -lt $deadline)
    if ($process.MainWindowHandle -eq 0) {
        throw "Work Light window did not appear."
    }
    return $process
}

function Send-Hook($eventName, $sessionId, $cwd, $errorPayload = $null) {
    $payload = @{
        hook_event_name = $eventName
        session_id = $sessionId
        cwd = $cwd
        permission_mode = "on-request"
    }
    if ($null -ne $errorPayload) {
        $payload.error = $errorPayload
    }
    $json = $payload | ConvertTo-Json -Compress
    Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:17373/codex/hook" -ContentType "application/json" -Body $json | Out-Null
}

function Capture-Window($handle, $path) {
    $rect = New-Object WorkLightCapture+RECT
    [void][WorkLightCapture]::GetWindowRect($handle, [ref]$rect)
    $dpi = [WorkLightCapture]::GetDpiForWindow($handle)
    $scale = [double]$dpi / 96.0
    $width = [int](($rect.Right - $rect.Left) * $scale)
    $height = [int](($rect.Bottom - $rect.Top) * $scale)

    $bitmap = New-Object System.Drawing.Bitmap $width, $height
    $bitmap.SetResolution($dpi, $dpi)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $hdc = $graphics.GetHdc()
    try {
        [void][WorkLightCapture]::PrintWindow($handle, $hdc, 2)
    } finally {
        $graphics.ReleaseHdc($hdc)
        $graphics.Dispose()
    }
    $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $bitmap.Dispose()
}

function Capture-State($name, [scriptblock]$setup) {
    Stop-WorkLight
    $process = Start-WorkLight
    try {
        Start-Sleep -Milliseconds 600
        & $setup
        Start-Sleep -Milliseconds 250

        $stateDir = Join-Path $FrameRoot $name
        New-Item -ItemType Directory -Force -Path $stateDir | Out-Null
        for ($index = 0; $index -lt $FrameCount; $index++) {
            $path = Join-Path $stateDir ("frame-{0:D2}.png" -f $index)
            Capture-Window $process.MainWindowHandle $path
            Start-Sleep -Milliseconds $FrameDelayMs
        }
    } finally {
        Stop-WorkLight
    }
}

Capture-State "idle" { Send-Hook "SessionStart" "readme-idle" "/home/user/projects/work-light" }
Capture-State "working" { Send-Hook "PreToolUse" "readme-working" "/home/user/projects/work-light" }
Capture-State "waiting" { Send-Hook "PermissionRequest" "readme-waiting" "/home/user/projects/work-light" }
Capture-State "error" { Send-Hook "Error" "readme-error" "/home/user/projects/work-light" @{ message = "example" } }
Capture-State "multisession" {
    Send-Hook "PermissionRequest" "readme-other" "/home/user/projects/other-project"
    Start-Sleep -Milliseconds 120
    Send-Hook "SessionStart" "readme-main" "/home/user/projects/work-light"
}

Remove-Item -Recurse -Force $RuntimeDir
Write-Output "Captured frames: $FrameRoot"
Write-Output "Encode from the repository root with: go run scripts/encode-readme-gifs.go .tmp/readme-frames docs/assets/screenshots"
