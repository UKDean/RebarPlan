#!/usr/bin/env bash
# Build, sign and package RebarPlan for macOS on the developer's own Mac,
# using the certificates already in the login keychain. Nothing is uploaded
# to GitHub; the keys never leave this Mac.
#
#   scripts/macos-release.sh appstore TEAM_ID path/to/profile.provisionprofile
#       → dist/RebarPlan-AppStore.pkg, signed for the Mac App Store.
#         Upload it with Apple's Transporter app (or set APPLE_API_ISSUER,
#         APPLE_API_KEY_ID and APPLE_API_KEY_PATH to upload from here).
#
#   scripts/macos-release.sh developer-id TEAM_ID
#       → dist/RebarPlan_<version>_universal.dmg, signed with Developer ID
#         and notarized (needs APPLE_ID and APPLE_PASSWORD, an app-specific
#         password from appleid.apple.com), for the website download.
#
# Requirements: Xcode command line tools, Node 22, Rust with both macOS
# targets (rustup target add aarch64-apple-darwin x86_64-apple-darwin).
# See docs/APPSTORE.md.
set -euo pipefail

mode="${1:-}"; team="${2:-}"
cd "$(dirname "$0")/.."
[ -n "$mode" ] && [ -n "$team" ] || { sed -n '2,20p' "$0"; exit 1; }

identity() { security find-identity -v ${2:-} | grep -E "\"($1)" | head -1 | sed -E 's/.*"(.*)"/\1/'; }
mkdir -p dist
npm ci --silent
node --test "tests/*.test.mjs" >/dev/null && echo "✓ tests"

case "$mode" in
  appstore)
    profile="${3:-}"
    [ -f "$profile" ] || { echo "Give the .provisionprofile path as the third argument."; exit 1; }
    app_id=$(identity "Apple Distribution|3rd Party Mac Developer Application" "-p codesigning")
    pkg_id=$(identity "Mac Installer Distribution|3rd Party Mac Developer Installer")
    [ -n "$app_id" ] || { echo "No 'Apple Distribution' certificate in the keychain."; exit 1; }
    [ -n "$pkg_id" ] || { echo "No 'Mac Installer Distribution' certificate in the keychain."; exit 1; }
    echo "✓ app identity: $app_id"
    echo "✓ pkg identity: $pkg_id"

    cp "$profile" src-tauri/embedded.provisionprofile
    sed "s/TEAM_ID/$team/g" src-tauri/Entitlements.appstore.plist > src-tauri/Entitlements.appstore.local.plist
    # Each upload needs a higher build number than the last one.
    build=$(date +%Y%m%d%H%M)
    node -e '
      const fs = require("fs");
      const c = JSON.parse(fs.readFileSync("src-tauri/tauri.appstore.conf.json", "utf8"));
      c.bundle.macOS.entitlements = "Entitlements.appstore.local.plist";
      c.bundle.macOS.bundleVersion = process.argv[1];
      fs.writeFileSync("src-tauri/tauri.appstore.ci.json", JSON.stringify(c));
    ' "$build"
    trap 'rm -f src-tauri/embedded.provisionprofile src-tauri/Entitlements.appstore.local.plist src-tauri/tauri.appstore.ci.json' EXIT

    APPLE_SIGNING_IDENTITY="$app_id" npx tauri build --bundles app --target universal-apple-darwin --config src-tauri/tauri.appstore.ci.json
    app="src-tauri/target/universal-apple-darwin/release/bundle/macos/RebarPlan.app"
    codesign --verify --deep --strict "$app" && echo "✓ signature"
    xcrun productbuild --sign "$pkg_id" --component "$app" /Applications dist/RebarPlan-AppStore.pkg
    echo "✓ dist/RebarPlan-AppStore.pkg (build $build)"

    if [ -n "${APPLE_API_ISSUER:-}" ] && [ -n "${APPLE_API_KEY_ID:-}" ] && [ -n "${APPLE_API_KEY_PATH:-}" ]; then
      mkdir -p ~/.appstoreconnect/private_keys
      cp "$APPLE_API_KEY_PATH" ~/.appstoreconnect/private_keys/AuthKey_$APPLE_API_KEY_ID.p8
      xcrun altool --upload-app --type macos --file dist/RebarPlan-AppStore.pkg --apiKey "$APPLE_API_KEY_ID" --apiIssuer "$APPLE_API_ISSUER"
      echo "✓ uploaded; it appears in App Store Connect after processing (10–30 min)"
    else
      echo "→ Open Transporter, sign in, and drag dist/RebarPlan-AppStore.pkg into it."
      open -a Transporter dist 2>/dev/null || true
    fi
    ;;

  developer-id)
    dev_id=$(identity "Developer ID Application" "-p codesigning")
    [ -n "$dev_id" ] || { echo "No 'Developer ID Application' certificate in the keychain."; exit 1; }
    echo "✓ identity: $dev_id"
    if [ -n "${APPLE_ID:-}" ] && [ -n "${APPLE_PASSWORD:-}" ]; then
      export APPLE_TEAM_ID="$team"
      echo "✓ will notarize as $APPLE_ID"
    else
      echo "! APPLE_ID / APPLE_PASSWORD not set: signing without notarization"
    fi
    APPLE_SIGNING_IDENTITY="$dev_id" npx tauri build --bundles dmg --target universal-apple-darwin
    cp src-tauri/target/universal-apple-darwin/release/bundle/dmg/*.dmg dist/
    spctl -a -vv -t install dist/*.dmg 2>&1 | tail -2 || true
    echo "✓ $(ls dist/*.dmg)"
    echo "→ Replace the .dmg on the GitHub release (or send it to Omar)."
    ;;

  *) sed -n '2,20p' "$0"; exit 1 ;;
esac
