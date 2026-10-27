# ==========================================
# Production Dockerfile for Barber Shop API
# ==========================================

# Stage 1: Builder
FROM node:20-alpine AS builder

WORKDIR /app

# Install native compilation dependencies for argon2 and sharp
RUN apk add --no-cache python3 make g++

# Copy package manifests
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/

# Install all dependencies (including devDependencies for TypeScript compilation)
RUN npm ci

# Copy sources
COPY tsconfig.json ./
COPY packages/shared/ ./packages/shared/
COPY apps/api/ ./apps/api/

# Build shared library and API application
RUN npm run build -w @barbershop/shared
RUN npm run build -w @barbershop/api

# Prune development dependencies to keep production footprint minimal
RUN npm prune --omit=dev

# Stage 2: Production Runner
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

# Install curl for container health check
RUN apk add --no-cache curl

# Run as non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs

# Copy root manifests and pruned node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules

# Copy shared library package
COPY --from=builder /app/packages/shared ./packages/shared

# Copy API artifacts and migrations
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/migrations ./apps/api/migrations
COPY --from=builder /app/apps/api/docker-entrypoint.sh ./apps/api/docker-entrypoint.sh

RUN chmod +x ./apps/api/docker-entrypoint.sh
RUN chown -R nestjs:nodejs /app

USER nestjs

WORKDIR /app/apps/api

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:4000/api/v1/health || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]
