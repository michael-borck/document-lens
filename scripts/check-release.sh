#!/usr/bin/env bash
#
# Release metadata consistency check.
#
# Everything that carries the version must agree: package.json, the Tauri
# config, the Rust crate, both lockfiles, and CITATION.cff. With --tag, the
# git tag must equal v<version> too, so a release can never ship a mislabelled
# artefact.
#
# Usage:
#   scripts/check-release.sh              # consistency check (CI)
#   scripts/check-release.sh --tag v0.33.0  # + tag guard (release workflow)

set -euo pipefail
cd "$(dirname "$0")/.."

fail=0
err() { echo "  x $*" >&2; fail=1; }

pkg=$(node -p "require('./package.json').version")
cargo=$(sed -n 's/^version = "\(.*\)"$/\1/p' src-tauri/Cargo.toml | head -1)
tauri=$(node -p "require('./src-tauri/tauri.conf.json').version")
cff=$(sed -n 's/^version: "\(.*\)"$/\1/p' CITATION.cff | head -1)
cff_doi=$(sed -n 's/^doi: "\(.*\)"$/\1/p' CITATION.cff | head -1)
lock_pkg=$(node -p "require('./package-lock.json').version")
lock_cargo=$(grep -A1 '^name = "document-lens"$' src-tauri/Cargo.lock \
  | sed -n 's/^version = "\(.*\)"$/\1/p' | head -1)

printf '%-22s %s\n' "package.json" "$pkg"
printf '%-22s %s\n' "package-lock.json" "$lock_pkg"
printf '%-22s %s\n' "src-tauri/Cargo.toml" "$cargo"
printf '%-22s %s\n' "src-tauri/Cargo.lock" "$lock_cargo"
printf '%-22s %s\n' "tauri.conf.json" "$tauri"
printf '%-22s %s\n' "CITATION.cff" "$cff"

[ "$cargo" = "$pkg" ]      || err "Cargo.toml version '$cargo' != package.json '$pkg'"
[ "$tauri" = "$pkg" ]      || err "tauri.conf.json version '$tauri' != package.json '$pkg'"
[ "$cff" = "$pkg" ]        || err "CITATION.cff version '$cff' != package.json '$pkg'"
[ "$lock_pkg" = "$pkg" ]   || err "package-lock.json version '$lock_pkg' != package.json '$pkg'"
[ "$lock_cargo" = "$pkg" ] || err "Cargo.lock version '$lock_cargo' != package.json '$pkg'"

[ -f .zenodo.json ] || err ".zenodo.json is missing (Zenodo deposit metadata)"
node -e "JSON.parse(require('fs').readFileSync('.zenodo.json','utf8'))" 2>/dev/null \
  || err ".zenodo.json is not valid JSON"

if [ -n "$cff_doi" ] && ! [[ "$cff_doi" =~ ^10\.[0-9]{4,9}/zenodo\.[0-9]+$ ]]; then
  err "CITATION.cff doi '$cff_doi' is not a Zenodo DOI"
fi

if [ "${1:-}" = "--tag" ]; then
  tag="${2:-}"
  [ -n "$tag" ] || err "--tag needs a tag name"
  [ "$tag" = "v$pkg" ] || err "tag '$tag' != v$pkg"
fi

if [ "$fail" -eq 0 ]; then
  echo "release metadata consistent"
else
  echo "release metadata INCONSISTENT" >&2
fi
exit "$fail"
