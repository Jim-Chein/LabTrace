#!/usr/bin/env bash
# Require a version tag. workflow_dispatch must pass that tag explicitly so a
# run from main is not published as a release named "main".
set -euo pipefail

if [[ -z "${RELEASE_TAG:-}" ]]; then
  echo "RELEASE_TAG is required" >&2
  exit 1
fi
if [[ ! "$RELEASE_TAG" =~ ^v[0-9A-Za-z][0-9A-Za-z._+-]*$ ]]; then
  echo "Refusing to publish '$RELEASE_TAG'. Expected a tag like v0.1.0." >&2
  exit 1
fi
if [[ -z "${GITHUB_OUTPUT:-}" ]]; then
  echo "tag=$RELEASE_TAG"
  exit 0
fi
echo "tag=$RELEASE_TAG" >>"$GITHUB_OUTPUT"
