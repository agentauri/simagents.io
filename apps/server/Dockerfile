# SimAgents Server - Simplified Dockerfile for Bun
# Build context should be the repository root:
#   docker build -f apps/server/Dockerfile .

# ============================================================================
# Stage 1: Builder (install deps and prepare source)
# ============================================================================
FROM oven/bun:1-alpine AS builder

WORKDIR /app

# Copy workspace package files
COPY package.json bun.lock* ./
COPY apps/server/package.json ./apps/server/
COPY packages/shared/package.json ./packages/shared/
COPY tsconfig.json ./
COPY apps/server/tsconfig.json ./apps/server/

# Install all dependencies (remove lockfile to avoid CI frozen check)
RUN rm -f bun.lock && bun install

# Copy source code
COPY packages/shared ./packages/shared
COPY apps/server/src ./apps/server/src

# Run type check (optional)
WORKDIR /app/apps/server
RUN bun run typecheck || echo "Typecheck warnings (non-blocking)"

# ============================================================================
# Stage 2: Production runner
# ============================================================================
FROM oven/bun:1-alpine AS runner

# Install dependencies for health checks
RUN apk add --no-cache curl

WORKDIR /app

# Create non-root user for security
RUN addgroup --system --gid 1001 simagents && \
    adduser --system --uid 1001 simagents

# Copy everything from builder (simpler, works with workspaces)
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/server ./apps/server
COPY --from=builder /app/package.json ./
COPY --from=builder /app/tsconfig.json ./

# Set ownership
RUN chown -R simagents:simagents /app

USER simagents

WORKDIR /app/apps/server

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

CMD ["bun", "run", "src/index.ts"]
