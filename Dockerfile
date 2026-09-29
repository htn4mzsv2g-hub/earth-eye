# syntax=docker/dockerfile:1.7
#
# Earth Eye production image (Fly.io or any container host).
#
#   build:  npm ci -> vite build (dist/) -> prune dev dependencies
#   run:    node server/prod.mjs as the unprivileged `node` user, port 8080
#
# CESIUM_ION_TOKEN and GOOGLE_MAPS_API_KEY are BROWSER keys that Vite inlines
# into the client bundle at build time (build/vite.js `define`). They are
# passed as optional BuildKit secrets so they never land in an image layer or
# the build history — but they ARE visible in the served JavaScript by design,
# so restrict them (Google: HTTP referrer eartheye.us; Cesium ion: allowed
# URLs). With fly: `fly deploy --build-secret CESIUM_ION_TOKEN=... ...`.
# Every other key is a runtime secret (`fly secrets set`), read server-side.

ARG NODE_IMAGE=node:24-slim

FROM ${NODE_IMAGE} AS build
WORKDIR /app
ENV CI=true \
    PUPPETEER_SKIP_DOWNLOAD=1 \
    npm_config_update_notifier=false \
    npm_config_fund=false \
    npm_config_audit=false
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN --mount=type=secret,id=CESIUM_ION_TOKEN,required=false \
    --mount=type=secret,id=GOOGLE_MAPS_API_KEY,required=false \
    if [ -s /run/secrets/CESIUM_ION_TOKEN ]; then export CESIUM_ION_TOKEN="$(cat /run/secrets/CESIUM_ION_TOKEN)"; fi; \
    if [ -s /run/secrets/GOOGLE_MAPS_API_KEY ]; then export GOOGLE_MAPS_API_KEY="$(cat /run/secrets/GOOGLE_MAPS_API_KEY)"; fi; \
    npm run build \
 && npm prune --omit=dev \
 && rm -rf node_modules/.vite node_modules/.vite-build node_modules/.cache

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends gosu \
 && rm -rf /var/lib/apt/lists/*
# Server code reads src/ data modules and scripts/ helpers at runtime, so the
# whole pruned tree is copied (not just dist/). Owned by `node` so the
# provider disk caches (.gev-cache/) can be written.
COPY --from=build --chown=node:node /app /app
# Entrypoint runs as root only to chown the Fly volume mount, then drops to node.
USER root
RUN mkdir -p /data/collection && chown -R node:node /data
COPY server/docker-entrypoint.sh /usr/local/bin/ee-entrypoint.sh
RUN chmod +x /usr/local/bin/ee-entrypoint.sh
EXPOSE 8080
# Node is PID 1 after entrypoint exec (graceful SIGTERM/SIGINT).
ENTRYPOINT ["/usr/local/bin/ee-entrypoint.sh"]
CMD ["node", "server/prod.mjs"]
