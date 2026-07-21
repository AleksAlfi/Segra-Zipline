#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# ---------------------------------------------------------------------------
# Fork options (Segra-Zipline):
#   --url X       bake a default Zipline server URL into the exe (prefills login)
#   --clipurl X   bake a default share domain (x-zipline-domain) into the exe
#   --installer   pack a Velopack installer (setup exe on Windows, AppImage on Linux)
#   --version X   installer package version. Defaults to upstream's (Segergren/Segra)
#                 latest release version so the OBS compatibility manifest treats the
#                 fork exactly like stock Segra. Bump the patch past upstream for
#                 fork-only re-releases; versions must increase for auto-updates.
#   --target X    windows|linux — skip the interactive target menu
# Without these flags the build is generic, same as the release builds.
# ---------------------------------------------------------------------------
URL=""
CLIPURL=""
INSTALLER=false
VERSION=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --url) URL="$2"; shift 2 ;;
    --clipurl) CLIPURL="$2"; shift 2 ;;
    --installer) INSTALLER=true; shift ;;
    --version) VERSION="$2"; shift 2 ;;
    --target) SEGRA_BUILD_TARGET="$2"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

EXTRA_PROPS=()
[[ -n "$URL" ]] && EXTRA_PROPS+=("-p:ZiplineDefaultUrl=$URL")
[[ -n "$CLIPURL" ]] && EXTRA_PROPS+=("-p:ZiplineDefaultClipDomain=$CLIPURL")

# ---------------------------------------------------------------------------
# Target selection (Up/Down arrows, Enter to confirm).
# Runs in git-bash on Windows and in bash on Linux.
# Set SEGRA_BUILD_TARGET=windows|linux to skip the menu (for CI/non-interactive runs).
# ---------------------------------------------------------------------------
options=("Windows (win-x64)" "Linux (linux-x64)")
selected=0
count=${#options[@]}

case "${SEGRA_BUILD_TARGET:-}" in
    windows|win) selected=0; skip_menu=1 ;;
    linux)       selected=1; skip_menu=1 ;;
    *)           skip_menu=0 ;;
esac

draw_menu() {
    local i
    for i in "${!options[@]}"; do
        if [[ $i -eq $selected ]]; then
            printf "\e[7m> %s\e[0m\n" "${options[$i]}"
        else
            printf "  %s\n" "${options[$i]}"
        fi
    done
}

if [[ $skip_menu -eq 0 ]]; then
    echo "Select build target (Up/Down arrows, Enter to confirm):"
    echo
    draw_menu

    while true; do
        IFS= read -rsn1 key
        if [[ $key == $'\x1b' ]]; then
            # Arrow keys arrive as ESC [ A/B; read the remaining two bytes.
            read -rsn2 -t 0.1 rest || true
            key+="$rest"
        fi
        case "$key" in
            $'\x1b[A') selected=$(( (selected - 1 + count) % count )) ;;  # Up
            $'\x1b[B') selected=$(( (selected + 1) % count )) ;;          # Down
            "")        break ;;                                           # Enter
        esac
        printf "\e[%dA" "$count"   # move cursor back up over the menu
        draw_menu
    done
fi

echo
echo "Selected: ${options[$selected]}"
echo

# ---------------------------------------------------------------------------
# Installer versioning: mimic upstream's latest release unless --version given,
# then stamp the frontend so __APP_VERSION__ matches the Velopack version
# (a mismatch used to make the frontend reload on every connect).
# ---------------------------------------------------------------------------
if $INSTALLER && [[ -z "$VERSION" ]]; then
  echo "=== Resolving version from upstream latest release ==="
  VERSION=$(curl -fsSL https://api.github.com/repos/Segergren/Segra/releases/latest 2>/dev/null \
    | sed -n 's/.*"tag_name": *"v\{0,1\}\([^"]*\)".*/\1/p' | head -1)
  if [[ -z "$VERSION" ]]; then
    echo "Could not resolve the upstream version (offline or GitHub rate-limited)." >&2
    echo "Pass --version X.Y.Z explicitly and retry." >&2
    exit 1
  fi
  echo "Mimicking upstream version: $VERSION"
fi

