# ── Estágio 1: gerar o banco SQLite a partir dos scripts oficiais ────────────
FROM node:22-slim AS db
WORKDIR /app
RUN corepack enable
COPY pnpm-workspace.yaml package.json ./
COPY packages/core/package.json packages/core/
RUN pnpm install --filter @rtc/core --ignore-scripts
COPY packages/core packages/core
COPY db/sql db/sql
RUN pnpm --filter @rtc/core exec tsx scripts/build-db.ts --out /app/db/calculadora.db

# ── Estágio 2: build da API ──────────────────────────────────────────────────
FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable
COPY pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/core packages/core
COPY apps/api apps/api
RUN pnpm install --frozen-lockfile=false
RUN pnpm --filter @rtc/core build && pnpm --filter @rtc/api build

# ── Estágio 3: runtime (API + playground estático + banco + XSDs) ────────────
FROM node:22-slim AS run
RUN apt-get update && apt-get install -y --no-install-recommends libxml2-utils && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/core/dist ./packages/core/dist
COPY --from=build /app/packages/core/package.json ./packages/core/
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/
COPY --from=build /app/apps/playground/package.json ./apps/playground/
COPY --from=db /app/db/calculadora.db ./db/calculadora.db
COPY db/xsd ./db/xsd
EXPOSE 8080
WORKDIR /app/apps/api
CMD ["node", "dist/main.js"]
