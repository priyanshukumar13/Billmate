# BillMate Backend Dockerfile
# Production-ready Node.js 22 Alpine runtime

FROM node:22-alpine AS runtime

# Set working directory
WORKDIR /app

# Set production environment defaults
ENV NODE_ENV=production
ENV PORT=5000

# Install production dependencies first (layer caching)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy application source code (backend/.dockerignore filters out secrets and unnecessary files)
COPY . .

# Ensure storage directories exist and ownership is assigned to non-root node user
RUN mkdir -p receipts reports && \
    chown -R node:node /app

# Switch to non-root user for security
USER node

# Expose backend API port
EXPOSE 5000

# Health check using existing GET /health endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/health || exit 1

# Production start command
CMD ["npm", "start"]
