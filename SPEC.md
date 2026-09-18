# Spezifikation: DeltaTree-Werbeseite

## Was

Eine öffentliche Webseite wirbt für DeltaTree und die Plattform DTAdmin.
Sie läuft unter vielen Domains gleichzeitig. Jede Domain zeigt dieselbe Seite.

## Warum

Viele Domains zeigen heute nur eine Wartungsseite oder einen Fehler.
Eine Werbeseite nutzt diese Domains sinnvoll und bringt neue Kunden.

## Anforderungen

1. Die Seite erklärt in einfachen Worten, was DTAdmin kann.
2. Die Seite zeigt den Einstiegspreis und führt zur Anmeldung.
3. Die Seite funktioniert auf dem Telefon ab 320 Pixel Breite ohne seitliches Scrollen.
4. Die Seite hat ein Impressum und eine Datenschutzerklärung.
5. Die Seite setzt keine Cookies und lädt nichts von fremden Servern.
6. Die Seite behauptet keine Zahlen, die niemand belegen kann.
7. Die Seite folgt dem hellen oder dunklen Modus des Geräts.
8. Das Abbild läuft ohne Root-Rechte und antwortet auf Port 8080.
9. Jeder Stand auf `main` erzeugt ein Abbild unter
   `ghcr.io/deltatree/deltatree-werbung:latest`.

## Abnahme

- `test/check.sh` prüft Anforderungen 3 bis 6 und 8 gegen das gebaute Abbild.

## Offene Fragen

- Der Betreiber prüft die Texte von Impressum und Datenschutz rechtlich.
