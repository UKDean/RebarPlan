#!/usr/bin/env bash
# Reproduce the Mac App Store build locally, the way App Review runs it:
# a Release build inside the App Sandbox, with no old app data left over.
# No Apple certificates needed (ad-hoc signature, for testing on this Mac only).
#
#   scripts/macos-sandbox-test.sh            # App Store entitlements as shipped
#   scripts/macos-sandbox-test.sh --network  # same, plus network.client
#
# If the window is blank with the first command and fine with --network,
# the App Store entitlements need com.apple.security.network.client.
set -euo pipefail
cd "$(dirname "$0")/.."

id=com.mashharawi.rebarplan
ent=$(mktemp -t rebarplan-ent).plist
trap 'rm -f "$ent"' EXIT

# Entitlements from the App Store file, minus the team/app-id keys that need a
# provisioning profile (an ad-hoc build can't carry them).
/usr/libexec/PlistBuddy -x -c "Print" src-tauri/Entitlements.appstore.plist > "$ent"
/usr/libexec/PlistBuddy -c "Delete :com.apple.application-identifier" "$ent" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Delete :com.apple.developer.team-identifier" "$ent" 2>/dev/null || true
if [ "${1:-}" = "--network" ]; then
  /usr/libexec/PlistBuddy -c "Add :com.apple.security.network.client bool true" "$ent"
  echo "→ testing WITH com.apple.security.network.client"
fi
echo "→ entitlements:"; /usr/libexec/PlistBuddy -c "Print" "$ent"

# Clean machine: quit the app, remove installed copies and sandbox data.
osascript -e 'quit app "RebarPlan"' 2>/dev/null || true
rm -rf "$HOME/Library/Containers/$id" "$HOME/Library/WebKit/$id" \
       "$HOME/Library/Caches/$id" "$HOME/Library/Application Support/$id" \
       "$HOME/Library/Saved Application State/$id.savedState" 2>/dev/null || true
# macOS protects the container folder itself; clear what it holds instead.
rm -rf "$HOME/Library/Containers/$id/Data/"* 2>/dev/null || true

npm ci --silent
npx tauri build --bundles app
app="src-tauri/target/release/bundle/macos/RebarPlan.app"
codesign --force --deep --sign - --entitlements "$ent" "$app"
codesign -d --entitlements - "$app" 2>/dev/null | grep -q app-sandbox && echo "✓ sandboxed"

echo "→ launching; watch the window, logs follow for 20 s"
log stream --style compact --predicate "process CONTAINS 'RebarPlan' OR (process == 'kernel' AND eventMessage CONTAINS 'Sandbox')" &
lp=$!
open "$app"
sleep 20
kill $lp 2>/dev/null || true
echo "→ done. Blank window? Send the log lines above (lines with 'deny' or 'error')."
