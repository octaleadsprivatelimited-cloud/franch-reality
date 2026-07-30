# syntax=docker/dockerfile:1
# Multi-stage build producing Next.js' self-contained "standalone" server for
# Azure Container Apps. Prisma client + query engine (linux-musl) are generated in
# the alpine builder and carried into the runner.

# ---- deps ----
FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY package.json package-lock.json ./
RUN npm ci

# ---- builder ----
FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Dummy values so env validation passes at build time — NOT used at runtime
# (Container Apps injects the real secrets). Build never connects to the DB.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" npx prisma generate
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" \
    AUTH_SECRET="build-time-placeholder-not-used-at-runtime-000" \
    CRON_SECRET="build-time-placeholder-not-used-at-runtime-000" \
    npm run build

# ---- runner ----
FROM node:22-alpine AS runner
WORKDIR /app
RUN apk add --no-cache openssl
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

# Next standalone output + static assets + public dir.
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
# Prisma schema + generated client + engine (ensure they're present at runtime).
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
