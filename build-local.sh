#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Optional baked-in deployment defaults for the produced exe:
#   ./build-local.sh --url zipline.example.com --clipurl clip.example.com
# --url      prefills the Zipline server URL on the login screen
# --clipurl  sets the default share domain (x-zipline-domain) for uploads
# Without these flags the build is generic, same as the release builds.
URL=""
CLIPURL=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --url) URL="$2"; shift 2 ;;
    --clipurl) CLIPURL="$2"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

EXTRA_PROPS=()
[[ -n "$URL" ]] && EXTRA_PROPS+=("-p:ZiplineDefaultUrl=$URL")
[[ -n "$CLIPURL" ]] && EXTRA_PROPS+=("-p:ZiplineDefaultClipDomain=$CLIPURL")

echo "=== Building Frontend ==="
(cd Frontend && npm run build)

echo "=== Copying Frontend to wwwroot ==="
rm -rf wwwroot
mkdir wwwroot
cp -r Frontend/dist/* wwwroot/

echo "=== Publishing Backend ==="
rm -rf publish
dotnet publish Segra.csproj -c Release --self-contained -r win-x64 -o publish ${EXTRA_PROPS[@]+"${EXTRA_PROPS[@]}"}

echo ""
echo "=== Done! ==="
if [[ -n "$URL" || -n "$CLIPURL" ]]; then
  echo "Baked-in defaults: server URL='${URL:-none}', clip domain='${CLIPURL:-none}'"
fi
WIN_DIR=$(echo "$SCRIPT_DIR" | sed 's|^/\([a-zA-Z]\)/|\1:/|' | sed 's|/|\\|g')
echo "Output: $WIN_DIR\\publish\\"
echo "Executable: $WIN_DIR\\publish\\Segra.exe"
echo ""
read -n 1 -s -r -p "Press any key to exit..."
