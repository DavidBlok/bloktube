#!/bin/sh
# Renders resources/src/*.svg into the tray and taskbar PNGs in resources/. macOS only (sips).
set -e
cd "$(dirname "$0")/../resources"
render() { sips -s format png -z "$2" "$2" "src/$1.svg" --out "$3" >/dev/null; }
render tray-mac 16 trayTemplate.png
render tray-mac 32 trayTemplate@2x.png
render tray 32 tray.png
render tray 64 tray@2x.png
for g in prev next play pause; do
  render "$g" 16 "$g.png"
  render "$g" 32 "$g@2x.png"
done
echo "Wrote resources/*.png"
