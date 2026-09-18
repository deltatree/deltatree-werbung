# deltatree-werbung

Werbeseite für DeltaTree und die Hosting-Plattform DTAdmin.
Die Seite ist statisch und läuft in einem nginx-Container auf Port 8080.

- Anforderungen: `SPEC.md`
- Lokal bauen und prüfen: `docker build -t deltatree-werbung:test . && sh test/check.sh deltatree-werbung:test`
- Abbild: `ghcr.io/deltatree/deltatree-werbung:latest`, gebaut bei jedem Push auf `main`
