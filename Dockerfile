# Die Sicherheitsregel entsteht aus der Seite selbst: build-csp.py liest jedes
# Inline-Skript und schreibt dessen SHA-256-Hash in die Regel. Deshalb ein
# Bau-Schritt davor, statt die Hashes von Hand zu pflegen.
FROM python:3.12-alpine AS regel
WORKDIR /bau
COPY site/index.html nginx.conf.template build-csp.py ./
RUN python3 build-csp.py index.html nginx.conf.template nginx.conf

FROM nginxinc/nginx-unprivileged:1.29-alpine
COPY --from=regel /bau/nginx.conf /etc/nginx/conf.d/default.conf
COPY site/ /usr/share/nginx/html/
EXPOSE 8080
