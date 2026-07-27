#!/usr/bin/env bash
set -euo pipefail

tool_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
version="2021.01"
filename="OpenSCAD-${version}-x86_64.AppImage"
download_url="https://files.openscad.org/${filename}"
expected_sha256="f758528f2cd213f773c7a105fb63bf3b45bf754b0f586fbb7c9cd653ffcd0882"
destination="$tool_dir/$filename"

curl -fL "$download_url" -o "$destination"
printf '%s  %s\n' "$expected_sha256" "$destination" | sha256sum -c -
chmod +x "$destination"
APPIMAGE_EXTRACT_AND_RUN=1 "$destination" --version
