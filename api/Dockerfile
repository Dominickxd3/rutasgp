# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# 1. Dependencias (cacheable)
# ---------------------------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY api/package.json api/
COPY web/package.json web/

RUN npm ci --workspace api --include-workspace-root

# ---------------------------------------------------------------------------
# 2. Compilación
# ---------------------------------------------------------------------------
FROM deps AS build
WORKDIR /app

COPY api api

RUN npm run build -w api

# ---------------------------------------------------------------------------
# 3. Runtime
# ---------------------------------------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY api/package.json api/
COPY web/package.json web/

RUN npm ci --omit=dev --workspace api --include-workspace-root \
  && npm cache clean --force

COPY --from=build /app/api/dist api/dist

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "api/dist/main"]
