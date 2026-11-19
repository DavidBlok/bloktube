#!/usr/bin/env bash
# Usage: scripts/fetch-fixture.sh <endpoint> '<json body fields>' <name>
# Example: scripts/fetch-fixture.sh browse '"browseId":"FEmusic_home"' home
set -euo pipefail

if [ $# -ne 3 ]; then
  sed -n 2,3p "$0"
  exit 1
fi

ENDPOINT=$1
BODY=$2
NAME=$3
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36"
OUT="$(cd "$(dirname "$0")/.." && pwd)/test/fixtures/$NAME.json"

CV=$(curl -s https://music.youtube.com/ -H "User-Agent: $UA" -H "Cookie: SOCS=CAI" | grep -o '"INNERTUBE_CLIENT_VERSION":"[^"]*"' | head -1 | cut -d'"' -f4)
CV=${CV:-1.20261115.14.00}

curl -s "https://music.youtube.com/youtubei/v1/$ENDPOINT?prettyPrint=false" \
  -H "Content-Type: application/json" \
  -H "Origin: https://music.youtube.com" \
  -H "User-Agent: $UA" \
  --data "{\"context\":{\"client\":{\"clientName\":\"WEB_REMIX\",\"clientVersion\":\"$CV\",\"hl\":\"en\",\"gl\":\"BE\"}},$BODY}" \
  -o "$OUT"

echo "$OUT ($(wc -c < "$OUT" | tr -d ' ') bytes, client $CV)"
