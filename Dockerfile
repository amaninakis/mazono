# Build the web app
FROM node:22-slim AS build
WORKDIR /src/app
COPY app/package.json app/package-lock.json ./
RUN npm ci
COPY app/ ./
RUN npm run build

# Serve it with Caddy (works on amd64 and arm64, e.g. Raspberry Pi)
FROM caddy:2-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /src/app/dist /srv
ENV SITE_ADDRESS=:80
EXPOSE 80 443
