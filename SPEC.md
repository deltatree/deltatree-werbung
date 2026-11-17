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
4. Die Seite hat Impressum, Datenschutzerklärung, AGB und Auftragsverarbeitung.
   Alle vier stehen **in** der Seite; alte Links auf `impressum.html` und
   `datenschutz.html` werden auf den passenden Anker umgeleitet.
5. Die Seite setzt keine Cookies und lädt nichts von fremden Servern nach.
   Ein Link auf einen fremden Server ist erlaubt — die EU-Schlichtungsstelle
   muss im Impressum verlinkt sein.
6. Die Seite behauptet keine Zahlen, die niemand belegen kann.
7. Die Seite folgt dem hellen oder dunklen Modus des Geräts.
8. Das Abbild läuft ohne Root-Rechte und antwortet auf Port 8080.
9. Jeder Stand auf `main` erzeugt ein Abbild unter
   `ghcr.io/deltatree/deltatree-werbung:latest`.
10. Die Sicherheitsregel (Content-Security-Policy) erlaubt **kein** beliebiges
    Inline-Skript. Sie nennt den SHA-256-Hash jedes Skriptblocks der Seite.
    Die Hashes entstehen beim Bau des Abbilds, nicht von Hand.
11. Die Seite prüft live, ob Anwendung und Schnittstelle erreichbar sind. Diese
    Ziele stehen in `connect-src`; fehlt eines, zeigte die Seite dauerhaft
    „offline", ohne dass ein Fehler sichtbar wäre.
12. Die Seite ist **eine** Datei. Vorgepackte Fassungen (`.gz`, `.br`) liegen
    daneben und werden ausgeliefert, statt bei jeder Anfrage neu zu packen.
13. Die Seite zeigt **keinen** Hinweis „neue Version". Der Server liefert
    `Cache-Control: no-cache` und einen ETag: Jeder Aufruf fragt kurz nach und
    erhält einen neuen Stand sofort, einen unveränderten als 304.
14. Das Menü passt auf ein Telefon ab 390 Pixel ohne angeschnittenen Punkt. Ab
    320 Pixel ist es waagerecht wischbar, und der aktive Punkt rückt ins Bild.
15. Wer scrollt statt klickt, sieht den Menüpunkt des sichtbaren Abschnitts
    unterstrichen (`aria-current`). Hover unterstreicht, statt hell zu hinterlegen.
16. Das Cluster-Bild im Kopf der Seite ist sichtbar und reagiert auf Tippen — auch
    mit der Geräte-Einstellung „Bewegung reduzieren". Dann erscheint es ruhig und
    fertig aufgebaut statt animiert.

17. Unter der festen Adresse `/visit` steht eine digitale Visitenkarte von Alexander Widak mit
    Werbung für DeltaTree und DTAdmin. `/visit/` leitet relativ auf `/visit` um.
18. Ein QR-Code zeigt dauerhaft auf `https://deltatree.de/visit` und ist als SVG und PNG ladbar.
    Keine Eingabe auf der Seite ändert dieses Ziel.
19. Die Seite bietet eine vCard (`text/vcard`) zum Download. Alle Felder sind vorher änderbar;
    die Eingaben verlassen das Gerät nicht.
20. Teilen nutzt die Web Share API (Adresse und vCard-Datei), sonst wird der Link kopiert.
21. Manifest, Apple-Icon und ein Hinweis für das iPhone erlauben „Zum Home-Bildschirm“. Titel,
    Beschreibung, kanonische Adresse, Open Graph mit Vorschaubild und JSON-LD sind gesetzt.
    Für `/visit` gelten 3, 5, 10 und 12 ebenso.

## Abnahme

- `test/check.sh` prüft die Anforderungen 3 bis 6, 8 und 10 bis 13 gegen das
  **gebaute Abbild**, nicht gegen die Quelle.
- Die Prüfung der Sicherheitsregel leitet Skript-Hashes und Statusziele **aus
  der ausgelieferten Seite** ab. Eine geänderte Seite ohne passende Regel macht
  den Bau rot. Gegenprobe gemacht: beide Wachen schlagen an.
- `test/nav.sh` prüft 14 bis 16 im echten Browser (Playwright in Docker, 320 und 390 Pixel) und mit
  `test/visit.mjs` 17 bis 21: keine CSP-Meldung, vCard (Standard und angepasst), Teilen, iPhone-Hinweis.
- `test/check.sh` dekodiert den QR-Code und vergleicht ihn mit `https://deltatree.de/visit`.

## Offene Fragen

- Der Betreiber prüft die Texte von Impressum, Datenschutz, AGB und
  Auftragsverarbeitung rechtlich.

## Herkunft der Seite

Die Seite entsteht in `webseite-deltatree.de/webseite_neu` und wird dort mit
`build.sh` verkleinert und mit einer Bau-Kennung versehen. Übernommen wird der
Inhalt von `dist/` — `index.html` samt `.gz` und `.br`.