if $INSTALLER; then
  echo "=== Stamping frontend version $VERSION ==="
  cp Frontend/package.json Frontend/package.json.bak
  restore_pkg() {
    [[ -f Frontend/package.json.bak ]] && mv -f Frontend/package.json.bak Frontend/package.json
  }
  trap restore_pkg EXIT
  node -e "const fs=require('fs');const p='Frontend/package.json';const j=JSON.parse(fs.readFileSync(p));j.version='$VERSION';fs.writeFileSync(p,JSON.stringify(j,null,2)+'\n')"
fi

# ---------------------------------------------------------------------------
# Frontend build (also embedded by the csproj during publish; this standalone
# copy feeds the debug static-file server path).
# ---------------------------------------------------------------------------
echo "=== Building Frontend ==="
(cd Frontend && npm run build)

echo "=== Copying Frontend to wwwroot ==="
rm -rf wwwroot
mkdir wwwroot
cp -r Frontend/dist/* wwwroot/

echo "=== Publishing Backend ==="
rm -rf publish

if [[ $selected -eq 0 ]]; then
    # -------- Windows --------
    dotnet publish Segra.csproj -c Release --self-contained \
        -r win-x64 -f net10.0-windows10.0.19041.0 -o publish \
        ${EXTRA_PROPS[@]+"${EXTRA_PROPS[@]}"}

    if $INSTALLER; then
        echo ""
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
    WIN_DIR=$(echo "$SCRIPT_DIR" | sed 's|^/\([a-zA-Z]\)/|\1:/|' | sed 's|/|\\|g')
    echo "Output: $WIN_DIR\\publish\\"
    echo "Executable: $WIN_DIR\\publish\\Segra.exe"
    if $INSTALLER; then
        echo "Installer: $WIN_DIR\\releases-out\\SegraZipline-win-Setup.exe"
        echo "(Attach ALL files in releases-out\\ to a GitHub release for auto-updates)"
    fi
else
    # -------- Linux --------
    # -p:TargetFrameworks=net10.0 restricts the restore to the Linux TFM, so the Windows TFM's packages
    # (System.Management -> System.CodeDom) never enter the graph (they don't resolve on a clean Linux
    # host, and aren't needed for the Linux build).
    dotnet publish Segra.csproj -c Release --self-contained \
        -r linux-x64 -f net10.0 -p:TargetFrameworks=net10.0 -o publish \
        ${EXTRA_PROPS[@]+"${EXTRA_PROPS[@]}"}

    # The AppImage runs from a read-only mount. The frontend is embedded, but ASP.NET (PhotinoServer)
    # creates its webroot at startup if missing, which throws on the read-only mount. Ship the dir so it
    # already exists at runtime.
    mkdir -p publish/wwwroot && cp -r Frontend/dist/* publish/wwwroot/ 2>/dev/null || true

    # Emit the Linux launcher. It resolves the OBS runtime (a bundled ./lib copy if present,
    # otherwise a system obs-studio install), curates plugins for headless use, and exports the
    # loader path + OBS paths before starting the app. Named run.sh (not "segra") so it never
    # collides with the "Segra" binary on a case-insensitive host when cross-publishing from Windows.
    cat > publish/run.sh <<'LAUNCHER'
#!/bin/sh
# Segra Linux launcher.
HERE="$(cd "$(dirname "$0")" && pwd)"

find_syslib() {
    for d in /usr/lib/x86_64-linux-gnu /usr/lib64 /usr/lib /usr/local/lib /usr/local/lib/x86_64-linux-gnu; do
        [ -e "$d/libobs.so.0" ] && { printf '%s' "$d"; return 0; }
    done
    return 1
}
find_obsdata() {
    for d in /usr/share/obs /usr/local/share/obs; do
        [ -d "$d/libobs" ] && { printf '%s' "$d"; return 0; }
    done
    return 1
}

LIBDIR=""
if [ -e "$HERE/lib/libobs.so.0" ]; then
    # Self-contained OBS runtime shipped alongside the app.
    LIBDIR="$HERE/lib"
    export SEGRA_OBS_MODULE_PATH="$HERE/obs-plugins"
    export SEGRA_OBS_MODULE_DATA_PATH="$HERE/data/obs-plugins/%module%"
    export SEGRA_OBS_DATA_PATH="$HERE/data/libobs"
else
    SYSLIB="$(find_syslib)"
    OBSDATA="$(find_obsdata)"
    if [ -n "$SYSLIB" ] && [ -n "$OBSDATA" ]; then
        RT="${XDG_CONFIG_HOME:-$HOME/.config}/Segra/obs-runtime"
        rm -rf "$RT"; mkdir -p "$RT/lib" "$RT/obs-plugins"
        # libobs core libraries, plus unversioned aliases the loader and OBS graphics module need.
        for so in "$SYSLIB"/libobs*.so*; do
            [ -e "$so" ] || continue
            b="$(basename "$so")"
            ln -sf "$so" "$RT/lib/$b"
            un="$(printf '%s' "$b" | sed -E 's/\.so\.[0-9].*/.so/')"
            ln -sf "$so" "$RT/lib/$un"
        done
        # Curated plugins: skip Qt/CEF/UI plugins that abort in a headless process.
        for so in "$SYSLIB"/obs-plugins/*.so; do
            [ -e "$so" ] || continue
            b="$(basename "$so")"
            case "$b" in
                frontend-tools.so|obs-websocket.so|obs-browser.so|decklink*.so|*-ui.so) ;;
                *) ln -sf "$so" "$RT/obs-plugins/$b" ;;
            esac
        done
        LIBDIR="$RT/lib"
        export SEGRA_OBS_MODULE_PATH="$RT/obs-plugins"
        export SEGRA_OBS_MODULE_DATA_PATH="$OBSDATA/obs-plugins/%module%"
        export SEGRA_OBS_DATA_PATH="$OBSDATA/libobs"
    fi
fi

export LD_LIBRARY_PATH="${LIBDIR:+$LIBDIR:}$HERE:$LD_LIBRARY_PATH"
exec "$HERE/Segra" "$@"
LAUNCHER
    chmod +x publish/run.sh 2>/dev/null || true
    chmod +x publish/Segra 2>/dev/null || true

    # Build a Velopack AppImage installer when the vpk CLI is available and we're on Linux.
    # (vpk's Linux packer only runs on Linux; install it with: dotnet tool install -g vpk)
    if $INSTALLER && command -v vpk >/dev/null 2>&1 && [[ "$(uname -s)" == "Linux" ]]; then
        echo ""
        echo "=== Packaging AppImage (Velopack) ==="
        rm -rf releases-out
        # The app self-configures its OBS runtime on launch (Backend/Platform/Linux/LinuxObsRuntime.cs),
        # so the AppImage's main executable is just Segra; obs-studio is a runtime dependency on the host.
        vpk pack -u SegraZipline -v "$VERSION" -p publish -e Segra -o releases-out --packTitle "Segra" -i icon.png \
            && echo "Installer: $SCRIPT_DIR/releases-out/  (*.AppImage)" \
            || echo "vpk pack failed (continuing without an installer)."
    elif $INSTALLER; then
        echo ""
        echo "(No AppImage: install the Velopack CLI ('dotnet tool install -g vpk') and run this on Linux to produce an installer.)"
    fi

    echo ""
    echo "=== Done! ==="
    if [[ -n "$URL" || -n "$CLIPURL" ]]; then
        echo "Baked-in defaults: server URL='${URL:-none}', clip domain='${CLIPURL:-none}'"
    fi
    echo "Output:   $SCRIPT_DIR/publish/"
    echo "Launcher: $SCRIPT_DIR/publish/run.sh"
    echo ""
    echo "Runtime prerequisites on the Linux host:"
    echo "  obs-studio (libobs), ffmpeg, webkit2gtk (libwebkit2gtk-4.1), gtk3,"
    echo "  pipewire + wireplumber, xdg-desktop-portal (+ backend), zenity,"
    echo "  pulseaudio-utils (pactl/paplay), x11-xserver-utils (xrandr), xclip,"
    echo "  gstreamer1.0-libav + gstreamer1.0-plugins-{good,bad}."
fi

echo ""
# Pause only in git-bash (Windows) or an interactive shell, never in a Linux/CI batch run.
if [[ -n "$MSYSTEM" && -t 0 ]]; then
    read -n 1 -s -r -p "Press any key to exit..."
    echo
fi
