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

write_unsigned_notice() {
	local package=$1
	cat > "$package" <<NOTICE
Work Light release packaging entry

This release job did not perform code signing, notarization, or store publishing.
Those steps require maintainer-owned credentials and must be run explicitly.

See docs/release.md for the credentialed release checklist.
NOTICE
}

zip_directory() {
	local source_dir=$1
	local package=$2
	local package_dir package_name package_path
	package_dir=$(dirname "$package")
	package_name=$(basename "$package")
	mkdir -p "$package_dir"
	package_path="$(cd "$package_dir" && pwd)/$package_name"
	local entry_name
	entry_name=$(basename "$source_dir")
	if command -v zip >/dev/null 2>&1; then
		(
			cd "$(dirname "$source_dir")"
			zip -qry "$package_path" "$entry_name"
		)
		return
	fi
	if command -v python3 >/dev/null 2>&1; then
		python3 - "$source_dir" "$package_path" "$entry_name" <<'PY'
import sys
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

source = Path(sys.argv[1])
package = Path(sys.argv[2])
entry_name = sys.argv[3]
with ZipFile(package, "w", ZIP_DEFLATED) as archive:
    for path in source.rglob("*"):
        archive.write(path, Path(entry_name) / path.relative_to(source))
PY
		return
	fi
	echo "zip or python3 is required to package $source_dir" >&2
	return 1
}

appimagetool_cmd() {
	if command -v appimagetool >/dev/null 2>&1; then
		echo "appimagetool"
		return
	fi

	if [[ "${WORK_LIGHT_FETCH_APPIMAGETOOL:-0}" != "1" ]]; then
		return 1
	fi

	if [[ "$(uname -s)" != "Linux" || "$(uname -m)" != "x86_64" ]]; then
		return 1
	fi

	local tools_dir="$release_dir/tools"
	local tool="$tools_dir/appimagetool-x86_64.AppImage"
	mkdir -p "$tools_dir"
	if [[ ! -x "$tool" ]]; then
		curl -L --fail --retry 3 \
			-o "$tool" \
			"https://github.com/AppImage/AppImageKit/releases/download/continuous/appimagetool-x86_64.AppImage"
		chmod +x "$tool"
	fi
	echo "env APPIMAGE_EXTRACT_AND_RUN=1 $tool"
}

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

		installer="$release_dir/work-light-windows-$arch-setup.exe"
		if command -v makensis >/dev/null 2>&1; then
			nsis_script="$release_dir/work-light-installer.nsi"
			cat > "$nsis_script" <<NSIS
Unicode true
Name "Work Light"
OutFile "$installer"
InstallDir "\$LOCALAPPDATA\\Work Light"
RequestExecutionLevel user

Page directory
Page instfiles
UninstPage uninstConfirm
UninstPage instfiles

Section "Install"
  SetOutPath "\$INSTDIR"
  File "$binary"
  Rename "\$INSTDIR\\$(basename "$binary")" "\$INSTDIR\\work-light.exe"
  CreateShortcut "\$SMPROGRAMS\\Work Light.lnk" "\$INSTDIR\\work-light.exe"
  WriteUninstaller "\$INSTDIR\\Uninstall.exe"
SectionEnd

Section "Uninstall"
  Delete "\$SMPROGRAMS\\Work Light.lnk"
  Delete "\$INSTDIR\\work-light.exe"
  Delete "\$INSTDIR\\Uninstall.exe"
  RMDir "\$INSTDIR"
SectionEnd
NSIS
			makensis "$nsis_script"
			rm -f "$nsis_script"
		else
			write_unsigned_notice "$release_dir/work-light-windows-$arch-installer-entry.txt"
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
		zip_directory "$app_dir" "$release_dir/work-light-macos-$arch.app.zip"
		if command -v hdiutil >/dev/null 2>&1; then
			hdiutil create \
				-volname "Work Light" \
				-srcfolder "$app_dir" \
				-ov \
				-format UDZO \
				"$release_dir/work-light-macos-$arch.dmg"
		else
			write_unsigned_notice "$release_dir/work-light-macos-$arch-dmg-entry.txt"
		fi
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
Icon=work-light
Terminal=false
Categories=Utility;Development;
DESKTOP
		dpkg-deb --build "$package_root" "$release_dir/work-light-linux-$deb_arch.deb"

		appimage_arch="$arch"
		case "$appimage_arch" in
			amd64) appimage_arch=x86_64 ;;
			arm64) appimage_arch=aarch64 ;;
			*) echo "Unsupported AppImage architecture: $appimage_arch" >&2; exit 1 ;;
		esac
		appdir="$release_dir/AppDir"
		mkdir -p "$appdir/usr/bin" "$appdir/usr/share/applications" "$appdir/usr/share/icons/hicolor/256x256/apps"
		cp "$binary" "$appdir/usr/bin/work-light"
		chmod 0755 "$appdir/usr/bin/work-light"
		cp "$package_root/usr/share/applications/work-light.desktop" "$appdir/usr/share/applications/work-light.desktop"
		cp "$appdir/usr/share/applications/work-light.desktop" "$appdir/work-light.desktop"
		if [[ -f docs/assets/logo.png ]]; then
			cp docs/assets/logo.png "$appdir/usr/share/icons/hicolor/256x256/apps/work-light.png"
			cp docs/assets/logo.png "$appdir/work-light.png"
		fi
		cat > "$appdir/AppRun" <<'APPRUN'
#!/usr/bin/env sh
HERE=$(dirname "$(readlink -f "$0")")
exec "$HERE/usr/bin/work-light" "$@"
APPRUN
		chmod +x "$appdir/AppRun"
		if tool=$(appimagetool_cmd); then
			ARCH="$appimage_arch" $tool "$appdir" "$release_dir/work-light-linux-$appimage_arch.AppImage"
		else
			write_unsigned_notice "$release_dir/work-light-linux-$appimage_arch-appimage-entry.txt"
		fi
		rm -rf "$appdir" "$release_dir/deb" "$release_dir/tools"
		;;
	*)
		echo "Unknown platform: $platform" >&2
		exit 1
		;;
esac
