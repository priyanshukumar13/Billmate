# BillMate Frontend Dockerfile — Kubernetes variant
# Key differences from docker-compose version:
#   - VITE_API_BASE_URL is set to empty string so all API calls become relative
#     paths (/api/...) that Nginx proxies to the backend ClusterIP Service.
#   - Uses kubernetes/nginx-k8s.conf which adds the /api/ reverse-proxy block.

# ==========================================
# Stage 1: Build the Vite Multi-Page App
# ==========================================
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

# VITE_API_BASE_URL="" → all /api/... calls are relative (proxied by Nginx)
ARG VITE_API_BASE_URL=""
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

# Copy frontend source
COPY frontend/ .

# Vite production build (12-page MPA)
RUN npm run build

# ==========================================
# Stage 2: Serve with Nginx + K8s proxy config
# ==========================================
FROM nginx:alpine AS runner

# Remove default welcome page
RUN rm -rf /usr/share/nginx/html/*

# Copy Vite dist
COPY --from=builder /app/dist /usr/share/nginx/html

# Use the K8s Nginx config (includes /api/ proxy to billmate-backend:5000)
COPY kubernetes/nginx-k8s.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
