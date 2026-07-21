#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Optional baked-in deployment defaults for the produced exe:
#   ./build-local.sh --url zipline.example.com --clipurl clip.example.com
# --url        prefills the Zipline server URL on the login screen
# --clipurl    sets the default share domain (x-zipline-domain) for uploads
# --installer  additionally packs a Velopack setup exe into releases-out/
# --version X  version for the installer package (default 2.0.0); must increase
#              on each release for auto-updates to trigger.
#              IMPORTANT: keep it >= 2.0.0. The OBS download manifest
#              (segra.tv/api/obs/versions) gates OBS versions by Segra version;
#              e.g. OBS 32.x requires >= 1.6.0-beta.6 — a lower version would
#              silently install an outdated OBS.
# Without these flags the build is generic, same as the release builds.
URL=""
CLIPURL=""
INSTALLER=false
VERSION="2.0.0"
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

if $INSTALLER; then
  # The frontend bakes package.json's version into __APP_VERSION__, and the backend reports
  # the Velopack install version. They must match, or the frontend reloads on every connect.
  echo "=== Stamping frontend version $VERSION ==="
  cp Frontend/package.json Frontend/package.json.bak
  restore_pkg() {
    [[ -f Frontend/package.json.bak ]] && mv -f Frontend/package.json.bak Frontend/package.json
  }
  trap restore_pkg EXIT
  node -e "const fs=require('fs');const p='Frontend/package.json';const j=JSON.parse(fs.readFileSync(p));j.version='$VERSION';fs.writeFileSync(p,JSON.stringify(j,null,2)+'\n')"
fi

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
