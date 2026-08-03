# Multi-stage build for security and size optimization
FROM node:22-alpine AS builder

# Install pnpm
RUN npm install -g pnpm

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./

# Install dependencies (use --force to recreate lockfile if needed)
RUN pnpm install --frozen-lockfile --trust-lockfile || pnpm install --force --trust-lockfile

# Copy source code
COPY src ./src

# Build the application
RUN pnpm run build

# Production stage
FROM node:22-alpine AS production

# Install pnpm
RUN npm install -g pnpm

# Create non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup -u 1001

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Install only production dependencies (use --force to recreate lockfile if needed)
RUN pnpm install --frozen-lockfile --prod --trust-lockfile || pnpm install --force --prod --trust-lockfile

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Create logs directory and set permissions
RUN mkdir -p logs && chown -R appuser:appgroup /app

# Change ownership to non-root user
RUN chown -R appuser:appgroup /app

# Switch to non-root user
USER appuser

# Set environment variables (can be overridden)
ENV NODE_ENV=production

# Expose port
EXPOSE 3000

# Add health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start the application
CMD ["node", "dist/app.js"]