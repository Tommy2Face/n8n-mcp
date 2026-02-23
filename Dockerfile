# syntax=docker/dockerfile:1.7
# Optimized Dockerfile for n8n-mcp Node.js TypeScript server

# Stage 1: Builder - TypeScript compilation with all dependencies
FROM node:20-alpine AS builder
WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++ && \
    npm config set fetch-timeout=60000 && \
    npm config set fetch-retries=5

# Copy package files first for layer caching
COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies (including devDependencies for TypeScript)
RUN --mount=type=cache,target=/root/.npm \
    npm ci --prefer-offline --no-audit

# Copy source code
COPY src/ src/

# Build TypeScript to JavaScript
RUN npm run build

# Stage 2: Production - Runtime only
FROM node:20-alpine AS production
WORKDIR /app

LABEL org.opencontainers.image.title="n8n-mcp" \
      org.opencontainers.image.description="N8N MCP Server (HTTP mode)" \
      org.opencontainers.image.version="1.0" \
      org.opencontainers.image.vendor="Production"

# Install runtime dependencies
RUN apk add --no-cache curl sqlite dumb-init

# Create non-root user first
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy package files for production dependencies only
COPY package*.json ./

# Install only production dependencies
RUN --mount=type=cache,target=/root/.npm \
    npm ci --production --prefer-offline --no-audit && \
    npm cache clean --force

# Copy compiled JavaScript from builder
COPY --from=builder /app/dist ./dist

# Copy config and environment files
COPY .env.example ./
COPY --chown=nodejs:nodejs data/ data/

USER nodejs

EXPOSE 3000 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://127.0.0.1:3000/health || curl -f http://127.0.0.1:8080/health || exit 1

ENV MCP_MODE=http \
    USE_FIXED_HTTP=true \
    NODE_ENV=production

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/mcp/index.js"]

# Stage 3: Development - with nodemon for hot-reload
FROM node:20-alpine AS development
WORKDIR /app

# Install build dependencies and dev tools
RUN apk add --no-cache python3 make g++ curl sqlite && \
    npm config set fetch-timeout=60000 && \
    npm config set fetch-retries=5

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies (including devDependencies)
RUN --mount=type=cache,target=/root/.npm \
    npm ci --prefer-offline --no-audit

# Copy entire source
COPY src/ src/
COPY .env.example ./
COPY data/ data/

# Build once for initial state
RUN npm run build

# Set working directory ownership
RUN chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 3000 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://127.0.0.1:3000/health || curl -f http://127.0.0.1:8080/health || exit 1

ENV MCP_MODE=http \
    USE_FIXED_HTTP=true \
    NODE_ENV=development

CMD ["npm", "run", "dev:http"]
