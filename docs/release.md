# Release Packaging

This document describes the release asset targets and the steps that require maintainer-owned credentials.

## Asset Matrix

| Platform | Primary assets | Notes |
| --- | --- | --- |
| Windows | `work-light-windows-amd64.zip`, `work-light-windows-amd64-setup.exe` or `work-light-windows-amd64-installer-entry.txt` | The installer is generated with NSIS when `makensis` is available. Signing requires a certificate and is not implied by the script. |
| macOS | `work-light-macos-<arch>.app.zip`, `work-light-macos-<arch>.dmg` or `work-light-macos-<arch>-dmg-entry.txt` | The dmg is generated with `hdiutil` on macOS. Signing and notarization require Apple credentials. |
| Linux | `work-light-linux-amd64.deb`, `work-light-linux-x86_64.AppImage` or `work-light-linux-x86_64-appimage-entry.txt` | AppImage generation uses `appimagetool`. CI may fetch it when `WORK_LIGHT_FETCH_APPIMAGETOOL=1`. |
| Checksums | `checksums.txt` | Generated from all release assets. |

The `*-entry.txt` files are explicit placeholders for packaging paths that require a missing local tool or credentialed step. They are not installers and should not be described as signed or published packages.

## Local Packaging

Build the target binary first:

```sh
bash scripts/build-windows.sh
bash scripts/build-macos.sh
bash scripts/build-linux.sh
```

Then package the matching platform output:

```sh
bash scripts/package-release-asset.sh windows work-light.exe release v0.1.0 amd64
bash scripts/package-release-asset.sh macos 'work-light-darwin-*' release v0.1.0 "$(go env GOARCH)"
WORK_LIGHT_FETCH_APPIMAGETOOL=1 bash scripts/package-release-asset.sh linux 'work-light-linux-*' release v0.1.0 amd64
```

Validate package contents:

```sh
bash scripts/validate-release-asset.sh windows release amd64
bash scripts/validate-release-asset.sh macos release "$(go env GOARCH)"
bash scripts/validate-release-asset.sh linux release amd64
```

Generate checksums:

```sh
(
  cd release
  sha256sum * > checksums.txt
)
```

## Credentialed Steps

Only run and claim these steps when the maintainer has the required credentials.

- Windows signing: sign `work-light-windows-amd64-setup.exe` with the maintainer certificate, then regenerate `checksums.txt`.
- macOS signing and notarization: sign the app before dmg creation, submit it to Apple notarization, staple the ticket, then regenerate `checksums.txt`.
- winget publishing: submit the released installer through the winget package flow after the GitHub Release is public.

Unsigned or non-notarized assets must be documented as such in the release notes.
