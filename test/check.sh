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

# 10: Keine Inline-Handler (onclick=, onsubmit= …). Die Sicherheitsregel erlaubt nur Skript
# mit bekanntem Hash; ein Handler-Attribut blockt der Browser still. Bis 2026-09-25 ließ
# sich deshalb kein Rechtstext schließen und das Kontaktformular nicht absenden.
grep -Eo '[[:space:]]on[a-z]+="' "$SEITE" && fail "Inline-Handler in der Seite — die CSP blockt sie still"

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

# 17–21: Visitenkarte unter der festen Adresse /visit
V="/tmp/werbung-visit-$$.html"
code=$(curl -s -o "$V" -w '%{http_code}' "http://127.0.0.1:$PORT/visit")
[ "$code" = "200" ] || fail "/visit liefert $code"
ort=$(curl -s -D- -o /dev/null "http://127.0.0.1:$PORT/visit/" | tr -d '\r' | grep -i '^location:' | sed 's/^[Ll]ocation:[[:space:]]*//')
[ "$ort" = "/visit" ] || fail "/visit/ leitet auf '$ort' statt relativ auf /visit"
grep -q 'name="viewport" content="width=device-width' "$V" || fail "/visit ohne viewport"
grep -Eo 'src="https?://[^"]*"' "$V" && fail "/visit lädt fremde Inhalte nach"
grep -Eo '[[:space:]]on[a-z]+="' "$V" && fail "Inline-Handler in /visit — die CSP blockt sie still"
grep -q '<link rel="canonical" href="https://deltatree.de/visit"' "$V" || fail "/visit: Kanonische Adresse fehlt"
grep -q 'property="og:image" content="https://deltatree.de/visit/og.png"' "$V" || fail "/visit: Vorschaubild fehlt"
grep -Eq '"@type": ?"Person"' "$V" || fail "/visit: JSON-LD Person fehlt"
grep -q 'rel="apple-touch-icon"' "$V" && grep -q 'rel="manifest"' "$V" || fail "/visit: Home-Bildschirm-Angaben fehlen"
vregel=$(curl -sI "http://127.0.0.1:$PORT/visit" | tr -d '\r' | grep -i 'content-security-policy')
[ -n "$vregel" ] || fail "/visit ohne Sicherheitsregel"
for hash in $(python3 - "$V" <<'PY'
import base64, hashlib, re, sys
roh = open(sys.argv[1], "rb").read()
for b in re.findall(rb"<script\b[^>]*>(.*?)</script>", roh, re.S):
    print("sha256-" + base64.b64encode(hashlib.sha256(b).digest()).decode())
PY
); do
  echo "$vregel" | grep -q "$hash" || fail "/visit: Skript-Hash $hash fehlt in der Sicherheitsregel"
done
curl -s -D- -o /dev/null -H 'Accept-Encoding: gzip' "http://127.0.0.1:$PORT/visit" \
  | grep -qi 'content-encoding: gzip' || fail "/visit: gzip wird nicht ausgeliefert"
