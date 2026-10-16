#!/usr/bin/env bash
# Mobile Safari in the iOS Simulator (macOS runner): a screenshot of each section at phone width.
# usage: bash ios-check.sh <url>
set -euo pipefail
URL="$1"
mkdir -p out
UDID=$(xcrun simctl list devices available -j | node pick-iphone.cjs)
xcrun simctl boot "$UDID" || true
xcrun simctl bootstatus "$UDID" -b
for target in top problem how skeptic autonomy trust start site-footer; do
  xcrun simctl openurl "$UDID" "$URL/?debug#$target"
  sleep 12
  xcrun simctl io "$UDID" screenshot "out/ios-$target.png"
done
xcrun simctl shutdown "$UDID" || true
