# Contributing

Thanks for contributing to Work Light.

## Development Environment

Work Light is a Wails 3 desktop app with a Go backend and a React + TypeScript frontend.

You need:

- Go
- Node.js and npm
- Bash for the build scripts
- Windows, macOS, or Linux to run the desktop window
- Linux GTK/WebKitGTK development packages when building on Linux

Install frontend dependencies before running frontend commands:

```sh
npm --prefix frontend install
```

## Test Commands

Run frontend tests:

```sh
npm --prefix frontend test
```

Run Go package tests with a local build cache:

```sh
GOCACHE=/tmp/work-light-go-build go test -buildvcs=false ./frontend ./internal/...
```

Run the root package test for the Windows build target:

```sh
GOCACHE=/tmp/work-light-go-build GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go test -buildvcs=false .
```

## Build Commands

Build the frontend:

```sh
npm --prefix frontend run build
```

Build platform executables:

```sh
bash scripts/build-windows.sh
bash scripts/build-macos.sh
bash scripts/build-linux.sh
```

macOS and Linux builds must run on their native OS because Wails uses native
WebView libraries through CGO. GitHub Actions builds all supported platforms on
native runners.

## Pull Requests

Please keep pull requests focused and include:

- A short description of the user-visible change.
- The test and build commands you ran.
- Screenshots or recordings for visible UI changes.
- Notes for any known limitations or follow-up work.

Avoid unrelated formatting, refactors, or dependency churn in the same pull request.

## Codex Hook Configuration

Codex hook examples should use generic paths such as `/path/to/work-light`,
`${WORK_LIGHT_DIR}`, or `C:\\path\\to\\work-light`.

Do not commit personal hook configuration, machine-specific absolute paths, user
names, session identifiers, or local workspace paths. Hook payloads can include
metadata such as `cwd` and session information, so keep examples sanitized.
