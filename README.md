# deltatree-werbung

Werbeseite für DeltaTree und die Hosting-Plattform DTAdmin. Sie ist zugleich die
Seite unter `deltatree.de` und die Standardseite jeder Domain ohne eigenen
Inhalt (etwa `gartenfutter.de`).

Die Seite ist **eine** statische Datei und läuft in einem nginx-Container auf
Port 8080.

## Sicherheitsregel

Stil und Skript stehen in der Seite. Die Content-Security-Policy erlaubt
deshalb **nicht** beliebiges Inline-Skript, sondern nennt den SHA-256-Hash
jedes Blocks. `build-csp.py` erzeugt sie beim Bau des Abbilds aus
`nginx.conf.template`. Von Hand gepflegte Hashes wären beim nächsten Bau der
Seite falsch.

## Seite austauschen

1. Neue Seite in `webseite-deltatree.de/webseite_neu` bauen (`build.sh`).
2. `dist/index.html`, `dist/index.html.gz` und `dist/index.html.br` nach `site/`
   kopieren.
3. Bauen und prüfen (siehe unten). Die Prüfung leitet Hashes und Statusziele aus
   der Seite ab — ein vergessener Schritt macht den Bau rot.
4. Auf `main` schieben. Die sieben `werbung`-Deployments haben **keinen**
   Poll-Auslöser und brauchen danach einen Neustart.

- Anforderungen: `SPEC.md`
- Lokal bauen und prüfen: `docker build -t deltatree-werbung:test . && sh test/check.sh deltatree-werbung:test`
- Menü im Browser prüfen: `sh test/nav.sh deltatree-werbung:test` (läuft ganz in Docker)
- Abbild: `ghcr.io/deltatree/deltatree-werbung:latest`, gebaut bei jedem Push auf `main`
