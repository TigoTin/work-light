#!/usr/bin/env bash
set -euo pipefail

platform=${1:?platform is required}
binary_pattern=${2:?binary pattern is required}
release_dir=${3:-release}
ref_name=${4:-${GITHUB_REF_NAME:-}}
arch=${5:-$(go env GOARCH)}

powershell_cmd() {
	if command -v powershell >/dev/null 2>&1; then
		powershell "$@"
		return
	fi
	if command -v powershell.exe >/dev/null 2>&1; then
		powershell.exe "$@"
		return
	fi
	echo "powershell is required to package Windows assets" >&2
	return 1
}

version=${ref_name#v}
if [[ -z "$version" || "$version" == "$ref_name" ]]; then
	version="0.0.0"
fi

mkdir -p "$release_dir"
binary=$(find dist -maxdepth 1 -type f -name "$binary_pattern" | head -n 1)
if [[ -z "$binary" ]]; then
	echo "No executable found for pattern: $binary_pattern" >&2
	exit 1
fi
chmod +x "$binary" || true

case "$platform" in
	windows)
		package="$release_dir/work-light-windows-$arch.zip"
		if command -v python3 >/dev/null 2>&1; then
			python3 - "$binary" "$package" <<'PY'
import sys
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

binary = Path(sys.argv[1])
package = Path(sys.argv[2])
with ZipFile(package, "w", ZIP_DEFLATED) as archive:
    archive.write(binary, "work-light.exe")
PY
		else
			powershell_cmd -NoProfile -Command "Compress-Archive -Path 'dist/work-light.exe' -DestinationPath \"$package\" -Force"
		fi
		;;
	macos)
		app_dir="$release_dir/Work Light.app"
		mkdir -p "$app_dir/Contents/MacOS"
		cp "$binary" "$app_dir/Contents/MacOS/work-light"
		chmod +x "$app_dir/Contents/MacOS/work-light"
		cat > "$app_dir/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>work-light</string>
  <key>CFBundleIdentifier</key>
  <string>dev.tigotin.work-light</string>
  <key>CFBundleName</key>
  <string>Work Light</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>$version</string>
</dict>
</plist>
PLIST
		(cd "$release_dir" && zip -qry "work-light-macos-$arch.app.zip" "Work Light.app")
		rm -rf "$app_dir"
		;;
	linux)
		deb_arch="$arch"
		if [[ "$deb_arch" != "amd64" && "$deb_arch" != "arm64" ]]; then
			echo "Unsupported Debian architecture: $deb_arch" >&2
			exit 1
		fi
		package_root="$release_dir/deb/work-light_${version}_${deb_arch}"
		mkdir -p "$package_root/DEBIAN" "$package_root/usr/bin" "$package_root/usr/share/applications"
		cp "$binary" "$package_root/usr/bin/work-light"
		chmod 0755 "$package_root/usr/bin/work-light"
		cat > "$package_root/DEBIAN/control" <<CONTROL
Package: work-light
Version: $version
Section: utils
Priority: optional
Architecture: $deb_arch
Maintainer: TigoTin
Depends: libgtk-3-0, libwebkit2gtk-4.1-0
Description: Floating Codex hook status light
 Work Light displays local Codex hook status as a compact desktop signal.
CONTROL
		cat > "$package_root/usr/share/applications/work-light.desktop" <<'DESKTOP'
[Desktop Entry]
Type=Application
Name=Work Light
Exec=work-light
Terminal=false
Categories=Utility;Development;
DESKTOP
		dpkg-deb --build "$package_root" "$release_dir/work-light-linux-$deb_arch.deb"
		rm -rf "$release_dir/deb"
		;;
	*)
		echo "Unknown platform: $platform" >&2
		exit 1
		;;
esac