typ() { curl -s -o /dev/null -w '%{http_code} %{content_type}' "http://127.0.0.1:$PORT$1"; }
case "$(typ /visit/alexander-widak.vcf)" in "200 text/vcard"*) : ;; *) fail "vCard: $(typ /visit/alexander-widak.vcf)";; esac
case "$(typ /visit/manifest.webmanifest)" in "200 application/manifest+json"*) : ;; *) fail "Manifest: $(typ /visit/manifest.webmanifest)";; esac
for f in qr.svg qr.png apple-touch-icon.png icon-192.png icon-512.png og.png photo.webp photo.jpg; do
  case "$(typ /visit/$f)" in 200\ image/*) : ;; *) fail "/visit/$f: $(typ /visit/$f)";; esac
done
curl -s "http://127.0.0.1:$PORT/visit/alexander-widak.vcf" | head -1 | grep -q '^BEGIN:VCARD' || fail "vCard beginnt nicht mit BEGIN:VCARD"
curl -s "http://127.0.0.1:$PORT/visit/alexander-widak.vcf" | grep -q '^PHOTO;ENCODING=b;TYPE=JPEG:/9j/' || fail "vCard ohne JPEG-Foto"
curl -s "http://127.0.0.1:$PORT/visit/alexander-widak.vcf" | python3 -c 'import sys; z=sys.stdin.buffer.read().split(b"\r\n"); sys.exit(any(len(l) > 75 for l in z))' \
  || fail "vCard-Zeile länger als 75 Bytes (nicht gefaltet)"
curl -s "http://127.0.0.1:$PORT/visit/manifest.webmanifest" | python3 -c 'import json,sys; m=json.load(sys.stdin); assert m["start_url"]=="/visit" and m["icons"]' \
  || fail "Manifest ungültig"
# 18: Der QR-Code zeigt genau auf die feste Adresse (dekodiert, nicht nur vorhanden).
qrinhalt=$(curl -s "http://127.0.0.1:$PORT/visit/qr.png" | docker run --rm -i alpine:3.22 sh -c 'cat > /tmp/q.png && apk add -q zbar imagemagick >/dev/null && zbarimg -q --raw /tmp/q.png' 2>/dev/null | tr -d '\r\n')
[ "$qrinhalt" = "https://deltatree.de/visit" ] || fail "QR-Code enthält '$qrinhalt' statt https://deltatree.de/visit"
echo "  Visitenkarte: Seite, Regel, vCard, Manifest, Bilder und QR-Inhalt bestätigt"
rm -f "$V"

# 22–25: SEO und KI-Auffindbarkeit, an JEDER Seite (Vorbild LYS)
B="http://127.0.0.1:$PORT"
for pfad in / /visit; do
  S="/tmp/werbung-seo-$$.html"; curl -s "$B$pfad" -o "$S"
  can=$(grep -oE '<link rel="?canonical"? href="[^"]*"' "$S" | sed -E 's/.*href="([^"]*)"/\1/')
  erwartet="https://deltatree.de$pfad"
  [ "$can" = "$erwartet" ] || fail "$pfad: canonical '$can' statt $erwartet"
  [ "$(grep -o 'application/ld+json' "$S" | wc -l | tr -d ' ')" = "1" ] || fail "$pfad: nicht genau ein JSON-LD-Block"
  grep -q '"https://deltatree.de/#organization"' "$S" || fail "$pfad: Organisation ohne gemeinsame @id"
  [ "$(grep -o '<h1' "$S" | wc -l | tr -d ' ')" = "1" ] || fail "$pfad: nicht genau eine H1"
  grep -Eq '<meta name="?description"? content="[^"]{50,}' "$S" || fail "$pfad: Beschreibung fehlt"
  grep -Eq 'property="?og:image"? content="https://' "$S" || fail "$pfad: og:image fehlt"
  grep -Eq 'property="?og:url"? content="'"$erwartet"'"' "$S" || fail "$pfad: og:url ungleich canonical"
  grep -Eq 'rel="?apple-touch-icon"?' "$S" || fail "$pfad: apple-touch-icon fehlt"
  # Ungefüllte Platzhalter in Attributen oder Text (das Skript vergleicht absichtlich mit "__DT_BUILD__").
  grep -Eq 'content="__[A-Z_]+__"|\{\{[a-zA-Z]+\}\}' "$S" && fail "$pfad: Platzhalter in der Seite"
  rm -f "$S"
done
case "$(typ /robots.txt)" in "200 text/plain"*) : ;; *) fail "robots.txt: $(typ /robots.txt)";; esac
r=$(curl -s "$B/robots.txt")
echo "$r" | grep -q '^Sitemap: https://deltatree.de/sitemap.xml$' || fail "robots.txt ohne Sitemap-Zeile"
echo "$r" | grep -q '^Disallow: /$' && fail "robots.txt sperrt alles"
echo "$r" | grep -A1 '^User-agent: \*$' | grep -q '^Content-Signal: ' || fail "Content-Signal nicht direkt unter User-agent: *"
case "$(typ /sitemap.xml)" in "200 text/xml"*|"200 application/xml"*) : ;; *) fail "sitemap.xml: $(typ /sitemap.xml)";; esac
locs=$(curl -s "$B/sitemap.xml" | grep -oE '<loc>[^<]+' | sed 's/<loc>//' | tr '\n' ' ')
[ "$locs" = "https://deltatree.de/ https://deltatree.de/visit " ] || fail "Sitemap ≠ Seitenliste: $locs"
case "$(typ /llms.txt)" in "200 text/markdown"*) : ;; *) fail "llms.txt: $(typ /llms.txt)";; esac
curl -s "$B/llms.txt" | grep -q '^# DeltaTree' || fail "llms.txt ohne Überschrift"
for f in /og.png /apple-touch-icon.png /favicon.ico; do case "$(typ $f)" in 200\ image/*) : ;; *) fail "$f: $(typ $f)";; esac; done
curl -sI "$B/og.png" | grep -qi '^cache-control: public, max-age=604800' || fail "Bilder ohne langen Cache"
curl -sI "$B/og.png" | grep -qi '^content-security-policy' || fail "Bilder ohne Sicherheitsregel"
curl -sI "$B/" | grep -qi '^x-powered-by' && fail "X-Powered-By gesetzt"
w=$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' -H 'Host: www.deltatree.de' "$B/visit?x=1")
[ "$w" = "301 https://deltatree.de/visit?x=1" ] || fail "www leitet nicht dauerhaft auf deltatree.de: $w"
code=$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' "$B/index.html")
case "$code" in "301 "*"/") : ;; *) fail "/index.html: $code";; esac
code=$(curl -s -o /dev/null -w '%{http_code}' "$B/")
[ "$code" = "200" ] || fail "/ nach index-Umleitung: $code (Schleife?)"
w=$(curl -s -o /dev/null -w '%{http_code}' -H 'Host: gartenfutter.de' "$B/")
[ "$w" = "200" ] || fail "andere Domains liefern $w"
echo "  SEO: canonical, JSON-LD, robots.txt, sitemap.xml, llms.txt, Bilder, www-Umleitung bestätigt"

rm -f "$SEITE"
echo "OK: alle Prüfungen bestanden"
