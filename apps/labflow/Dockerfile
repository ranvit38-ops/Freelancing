# Labvia as one self-contained container.
#
#   docker build -t labvia apps/labflow
#   docker run -p 3001:3001 -v labvia-uploads:/data/uploads \
#     -e DATABASE_URL=... -e NEXT_PUBLIC_APP_URL=... labvia
#
# Nothing about GitHub is involved at runtime. The image holds the compiled
# server and the dependencies it actually reaches, and boots with plain node.

# ── Dependencies ──────────────────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
# `npm ci` needs a lockfile; fall back so a fresh clone without one still builds.
RUN npm ci --ignore-scripts || npm install --ignore-scripts

# ── Build ─────────────────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Pages are compiled here, so anything read at module load must parse. A
# placeholder satisfies that; the real value arrives at runtime.
ENV DATABASE_URL=postgres://build:build@127.0.0.1:5432/build
RUN npm run build

# ── Run ───────────────────────────────────────────────────────────────────
FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3001
ENV HOSTNAME=0.0.0.0
# Uploads live here. Mount a volume at this path or they vanish on redeploy.
ENV UPLOAD_DIR=/data/uploads

# Not root. A bug in a file handler should not be a bug with root's privileges.
RUN addgroup -g 1001 -S nodejs && adduser -u 1001 -S labvia -G nodejs

COPY --from=build /app/public ./public
COPY --from=build --chown=labvia:nodejs /app/.next/standalone ./
COPY --from=build --chown=labvia:nodejs /app/.next/static ./.next/static

# Migrations run on every boot. The SQL and its runner are plain files and
# plain JavaScript, so they need nothing in the image that the server does not
# already carry.
COPY --from=build /app/src/db/migrations ./src/db/migrations
COPY --from=build /app/scripts/migrate.mjs ./scripts/migrate.mjs
COPY --from=build /app/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

RUN mkdir -p /data/uploads && chown -R labvia:nodejs /data
USER labvia

EXPOSE 3001
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]
