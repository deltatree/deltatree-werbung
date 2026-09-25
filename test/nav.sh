#!/usr/bin/env sh
# Startet das Abbild und test/nav.mjs in einem Playwright-Container — alles in Docker,
# nichts auf dem Rechner. Aufruf: test/nav.sh <abbild>
set -eu
IMAGE="${1:-deltatree-werbung:test}"
NETZ="werbung-nav-$$"
docker network create "$NETZ" >/dev/null
trap 'docker rm -f "$NETZ-web" >/dev/null 2>&1 || true; docker network rm "$NETZ" >/dev/null 2>&1 || true' EXIT
docker run -d --rm --name "$NETZ-web" --network "$NETZ" "$IMAGE" >/dev/null
docker run --rm --network "$NETZ" -v "$(cd "$(dirname "$0")" && pwd)":/t:ro -w /tmp \
  mcr.microsoft.com/playwright:v1.61.1-noble \
  sh -c 'npm i -s --no-save --no-package-lock playwright@1.61.1 >/dev/null 2>&1 && cp /t/nav.mjs . && node nav.mjs "http://$0:8080"' "$NETZ-web"
