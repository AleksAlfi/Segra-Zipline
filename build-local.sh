#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Optional baked-in deployment defaults for the produced exe:
#   ./build-local.sh --url zipline.example.com --clipurl clip.example.com
# --url        prefills the Zipline server URL on the login screen
# --clipurl    sets the default share domain (x-zipline-domain) for uploads
# --installer  additionally packs a Velopack setup exe into releases-out/
# --version X  version for the installer package (default 1.0.0); must increase
#              on each release for auto-updates to trigger
# Without these flags the build is generic, same as the release builds.
URL=""
CLIPURL=""
INSTALLER=false
VERSION="1.0.0"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --url) URL="$2"; shift 2 ;;
    --clipurl) CLIPURL="$2"; shift 2 ;;
    --installer) INSTALLER=true; shift ;;
    --version) VERSION="$2"; shift 2 ;;
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

WIN_DIR=$(echo "$SCRIPT_DIR" | sed 's|^/\([a-zA-Z]\)/|\1:/|' | sed 's|/|\\|g')

if $INSTALLER; then
  echo "=== Packing installer (Velopack) ==="
  # vpk is a global dotnet tool: dotnet tool install -g vpk
  command -v vpk >/dev/null 2>&1 || export PATH="$PATH:$HOME/.dotnet/tools"
  rm -rf releases-out
  vpk pack \
    --packId SegraZipline \
    --packTitle Segra \
    --packVersion "$VERSION" \
    --packDir publish \
    --mainExe Segra.exe \
    --outputDir releases-out
fi

echo ""
echo "=== Done! ==="
if [[ -n "$URL" || -n "$CLIPURL" ]]; then
  echo "Baked-in defaults: server URL='${URL:-none}', clip domain='${CLIPURL:-none}'"
fi
echo "Portable output: $WIN_DIR\\publish\\Segra.exe"
if $INSTALLER; then
  echo "Installer:       $WIN_DIR\\releases-out\\SegraZipline-win-Setup.exe"
  echo "(Attach ALL files in releases-out\\ to a GitHub release for auto-updates)"
fi
echo ""
if [[ -t 0 ]]; then
  read -n 1 -s -r -p "Press any key to exit..."
fi
