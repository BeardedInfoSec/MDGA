# ================================================
# MDGA — Multi-stage Dockerfile
# Stage 1: build the React client (Vite → static assets in client/dist/)
# Stage 2: install server production deps
# Stage 3: runtime — Node 22 Alpine, runs server/index.js
# ================================================

# ── Stage 1: client build ──
FROM node:22-alpine AS client-builder
WORKDIR /build/client
COPY client/package*.json ./
RUN npm ci --include=dev
COPY client/ ./
RUN npm run build

# ── Stage 2: server prod deps (cached separately so app code changes don't bust deps) ──
FROM node:22-alpine AS server-deps
WORKDIR /app
COPY package*.json ./
# sharp + bcrypt may need build tools on alpine
RUN apk add --no-cache python3 make g++ \
 && npm ci --omit=dev --production \
 && apk del python3 make g++

# ── Stage 3: runtime ──
FROM node:22-alpine
WORKDIR /app

# mysql-client is handy for ad-hoc queries inside the container during dev.
RUN apk add --no-cache mysql-client tini

COPY --from=server-deps /app/node_modules ./node_modules
COPY --from=client-builder /build/client/dist ./client/dist
COPY server/ ./server/
COPY db/ ./db/
COPY package*.json ./

# Persistent dirs (mounted as volumes by docker-compose)
RUN mkdir -p /app/uploads /app/logs

EXPOSE 3000

# tini handles PID 1 signal forwarding so Ctrl-C cleanly stops the server
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server/index.js"]
