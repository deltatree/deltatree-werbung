#!/usr/bin/env sh
# Prüft das gebaute Abbild gegen SPEC.md (Anforderungen 3 bis 6 und 8).
# Aufruf: test/check.sh <abbild>
set -eu
IMAGE="${1:-deltatree-werbung:test}"
NAME="werbung-check-$$"
PORT="${PORT:-18080}"
fail() { echo "FEHLER: $*" >&2; docker rm -f "$NAME" >/dev/null 2>&1 || true; exit 1; }

docker run -d --rm --name "$NAME" -p "$PORT:8080" "$IMAGE" >/dev/null
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true' EXIT
i=0; until curl -fs "http://127.0.0.1:$PORT/healthz" >/dev/null; do
  i=$((i+1)); [ "$i" -gt 30 ] && fail "Container antwortet nicht"; sleep 1
done

# 8: kein Root
[ "$(docker exec "$NAME" id -u)" != "0" ] || fail "Container läuft als root"

for p in / /impressum.html /datenschutz.html /style.css /logo.svg; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT$p")
  [ "$code" = "200" ] || fail "$p liefert $code"
done

# 5: keine Cookies, nichts von fremden Servern (ausser Links zur Anwendung)
curl -sI "http://127.0.0.1:$PORT/" | grep -qi '^set-cookie' && fail "Cookie gesetzt"
for f in index.html impressum.html datenschutz.html; do
  body=$(curl -s "http://127.0.0.1:$PORT/$f")
  echo "$body" | grep -Eo '(src|href)="https?://[^"]*"' | grep -v '^href="https://dtadmin-frontend.capps.dtcloud.de' \
    && fail "$f lädt fremde Inhalte"
  # 3: mobiltauglich
  echo "$body" | grep -q 'name="viewport" content="width=device-width' || fail "$f ohne viewport"
done

# 4: Rechtstexte verlinkt
home=$(curl -s "http://127.0.0.1:$PORT/")
echo "$home" | grep -q 'href="impressum.html"' || fail "Impressum nicht verlinkt"
echo "$home" | grep -q 'href="datenschutz.html"' || fail "Datenschutz nicht verlinkt"

# 6: keine unbelegten Kennzahlen
echo "$home" | grep -Eq '[0-9]+\+ |99,9' && fail "unbelegte Kennzahl auf der Startseite"

echo "OK: alle Prüfungen bestanden"
