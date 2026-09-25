#!/usr/bin/env sh
# Prüft das gebaute Abbild gegen SPEC.md (Anforderungen 3 bis 6, 8 und 10 bis 13).
# Aufruf: test/check.sh <abbild>
#
# Seit 2026-09-23 ist die Seite EINE Datei: Stil, Bild und alle Rechtstexte stehen darin.
# Deshalb prüft dieser Lauf keine Unterseiten mehr, sondern Umleitungen — und zusätzlich,
# dass die Sicherheitsregel die Seite wirklich erlaubt.
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

code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/")
[ "$code" = "200" ] || fail "/ liefert $code"

# Alte Links auf die Rechtstexte bleiben heil: Umleitung auf den Anker in der Seite.
for p in /impressum.html /datenschutz.html /agb.html; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT$p")
  ziel=$(curl -s -o /dev/null -w '%{redirect_url}' "http://127.0.0.1:$PORT$p")
  [ "$code" = "301" ] || fail "$p liefert $code statt einer Umleitung"
  # Das Ziel muss RELATIV sein. Eine absolute Adresse traegt den Port des Containers
  # (8080) und das Schema http — der Besucher landete im Nichts. Genau das ist am
  # 2026-09-23 in Produktion passiert, weil diese Pruefung nur auf "/#" sah.
  ort=$(curl -s -D- -o /dev/null "http://127.0.0.1:$PORT$p" | tr -d '\r' | grep -i '^location:' | sed 's/^[Ll]ocation:[[:space:]]*//')
  case "$ort" in
    /\#*) : ;;
    *) fail "$p leitet auf '$ort' — erwartet wird ein relativer Anker wie /#impressum" ;;
  esac
done

SEITE="/tmp/werbung-check-$$.html"
curl -s "http://127.0.0.1:$PORT/" -o "$SEITE"

# 5: keine Cookies
curl -sI "http://127.0.0.1:$PORT/" | grep -qi '^set-cookie' && fail "Cookie gesetzt"

# 5: nichts von fremden Servern NACHLADEN. Ein Link ist kein Nachladen — die
# EU-Schlichtungsstelle muss im Impressum verlinkt sein, das ist Pflicht.
# Aus der Datei lesen, nicht durch eine Pipe: grep bricht sonst frueh ab und
# echo meldet einen gebrochenen Kanal.
grep -Eo 'src="https?://[^"]*"' "$SEITE" && fail "Seite lädt fremde Inhalte nach"

# 3: mobiltauglich
grep -q 'name="viewport" content="width=device-width' "$SEITE" || fail "kein viewport"

# 4: Rechtstexte erreichbar — als Dialog in der Seite
for m in impressum datenschutz agb av; do
  grep -q "data-modal=\"$m\"" "$SEITE" || fail "Rechtstext '$m' fehlt auf der Seite"
done

# 6: keine unbelegten Kennzahlen
grep -Eq '[0-9]+\+ |99,9' "$SEITE" && fail "unbelegte Kennzahl auf der Startseite"

# Die Sicherheitsregel muss die Seite auch WIRKLICH erlauben. Ohne diese Prüfung
# lieferte der Server eine Seite aus, die der Browser stumm blockt — und niemand merkt es,
# weil der Server 200 meldet.
kopf=$(curl -sI "http://127.0.0.1:$PORT/" | tr -d '\r')
echo "$kopf" | grep -qi 'content-security-policy' || fail "keine Sicherheitsregel gesetzt"
echo "$kopf" | grep -Eqi "script-src[^;]*unsafe-inline" && fail "Regel erlaubt beliebiges Inline-Skript"

regel=$(echo "$kopf" | grep -i 'content-security-policy')
anzahl=0
for hash in $(python3 - "$SEITE" <<'PY'
import base64, hashlib, re, sys
roh = open(sys.argv[1], "rb").read()
for b in re.findall(rb"<script\b[^>]*>(.*?)</script>", roh, re.S):
    print("sha256-" + base64.b64encode(hashlib.sha256(b).digest()).decode())
PY
); do
  echo "$regel" | grep -q "$hash" || fail "Skript-Hash $hash fehlt in der Sicherheitsregel"
  anzahl=$((anzahl+1))
done
[ "$anzahl" -ge 1 ] || fail "kein Skript-Hash geprüft"
echo "  $anzahl Skript-Hash(es) in der Sicherheitsregel bestätigt"

# Die Seite prüft live, ob Anwendung und Schnittstelle erreichbar sind. Steht eine dieser
# Herkünfte nicht in connect-src, zeigt sie dauerhaft "offline" — und niemand sieht einen
# Fehler, weil der Server sauber 200 meldet. Die Ziele kommen AUS der Seite, nicht von Hand.
ziele=$(grep -oE '"https://[^"]+",[[:space:]]*"row-[a-z]+"' "$SEITE" | sed -E 's/^"([^"]+)".*/\1/' | sort -u)
[ -n "$ziele" ] || fail "keine Statusziele in der Seite gefunden — Muster passt nicht mehr"
for ziel in $ziele; do
  herkunft=$(echo "$ziel" | sed -E 's#^(https://[^/]+).*#\1#')
  echo "$regel" | grep -q "$herkunft" || fail "Statusziel $herkunft fehlt in connect-src"
  echo "  Statusziel erlaubt: $herkunft"
done

# Vorgepackte Fassungen ausliefern, statt bei jeder Anfrage neu zu packen.
curl -s -D- -o /dev/null -H 'Accept-Encoding: gzip' "http://127.0.0.1:$PORT/" \
  | grep -qi 'content-encoding: gzip' || fail "gzip wird nicht ausgeliefert"

# 13: Kein Update-Hinweis in der Seite. Die Aktualität regelt der Server: no-cache
# zwingt den Browser, bei jedem Aufruf per ETag nachzufragen — ein neuer Stand kommt
# sofort, ein unveränderter kostet eine 304-Antwort ohne Inhalt.
grep -Eqi 'id="toast"|Neue Version verf' "$SEITE" && fail "Seite zeigt noch einen Update-Hinweis"
echo "$kopf" | grep -Eqi '^cache-control:.*no-cache' || fail "Cache-Control no-cache fehlt"
etag=$(echo "$kopf" | grep -i '^etag:' | sed 's/^[Ee][Tt][Aa][Gg]:[[:space:]]*//')
[ -n "$etag" ] || fail "kein ETag — der Browser kann nicht günstig nachfragen"
code=$(curl -s -o /dev/null -w '%{http_code}' -H "If-None-Match: $etag" "http://127.0.0.1:$PORT/")
[ "$code" = "304" ] || fail "Nachfrage mit passendem ETag liefert $code statt 304"
code=$(curl -s -o /dev/null -w '%{http_code}' -H 'Accept-Encoding: gzip' \
  -H "If-None-Match: $(curl -sI -H 'Accept-Encoding: gzip' "http://127.0.0.1:$PORT/" | tr -d '\r' | grep -i '^etag:' | sed 's/^[^:]*:[[:space:]]*//')" \
  "http://127.0.0.1:$PORT/")
[ "$code" = "304" ] || fail "Nachfrage auf die gzip-Fassung liefert $code statt 304"
echo "  Revalidierung per ETag bestätigt (304)"

rm -f "$SEITE"
echo "OK: alle Prüfungen bestanden"
