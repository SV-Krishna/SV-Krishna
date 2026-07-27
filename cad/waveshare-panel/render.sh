#!/usr/bin/env bash
set -euo pipefail

cad_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(cd "$cad_dir/../.." && pwd)"
openscad_bin="${OPENSCAD_BIN:-$repo_dir/tools/openscad/OpenSCAD-2021.01-x86_64.AppImage}"
output_dir="${1:-$cad_dir/output}"
source_file="$cad_dir/waveshare_panel_enclosure.scad"

mkdir -p "$output_dir"

parts=(
  bezel
  carrier
  rear_box
  service_cover
  radar_clip
  bme_pod
  bme_cover
  dimension_gauge
  bezel_corner
  radar_test
)

for part_name in "${parts[@]}"; do
  echo "Rendering $part_name.stl"
  APPIMAGE_EXTRACT_AND_RUN=1 "$openscad_bin" \
    -o "$output_dir/$part_name.stl" \
    -D "part=\"$part_name\"" \
    "$source_file"
done

echo "Rendering assembly preview"
QT_QPA_PLATFORM=offscreen APPIMAGE_EXTRACT_AND_RUN=1 "$openscad_bin" \
  -o "$output_dir/assembly.png" \
  --imgsize=1600,1000 \
  --viewall \
  --autocenter \
  --colorscheme=Tomorrow \
  -D 'part="assembly"' \
  "$source_file"
