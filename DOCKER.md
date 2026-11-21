# BillMate Docker Deployment & Operations Guide

Welcome to the containerized environment for **BillMate**. This guide outlines how to build, run, test, and manage the BillMate multi-page frontend and Node.js Express backend using Docker and Docker Compose.

---

## 1. Prerequisites

- **Docker Desktop** (Engine v20.10+ / Compose v2.0+)
- **Active MongoDB Atlas Cluster** (or compatible MongoDB instance)
- **Git**

---

## 2. Architecture Overview

```
                      ┌──────────────────────────────────────┐
                      │            Docker Host               │
                      │                                      │
  Client Browser ────►│ Port 8080 ──► [Frontend (Nginx)]     │
                      │                   │                  │
  HTTP API Calls ────►│ Port 5000 ──► [Backend (Express 5)]  │
                      └───────────────────│──────────────────┘
                                          ▼
                               [MongoDB Atlas (Cloud)]
```

- **Frontend:** Multi-stage build running Vite 8 + React 19 on Node.js 22 Alpine, served by Nginx Alpine with custom multi-page routing.
- **Backend:** Node.js 22 Alpine production container running Express 5 with security headers, non-root user execution, and cold-start health monitoring.
- **Database:** Connects securely to the existing MongoDB Atlas database over SSL/TLS. No local MongoDB container is required.

---

## 3. Environment Setup

1. Verify that `backend/.env` exists. If configuring for the first time, copy from `.env.example`:
   ```bash
   cp .env.example backend/.env
   ```
2. Populate `backend/.env` with your real MongoDB Atlas credentials:
   ```properties
   MONGO_URI=mongodb+srv://<username>:<password>@cluster0.mongodb.net/billmate?retryWrites=true&w=majority
   JWT_SECRET=your_secure_jwt_secret_here
   ```
3. Ensure your MongoDB Atlas **Network Access** IP Access List allows connections from your Docker machine (or `0.0.0.0/0` with secure credentials).

---

## 4. Building and Starting Containers

### Build and Start (Foreground with logs)
```bash
docker compose up --build
```

### Start in Background (Detached mode)
```bash
docker compose up -d --build
```

Docker Compose will:
1. Build the backend image and verify dependencies.
2. Build the frontend image using multi-stage Vite bundling.
3. Start the backend container and wait until the health check (`/health`) reports `healthy`.
4. Start the frontend container and bind port `8080`.

---

## 5. Stopping Containers

- **Stop containers without removing network/volumes:**
  ```bash
  docker compose stop
  ```
- **Stop and remove containers and network:**
  ```bash
  docker compose down
  ```
- **Stop, remove containers, and purge dangling images:**
  ```bash
  docker compose down --rmi local
  ```

---

## 6. Accessing the Application

| Service | URL | Description |
| :--- | :--- | :--- |
| **Frontend Home** | `http://localhost:8080/` | Main landing page |
| **Login Page** | `http://localhost:8080/login.html` (or `http://localhost:8080/login`) | Authentication screen |
| **Signup Page** | `http://localhost:8080/signup.html` (or `http://localhost:8080/signup`) | User registration |
| **Dashboard** | `http://localhost:8080/dashboard.html` | Primary user dashboard |
| **Backend API** | `http://localhost:5000/api` | REST API base URL |
| **Backend Health** | `http://localhost:5000/health` | Service health status |
| **Frontend Health** | `http://localhost:8080/healthz` | Nginx HTTP health probe |

---

## 7. Viewing Logs & Inspecting Health

- **View live streaming logs for all services:**
  ```bash
  docker compose logs -f
  ```
- **View backend logs only:**
  ```bash
  docker compose logs -f backend
  ```
- **View frontend logs only:**
  ```bash
  docker compose logs -f frontend
  ```
- **Check container status and health:**
  ```bash
  docker compose ps
  ```

Expected health status:
```
NAME                STATUS                    PORTS
billmate-backend    Up (healthy)              0.0.0.0:5000->5000/tcp
billmate-frontend   Up (healthy)              0.0.0.0:8080->80/tcp
```

---

## 8. Rebuilding After Code Changes

When source code or dependencies are modified:

- **Rebuild both frontend and backend:**
  ```bash
  docker compose up -d --build
  ```
- **Rebuild frontend only:**
  ```bash
  docker compose up -d --build frontend
  ```
- **Rebuild backend only:**
  ```bash
  docker compose up -d --build backend
  ```

---

## 9. Troubleshooting & Common Issues

### MongoDB Atlas Connection Failure (`MongooseServerSelectionError`)
- **Symptom:** Backend container logs show `❌ DB Connection Error: Could not connect to any servers in your MongoDB Atlas cluster`.
- **Cause:** Docker containers have internal IP addresses that change dynamically. If MongoDB Atlas has an IP allowlist restricting connections to a specific residential IP, the request is blocked.
- **Fix:** In MongoDB Atlas Console → **Network Access** → Add IP Address → Click **"Allow Access from Anywhere"** (`0.0.0.0/0`) or add your current public egress IP.

### Port Conflicts (Port 5000 or 8080 already in use)
- **Symptom:** `Bind for 0.0.0.0:8080 failed: port is already allocated` or `listen tcp 0.0.0.0:8080: bind: Only one usage of each socket address...`
- **Cause:** A host service (such as Jenkins or another local web server) is occupying port 8080.
- **Fix:** Set `FRONTEND_PORT=8081` in your command or `.env`:
  ```bash
  FRONTEND_PORT=8081 docker compose up -d
  # On Windows PowerShell:
  $env:FRONTEND_PORT="8081"; docker compose up -d
  ```
  Both port 8080 and 8081 are pre-configured in backend CORS allowed origins.

### CORS Issues from Custom Frontend Ports
- **Symptom:** Browser console reports `Access to fetch has been blocked by CORS policy`.
- **Fix:** If the frontend is hosted on a custom port (e.g. `8081`), add the origin to `FRONTEND_URL` in `docker-compose.yml` or `backend/.env`:
  ```properties
  FRONTEND_URL=http://localhost:8080,http://localhost:8081
  ```

---

## 10. Protection of Android and Cloud Deployments

- **Android Capacitor:** The Android APK project located in `frontend/android/` is excluded from Docker build contexts via `frontend/.dockerignore`. The APK build process and persistent keystores remain untouched.
- **Production Website & Backend:** The production Netlify deployment (`https://billmatex.netlify.app`) and Render backend (`https://billmate-backend.onrender.com`) continue to operate independently.
