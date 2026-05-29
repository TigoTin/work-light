#!/usr/bin/env bash
set -euo pipefail

platform=${1:?platform is required}
release_dir=${2:-release}
arch=${3:-$(go env GOARCH)}

list_zip() {
	local package=$1
	if command -v unzip >/dev/null 2>&1; then
		unzip -Z1 "$package"
		return
	fi
	if command -v powershell >/dev/null 2>&1; then
		powershell -NoProfile -Command "Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::OpenRead('$package').Entries.FullName"
		return
	fi
	echo "unzip or powershell is required to inspect $package" >&2
	return 1
}

case "$platform" in
	windows)
		package="$release_dir/work-light-windows-$arch.zip"
		test -f "$package"
		list_zip "$package" | grep -Fx "work-light.exe" >/dev/null
		;;
	macos)
		package="$release_dir/work-light-macos-$arch.app.zip"
		test -f "$package"
		list_zip "$package" | grep -Fx "Work Light.app/Contents/Info.plist" >/dev/null
		list_zip "$package" | grep -Fx "Work Light.app/Contents/MacOS/work-light" >/dev/null
		;;
	linux)
		case "$arch" in
			amd64 | arm64) deb_arch=$arch ;;
			*) echo "unsupported Debian architecture: $arch" >&2; exit 1 ;;
		esac
		package="$release_dir/work-light-linux-$deb_arch.deb"
		test -f "$package"
		dpkg-deb -c "$package" | grep -E '(\./)?usr/bin/work-light$' >/dev/null
		dpkg-deb -c "$package" | grep -E '(\./)?usr/share/applications/work-light\.desktop$' >/dev/null
		;;
	*)
		echo "unknown platform: $platform" >&2
		exit 1
		;;
esac
