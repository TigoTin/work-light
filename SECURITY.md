# Security Policy

## Security Model

Work Light is designed as a local desktop status indicator for Codex hook events.
The hook receiver listens only on:

```text
127.0.0.1:17373
```

Do not expose this endpoint to the public internet or bind it to a public network
interface. Codex hook payloads can include local metadata such as `cwd`, session
identifiers, hook event names, and permission mode details. Treat those payloads
as local development data.

Forwarding scripts should post only to the local Work Light endpoint. If you
customize hook configuration, avoid storing personal absolute paths or private
workspace names in committed files.

## Reporting Vulnerabilities

Please use GitHub private vulnerability reporting if it is available for this
repository. If private reporting is not available, open a GitHub issue with a
placeholder summary and avoid posting exploit details, private paths, tokens, or
other sensitive data publicly.
