$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$uri = 'http://127.0.0.1:17373/codex/hook'

try {
    $payload = [Console]::In.ReadToEnd()
    if ([string]::IsNullOrWhiteSpace($payload)) {
        $payload = '{}'
    }

    Invoke-RestMethod `
        -Uri $uri `
        -Method Post `
        -ContentType 'application/json' `
        -Body $payload `
        -TimeoutSec 2 | Out-Null
} catch {
    # Codex hooks should not fail just because Work Light is not running.
}

exit 0
