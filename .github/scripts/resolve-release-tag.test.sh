#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")" && pwd)"
script="$root/resolve-release-tag.sh"

out="$(mktemp)"
RELEASE_TAG=v0.1.0 GITHUB_OUTPUT="$out" bash "$script"
grep -qx 'tag=v0.1.0' "$out"

out="$(mktemp)"
if RELEASE_TAG=main GITHUB_OUTPUT="$out" bash "$script"; then
  echo "invalid tag was accepted" >&2
  exit 1
fi
if [[ -s "$out" ]]; then
  echo "invalid tag wrote output" >&2
  exit 1
fi

if RELEASE_TAG='v0.1.0;rm' GITHUB_OUTPUT="$out" bash "$script"; then
  echo "unsafe tag was accepted" >&2
  exit 1
fi

echo "release tag checks passed"
