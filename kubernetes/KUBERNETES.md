# BillMate Kubernetes Deployment Guide

> **Phase 2 — Cloud-Native** running on Minikube with Docker driver.
> Phase 1 Docker Compose remains functional and unchanged.

---

## Architecture

```
Windows Host Browser
        │
        ▼ http://192.168.49.2:30080  (Minikube NodePort)
┌──────────────────────────────────────────────────────┐
│                   Minikube Cluster                   │
│  Namespace: billmate                                 │
│                                                      │
│  ┌─────────────────────────────────────────────┐    │
│  │  billmate-frontend (NodePort :30080)         │    │
│  │  Nginx:Alpine  × 2 replicas                  │    │
│  │  - Serves static MPA files                   │    │
│  │  - Proxies /api/* → billmate-backend:5000    │    │
│  └───────────────────┬─────────────────────────┘    │
│                      │ cluster-internal DNS          │
│  ┌───────────────────▼─────────────────────────┐    │
│  │  billmate-backend (ClusterIP :5000)          │    │
│  │  Node.js/Express × 3 replicas               │    │
│  └───────────────────┬─────────────────────────┘    │
└──────────────────────│───────────────────────────────┘
                       │ Atlas connection (TLS)
                  MongoDB Atlas (Cloud)
```

**Key design decision — API connectivity:**
- The Vite build injects `VITE_API_BASE_URL=""` (empty), so all API calls
  are relative paths: `fetch('/api/auth/login', ...)`.
- Nginx in the frontend pods resolves `/api/` by proxying to the backend
  `ClusterIP` Service using internal K8s DNS (`billmate-backend:5000`).
- Browsers never receive or try to reach internal K8s DNS names.
- No `/api/api` path duplication: backend routes are `/api/...` and Nginx
  rewrites to `http://billmate-backend:5000/api/...`.

---

## Prerequisites

- Minikube running: `minikube start`
- Docker Desktop running
- `kubectl` available (Docker Desktop ships it)
- `backend/.env` populated with `MONGO_URI` and `JWT_SECRET`

---

## Quick Start

```powershell
# From the project root:
.\kubernetes\deploy.ps1
```

This script:
1. Verifies Minikube is running
2. Builds the K8s-specific frontend image (`billremainder-frontend-k8s:latest`)
3. Loads both images into Minikube
4. Creates namespace, ConfigMap, and Secret (from `backend/.env` — values never printed)
5. Applies all manifests
6. Waits for rollouts
7. Prints the access URL

---

## Access URLs

| Resource | URL |
| :--- | :--- |
| **Frontend (from Windows)** | `http://$(minikube ip):30080` |
| **Login page** | `http://$(minikube ip):30080/login` |
| **Dashboard** | `http://$(minikube ip):30080/dashboard` |
| **Backend health (via proxy)** | `http://$(minikube ip):30080/api/health` |
| **Backend health (port-forward)** | See below |

```powershell
# To access backend directly:
kubectl port-forward svc/billmate-backend 5000:5000 -n billmate
# Then: http://localhost:5000/health
```

---

## Secret Management

Secrets are **never** stored in YAML files. They are created directly from `backend/.env`:

```powershell
# Initial creation (handled by deploy.ps1 automatically):
kubectl create secret generic billmate-secrets `
    --namespace billmate `
    --from-env-file=backend/.env `
    --dry-run=client -o yaml | kubectl apply -f -

# Update a single secret value:
kubectl create secret generic billmate-secrets `
    --namespace billmate `
    --from-literal=JWT_SECRET="your-new-secret-here" `
    --dry-run=client -o yaml | kubectl apply -f -

# View secret keys (not values):
kubectl get secret billmate-secrets -n billmate -o jsonpath='{.data}' | `
    node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log(Object.keys(d).join(', '))"

