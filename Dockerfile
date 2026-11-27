# Build the web app and check the server code. This stage runs on the machine doing the build
# (BUILDPLATFORM), once for every target: its output (the web app, the server's code and its
# packages, none of which hold machine code) is the same on amd64 and arm64. Building it under
# an arm64 emulator would give the same files, only many times slower.
FROM --platform=$BUILDPLATFORM node:22-slim AS build
WORKDIR /src/app
COPY app/package.json app/package-lock.json ./
RUN npm ci --ignore-scripts
COPY app/ ./
RUN npm run build && npm prune --omit=dev --ignore-scripts

# Run the server: the app, sign-in and sync, with the data in /data
# (works on amd64 and arm64, e.g. a Raspberry Pi)
FROM node:22-slim
ENV NODE_ENV=production PORT=8080 DATA_DIR=/data STATIC_DIR=/app/dist
WORKDIR /app
COPY --from=build /src/app/package.json ./
COPY --from=build /src/app/node_modules ./node_modules
COPY --from=build /src/app/dist ./dist
COPY --from=build /src/app/server ./server
# Shared code the server imports (rules for access and the sync format)
COPY --from=build /src/app/src/core ./src/core
RUN rm -f server/*.test.ts src/core/*.test.ts && mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://localhost:8080/api/status').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--disable-warning=ExperimentalWarning", "server/main.ts"]
