#!/usr/bin/env bash
# Copy code-signing secrets into GITHUB_ENV only when they contain a value.
# GitHub Actions sets missing secrets to empty strings. Tauri treats a present
# APPLE_CERTIFICATE as a PKCS#12 import, so an empty value fails the macOS bundle
# after the app has already been built. Updater signing (TAURI_SIGNING_PRIVATE_KEY)
# is intentionally not handled here.
set -euo pipefail

if [[ -z "${GITHUB_ENV:-}" ]]; then
  echo "GITHUB_ENV is required" >&2
  exit 1
fi

os_name="${LABTRACE_OS_NAME:-$(uname -s)}"
case "$os_name" in
  Darwin) os_kind=macos ;;
  MINGW*|MSYS*|CYGWIN*|Windows*) os_kind=windows ;;
  *) os_kind=other ;;
esac

forward() {
  local name="$1"
  local value="${!name-}"
  if [[ -z "$value" ]]; then
    echo "not exporting empty ${name}"
    return
  fi
  local delimiter="LABTRACE_SIGNING_EOF_${RANDOM}_${RANDOM}_$$"
  {
    echo "${name}<<${delimiter}"
    printf '%s\n' "$value"
    echo "${delimiter}"
  } >>"$GITHUB_ENV"
  echo "exporting ${name}"
}

if [[ "$os_kind" == "macos" ]]; then
  if [[ -n "${APPLE_CERTIFICATE:-}" ]]; then
    if [[ -z "${APPLE_CERTIFICATE_PASSWORD:-}" ]]; then
      echo "APPLE_CERTIFICATE is set but APPLE_CERTIFICATE_PASSWORD is empty" >&2
      exit 1
    fi
    forward APPLE_CERTIFICATE
    forward APPLE_CERTIFICATE_PASSWORD
    forward APPLE_SIGNING_IDENTITY
    if [[ -n "${APPLE_ID:-}${APPLE_PASSWORD:-}${APPLE_TEAM_ID:-}" ]]; then
      if [[ -z "${APPLE_ID:-}" || -z "${APPLE_PASSWORD:-}" || -z "${APPLE_TEAM_ID:-}" ]]; then
        echo "Notarization needs APPLE_ID, APPLE_PASSWORD, and APPLE_TEAM_ID together" >&2
        exit 1
      fi
      forward APPLE_ID
      forward APPLE_PASSWORD
      forward APPLE_TEAM_ID
    else
      echo "Apple notarization secrets are empty; skipping notarization"
    fi
  else
    # No Developer ID material. Ask Tauri to ad-hoc sign (codesign -s -)
    # instead of importing a certificate.
    {
      echo "APPLE_SIGNING_IDENTITY<<LABTRACE_ADHOC_EOF"
      echo "-"
      echo "LABTRACE_ADHOC_EOF"
    } >>"$GITHUB_ENV"
    echo "no Apple certificate; macOS bundles will be ad-hoc signed and not notarized"
  fi
elif [[ "$os_kind" == "windows" ]]; then
  if [[ -n "${WINDOWS_CERTIFICATE:-}" ]]; then
    if [[ -z "${WINDOWS_CERTIFICATE_PASSWORD:-}" ]]; then
      echo "WINDOWS_CERTIFICATE is set but WINDOWS_CERTIFICATE_PASSWORD is empty" >&2
      exit 1
    fi
    forward WINDOWS_CERTIFICATE
    forward WINDOWS_CERTIFICATE_PASSWORD
  else
    echo "no Windows certificate; installers stay unsigned"
  fi
else
  echo "no OS code signing on ${os_name}"
fi
