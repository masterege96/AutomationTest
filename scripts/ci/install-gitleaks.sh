#!/usr/bin/env bash
# Install a pinned gitleaks release on a Linux x64 CI runner, verifying the release checksum.
# Usage: scripts/ci/install-gitleaks.sh <version without v>
set -euo pipefail
VERSION="${1:?usage: install-gitleaks.sh <version>}"
TARBALL="gitleaks_${VERSION}_linux_x64.tar.gz"
BASE="https://github.com/gitleaks/gitleaks/releases/download/v${VERSION}"
TMP=$(mktemp -d)
curl -fsSL -o "$TMP/$TARBALL" "$BASE/$TARBALL"
curl -fsSL -o "$TMP/checksums.txt" "$BASE/gitleaks_${VERSION}_checksums.txt"
(cd "$TMP" && grep " ${TARBALL}\$" checksums.txt | sha256sum -c -)
tar -xzf "$TMP/$TARBALL" -C "$TMP" gitleaks
sudo install -m 0755 "$TMP/gitleaks" /usr/local/bin/gitleaks
gitleaks version
