#!/bin/sh
# Renders build/icon.svg into build/icon.png (1024px) and build/icon.icns. macOS only (sips + iconutil).
set -e
cd "$(dirname "$0")/../build"
set_dir=$(mktemp -d)/icon.iconset
mkdir -p "$set_dir"
for size in 16 32 128 256 512; do
  sips -s format png -z $size $size icon.svg --out "$set_dir/icon_${size}x${size}.png" >/dev/null
  double=$((size * 2))
  sips -s format png -z $double $double icon.svg --out "$set_dir/icon_${size}x${size}@2x.png" >/dev/null
done
cp "$set_dir/icon_512x512@2x.png" icon.png
iconutil -c icns "$set_dir" -o icon.icns
rm -rf "$(dirname "$set_dir")"
echo "Wrote build/icon.png and build/icon.icns"
