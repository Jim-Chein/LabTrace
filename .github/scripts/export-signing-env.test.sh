#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")" && pwd)"
script="$root/export-signing-env.sh"
failures=0

assert() {
  local label="$1"
  shift
  if "$@"; then
    echo "ok: $label"
  else
    echo "FAIL: $label" >&2
    failures=$((failures + 1))
  fi
}

run_case() {
  local env_file log_file status
  env_file="$(mktemp)"
  log_file="$(mktemp)"
  set +e
  env -u APPLE_CERTIFICATE -u APPLE_CERTIFICATE_PASSWORD -u APPLE_SIGNING_IDENTITY \
    -u APPLE_ID -u APPLE_PASSWORD -u APPLE_TEAM_ID \
    -u WINDOWS_CERTIFICATE -u WINDOWS_CERTIFICATE_PASSWORD \
    GITHUB_ENV="$env_file" "$@" bash "$script" >"$log_file"
  status=$?
  set -e
  printf '%s %s %s\n' "$status" "$env_file" "$log_file"
}

echo "empty Apple secrets on macOS use ad-hoc signing"
read -r status env_file log_file < <(run_case env LABTRACE_OS_NAME=Darwin)
assert "empty macOS secrets exit 0" test "$status" -eq 0
assert "ad-hoc identity is exported" grep -q 'APPLE_SIGNING_IDENTITY<<LABTRACE_ADHOC_EOF' "$env_file"
assert "identity value is a dash" grep -qx '-' "$env_file"
assert "certificate is not exported" bash -c "! grep -q '^APPLE_CERTIFICATE<<' '$env_file'"
assert "log does not mention a certificate payload" bash -c "! grep -q 'APPLE_CERTIFICATE<<' '$log_file'"
rm -f "$env_file" "$log_file"

echo "a real certificate is forwarded and not replaced by ad-hoc"
secret='not-a-real-certificate-ZmFrZS1jZXJ0'
read -r status env_file log_file < <(run_case env LABTRACE_OS_NAME=Darwin APPLE_CERTIFICATE="$secret" APPLE_CERTIFICATE_PASSWORD='pw' APPLE_SIGNING_IDENTITY='Developer ID Application: Example (TEAMID)')
assert "real certificate exits 0" test "$status" -eq 0
assert "certificate block exists" grep -q '^APPLE_CERTIFICATE<<' "$env_file"
assert "certificate value is stored" grep -qx "$secret" "$env_file"
assert "password is stored" grep -qx 'pw' "$env_file"
assert "given identity is kept" grep -qx 'Developer ID Application: Example (TEAMID)' "$env_file"
assert "stdout hides the certificate" bash -c "! grep -q '$secret' '$log_file'"
rm -f "$env_file" "$log_file"

echo "partial notarization credentials fail closed"
read -r status env_file log_file < <(run_case env LABTRACE_OS_NAME=Darwin APPLE_CERTIFICATE='cert' APPLE_CERTIFICATE_PASSWORD='pw' APPLE_ID='only-id')
assert "partial notarization exits non-zero" test "$status" -ne 0
rm -f "$env_file" "$log_file"

echo "empty Windows secrets export nothing"
read -r status env_file log_file < <(run_case env LABTRACE_OS_NAME=MINGW64_NT-10.0)
assert "empty Windows secrets exit 0" test "$status" -eq 0
assert "windows env file is empty" bash -c "! test -s '$env_file'"
rm -f "$env_file" "$log_file"

if [[ "$failures" -ne 0 ]]; then
  echo "$failures assertion(s) failed" >&2
  exit 1
fi
echo "all signing-env checks passed"