# Trigger pod restart after secret update:
kubectl rollout restart deployment/billmate-backend -n billmate
```

> **Git safety**: Files matching `kubernetes/*-secret*.yaml` and `kubernetes/billmate-secrets*.yaml`
> are excluded in `.gitignore`. Never commit generated Secret YAML files.

---

## Scaling

```powershell
# Scale backend to 5 replicas
kubectl scale deployment/billmate-backend --replicas=5 -n billmate

# Scale frontend to 3 replicas
kubectl scale deployment/billmate-frontend --replicas=3 -n billmate

# Check current replica count
kubectl get deployment -n billmate

# Reset to default
kubectl scale deployment/billmate-backend --replicas=3 -n billmate
kubectl scale deployment/billmate-frontend --replicas=2 -n billmate
```

---

## Self-Healing Test

```powershell
# 1. List pods
kubectl get pods -n billmate

# 2. Delete one backend pod (use an actual pod name from above)
kubectl delete pod <billmate-backend-xxxxx-yyyyy> -n billmate

# 3. Watch Kubernetes recreate it immediately
kubectl get pods -n billmate -w

# Expected: Deleted pod terminates, new pod starts within seconds
# Total ready count returns to 3/3 automatically
```

---

## Common Operations

```powershell
# View all resources in namespace
kubectl get all -n billmate

# View pod logs
kubectl logs -l component=backend -n billmate --tail=50
kubectl logs -l component=frontend -n billmate --tail=20

# Describe a pod (for debugging)
kubectl describe pod -l component=backend -n billmate

# Restart backend pods (e.g. after secret update)
kubectl rollout restart deployment/billmate-backend -n billmate

# Restart frontend pods
kubectl rollout restart deployment/billmate-frontend -n billmate

# Check rollout history
kubectl rollout history deployment/billmate-backend -n billmate
```

---

## Teardown

```powershell
# Delete all BillMate K8s resources (namespace and everything in it):
kubectl delete namespace billmate

# Stop Minikube (preserves state):
minikube stop

# Delete Minikube cluster entirely:
minikube delete
```

---

## Troubleshooting

### Pods stuck in `Pending`
- Minikube may be low on memory: `minikube stop && minikube start --memory=3000`
- Check events: `kubectl describe pod -l app=billmate -n billmate`

### `ErrImageNeverPull` / `ErrImagePull`
- Image wasn't loaded into Minikube: `minikube image load billremainder-backend:latest`
- Verify: `minikube image ls | Select-String billremainder`

### Backend CrashLoopBackOff
- Check secret is populated: `kubectl get secret billmate-secrets -n billmate`
- View crash logs: `kubectl logs -l component=backend -n billmate --previous`

### `/api/` returns 502 Bad Gateway
- Backend pods not ready yet — wait and retry: `kubectl get pods -n billmate`
- Check backend logs: `kubectl logs -l component=backend -n billmate`

### CORS errors in browser console
- The Nginx proxy eliminates browser-side CORS issues since the frontend origin
  makes same-origin requests to `/api/`. If CORS errors appear, check that the
  browser is accessing the frontend via the Minikube IP (not localhost).

---

## Files Created

| File | Description |
| :--- | :--- |
| `kubernetes/namespace.yaml` | `billmate` namespace |
| `kubernetes/configmap.yaml` | Non-sensitive config (NODE_ENV, PORT, FRONTEND_URL) |
| `kubernetes/backend-deployment.yaml` | Backend Deployment, 3 replicas, probes |
| `kubernetes/backend-service.yaml` | Backend ClusterIP Service (:5000) |
| `kubernetes/frontend-deployment.yaml` | Frontend Deployment, 2 replicas, probes |
| `kubernetes/frontend-service.yaml` | Frontend NodePort Service (:30080) |
| `kubernetes/nginx-k8s.conf` | Nginx config with `/api/` reverse proxy |
| `kubernetes/frontend-k8s.Dockerfile` | Multi-stage Dockerfile (empty API URL + K8s Nginx) |
| `kubernetes/deploy.ps1` | Full deployment PowerShell script |
| `kubernetes/KUBERNETES.md` | This guide |
| `.dockerignore` | Root-level build context exclusions |

---

## Non-Regression Guarantees

- **Docker Compose**: Unchanged. `docker compose up -d` still works on port 8081.
- **Netlify production**: `https://billmatex.netlify.app` unaffected.
- **Render production backend**: `https://billmate-backend.onrender.com` unaffected.
- **Android APK**: Capacitor configuration and signing keys untouched.
- **MongoDB Atlas**: No schema changes, no data migration.

---

## Phase 3 — Automated Kubernetes Continuous Deployment

The CD workflow is [`.github/workflows/cd.yml`](../.github/workflows/cd.yml). It runs
only after the separate **Docker publish** workflow completes successfully for
`main`. It does not build or publish images itself.

### Windows self-hosted runner setup

1. Install Docker Desktop and enable the Docker Engine.
2. Install and start Minikube with the Docker driver:

   ```powershell
   minikube start --driver=docker --profile=minikube
   ```

3. Install `kubectl` and Minikube, then add both executables to `PATH`.
4. Confirm the runner can execute Docker Desktop commands in an interactive
   session used by GitHub Actions:

   ```powershell
   docker info
   minikube status --profile=minikube
   kubectl config current-context
   kubectl cluster-info
   ```

5. Keep `kubectl`'s active context set to `minikube`.
6. Configure a GitHub Actions runner with these labels:

   - `self-hosted`
   - `Windows`
   - `X64`

7. Start the runner as a service or interactive user that can access Docker
   Desktop and execute `docker`, `minikube`, and `kubectl`.

The CD workflow fails if Docker, Minikube, kubectl, or the Kubernetes API is
unavailable. It never calls `minikube delete`, `minikube start`, or any cluster
destructive command. It also checks the kubectl client against the Kubernetes
API server version and stops if their major versions differ or their minor
versions differ by more than one. The existing Minikube cluster is expected to
run Kubernetes v1.37.0.

### Required GitHub permissions

- Repository Actions must allow workflows to run.
- The workflow uses the built-in `GITHUB_TOKEN`.
- Repository Actions permissions need:
  - `contents: read`
  - `actions: read`
  - `packages: read`
- The package workflow needs `packages: write`.
- GHCR package access must allow the repository to read and publish the two
  `billmate-*` packages.
- No personal access token is required.

### Trigger and deployment sequence

The workflow triggers after the **Docker publish** workflow completes. It is
guarded by both a successful conclusion and `head_branch == main`.

It then:

1. Checks out the exact commit SHA from the successful publishing run.
2. Rechecks the latest successful publishing SHA for `main`.
3. Authenticates to GHCR with `GITHUB_TOKEN`.
4. Pulls SHA-tagged backend and frontend images.
5. Loads those exact images into the Minikube profile.
6. Updates the existing `billmate-backend` and `billmate-frontend` deployments.
7. Waits for rollouts and verifies Ready pods and service endpoints.

The frontend update always uses the Kubernetes-specific image built with
`kubernetes/frontend-k8s.Dockerfile`. Its Nginx configuration continues to
proxy `/api/` to `billmate-backend:5000`.

### Monitoring deployment status

In GitHub Actions:

1. Open **Actions**.
2. Select **BillMate Kubernetes CD**.
3. Open the successful or failed workflow run.
4. Review rollout, pod, and service status in the final step and failure step logs.

On Windows:

```powershell
kubectl get deployments,pods,services,endpoints -n billmate -o wide
kubectl rollout status deployment/billmate-backend -n billmate --timeout=180s
kubectl rollout status deployment/billmate-frontend -n billmate --timeout=180s
kubectl get pods -n billmate
```

### Rollback

Rollback is performed manually and only changes the existing deployment:

```powershell
kubectl rollout undo deployment/billmate-backend -n billmate
kubectl rollout undo deployment/billmate-frontend -n billmate

kubectl rollout status deployment/billmate-backend -n billmate --timeout=180s
kubectl rollout status deployment/billmate-frontend -n billmate --timeout=180s
```

View deployment history without changing it:

```powershell
kubectl rollout history deployment/billmate-backend -n billmate
kubectl rollout history deployment/billmate-frontend -n billmate
```

### Troubleshooting

**Workflow skipped**
- Confirm the Docker publish workflow name is exactly `Docker publish`.
- Confirm publishing completed successfully on `main`.
- Confirm no newer successful publish exists for the same branch.

**No runner available**
- Register a runner with `self-hosted`, `Windows`, and `X64` labels.
- Confirm the runner is online and its service/user can access Docker Desktop.

**Docker Desktop unavailable**

```powershell
docker info
```

Start Docker Desktop, then restart the self-hosted runner if it was already
running before Docker became available.

**Minikube unavailable**

```powershell
minikube status --profile=minikube
kubectl config current-context
```

Do not recreate Minikube to repair ordinary CD failures.

**Wrong Kubernetes context**

```powershell
kubectl config use-context minikube
kubectl cluster-info
```

**Missing namespace or deployments**

```powershell
kubectl get namespace billmate
kubectl get deployments -n billmate
```

Apply the existing namespace/manifests only if the cluster is missing its
base BillMate resources. Never use destructive namespace deletion as a repair step.

**Pod or rollout failure**

```powershell
kubectl describe deployment billmate-backend -n billmate
kubectl describe deployment billmate-frontend -n billmate
kubectl get pods -n billmate
kubectl logs -l component=backend -n billmate --tail=100
kubectl logs -l component=frontend -n billmate --tail=100
```
