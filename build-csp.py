#!/usr/bin/env python3
"""Erzeugt nginx.conf aus der Vorlage und den echten Skript-Hashes der Seite.

Die Seite ist eine einzige Datei: Stil und Skript stehen darin. Eine Sicherheitsregel
(Content-Security-Policy) muss deshalb entweder jedes Inline-Skript erlauben oder die
Seite bleibt tot — der Browser blockt sie stumm.

„Jedes Inline-Skript erlauben" hieße `'unsafe-inline'`, und damit wäre die Regel für
Skripte wertlos. Stattdessen steht hier der SHA-256-Hash jedes Blocks. Der Browser führt
genau diese Bytes aus und nichts sonst.

Die Hashes ändern sich bei jedem Bau der Seite, weil das Skript die Bau-Kennung trägt.
Deshalb entstehen sie hier beim Bau des Abbilds und nicht von Hand.

Aufruf: build-csp.py <seite.html> <vorlage> <ziel>
"""
import base64
import hashlib
import re
import sys

if len(sys.argv) != 4:
    print("Aufruf: build-csp.py <seite.html> <vorlage> <ziel>", file=sys.stderr)
    sys.exit(2)

seite, vorlage, ziel = sys.argv[1], sys.argv[2], sys.argv[3]

with open(seite, "rb") as f:
    roh = f.read()

# Der Hash geht über die Bytes ZWISCHEN den Marken, ohne die Marken selbst.
bloecke = re.findall(rb"<script\b[^>]*>(.*?)</script>", roh, re.S)
if not bloecke:
    print(f"FEHLER: kein Inline-Skript in {seite} gefunden — Vorlage passt nicht mehr",
          file=sys.stderr)
    sys.exit(1)

hashes = []
for block in bloecke:
    digest = hashlib.sha256(block).digest()
    hashes.append("'sha256-" + base64.b64encode(digest).decode("ascii") + "'")

# Gleiche Blöcke nur einmal nennen, Reihenfolge bleibt lesbar.
eindeutig = list(dict.fromkeys(hashes))
skript_quellen = " ".join(["'self'"] + eindeutig)

with open(vorlage, "r", encoding="utf-8") as f:
    text = f.read()

if "__SCRIPT_SRC__" not in text:
    print(f"FEHLER: Platzhalter __SCRIPT_SRC__ fehlt in {vorlage}", file=sys.stderr)
    sys.exit(1)

with open(ziel, "w", encoding="utf-8") as f:
    f.write(text.replace("__SCRIPT_SRC__", skript_quellen))

print(f"→ {len(eindeutig)} Skript-Hash(es) in die Sicherheitsregel geschrieben")
for h in eindeutig:
    print(f"   {h}")
