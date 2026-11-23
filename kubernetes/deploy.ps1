#!/usr/bin/env pwsh
<#
.SYNOPSIS
    BillMate Kubernetes Deployment Script for Minikube (Windows / PowerShell)
.DESCRIPTION
    1. Checks Minikube and kubectl availability
    2. Loads local Docker images into Minikube
    3. Builds the K8s-specific frontend image (relative API paths + Nginx proxy)
    4. Creates namespace, ConfigMap, and Secret (from backend/.env — no values printed)
    5. Applies all Kubernetes manifests
    6. Waits for rollouts
    7. Prints resource status and the access URL
.NOTES
    Prerequisites:
      - Minikube running  : minikube start
      - kubectl available : minikube kubectl -- OR standalone kubectl
      - backend/.env exists with MONGO_URI and JWT_SECRET populated
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ── Colour helpers ───────────────────────────────────────────────────────────
function Write-Header($msg)  { Write-Host "`n═══════ $msg ═══════" -ForegroundColor Cyan }
function Write-Ok($msg)      { Write-Host "  ✓ $msg" -ForegroundColor Green }
function Write-Warn($msg)    { Write-Host "  ⚠ $msg" -ForegroundColor Yellow }
function Write-Step($msg)    { Write-Host "  → $msg" -ForegroundColor White }
function Write-Fail($msg)    { Write-Host "  ✗ $msg" -ForegroundColor Red; throw $msg }

# ── Resolve project root ─────────────────────────────────────────────────────
$ScriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir   # kubernetes/ is one level below root
$K8sDir     = $ScriptDir
$EnvFile    = Join-Path $ProjectRoot "backend\.env"

Write-Header "BillMate Kubernetes Deployment"
Write-Step "Project root : $ProjectRoot"
Write-Step "K8s manifest : $K8sDir"
Write-Step "Env file     : $EnvFile"

# ── 1. Verify Minikube ───────────────────────────────────────────────────────
Write-Header "Step 1 — Minikube Status"
$mkStatus = minikube status --format "{{.Host}}" 2>&1
if ($mkStatus -notmatch "Running") {
    Write-Fail "Minikube is not running. Start it first: minikube start"
}
Write-Ok "Minikube is Running"

$MINIKUBE_IP = (minikube ip).Trim()
Write-Ok "Minikube IP: $MINIKUBE_IP"

# ── 2. Verify local Docker images exist ─────────────────────────────────────
Write-Header "Step 2 — Verify Local Docker Images"
$images = docker images --format "{{.Repository}}:{{.Tag}}" 2>&1
foreach ($img in @("billremainder-backend:latest", "billremainder-frontend:latest")) {
    if ($images -match [regex]::Escape($img)) {
        Write-Ok "Found: $img"
    } else {
        Write-Warn "$img not found — Docker Compose build may be needed first."
        Write-Step "Run: docker compose build"
    }
}

# ── 3. Build K8s frontend image (relative API paths + Nginx proxy) ───────────
Write-Header "Step 3 — Build Kubernetes Frontend Image"
Write-Step "Building billremainder-frontend-k8s:latest from project root..."
Write-Step "(VITE_API_BASE_URL='' so all /api/ calls are relative, proxied by Nginx)"
Push-Location $ProjectRoot
docker build `
    -f kubernetes/frontend-k8s.Dockerfile `
    --build-arg VITE_API_BASE_URL="" `
    -t billremainder-frontend-k8s:latest `
    .
if ($LASTEXITCODE -ne 0) { Write-Fail "Docker build of K8s frontend image failed." }
Write-Ok "Built billremainder-frontend-k8s:latest"
Pop-Location

# ── 4. Load images into Minikube ────────────────────────────────────────────
Write-Header "Step 4 — Load Images into Minikube"
foreach ($img in @("billremainder-backend:latest", "billremainder-frontend-k8s:latest")) {
    Write-Step "Loading $img ..."
    minikube image load $img
    if ($LASTEXITCODE -ne 0) { Write-Fail "Failed to load $img into Minikube." }
    Write-Ok "Loaded: $img"
}

# ── 5. Create Namespace ───────────────────────────────────────────────────────
Write-Header "Step 5 — Namespace"
kubectl apply -f (Join-Path $K8sDir "namespace.yaml")
Write-Ok "Namespace 'billmate' applied"

# ── 6. ConfigMap — patch FRONTEND_URL with Minikube IP ───────────────────────
Write-Header "Step 6 — ConfigMap"
$frontendUrl = "http://${MINIKUBE_IP}:30080,http://localhost:30080,http://127.0.0.1:30080"
Write-Step "Patching FRONTEND_URL = $frontendUrl"
kubectl create configmap billmate-config `
    --namespace billmate `
    --from-literal=NODE_ENV=production `
    --from-literal=PORT=5000 `
    --from-literal=FRONTEND_URL="$frontendUrl" `
    --from-literal=MOCK_EMAIL=false `
    --from-literal=DIFY_BASE_URL="https://api.dify.ai/v1" `
    --from-literal=CONTACT_TO="support@billmate.app" `
    --dry-run=client -o yaml | kubectl apply -f -
Write-Ok "ConfigMap 'billmate-config' applied"

# ── 7. Secret — from backend/.env (no values printed) ────────────────────────
Write-Header "Step 7 — Secret (from backend/.env)"
if (-not (Test-Path $EnvFile)) {
    Write-Fail "backend/.env not found at $EnvFile. Create it from .env.example first."
}

# Read all KEY=VALUE pairs from .env, skip comments and blank lines
$secretArgs = @()
Get-Content $EnvFile | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith("#") -and $line -match "=") {
        $eqIdx = $line.IndexOf("=")
        $key   = $line.Substring(0, $eqIdx).Trim()
        $val   = $line.Substring($eqIdx + 1).Trim()
        # Only include secrets (not config keys managed by ConfigMap)
        $configMapKeys = @("PORT","NODE_ENV","MOCK_EMAIL","DIFY_BASE_URL","CONTACT_TO","FRONTEND_URL")
        if ($key -notin $configMapKeys -and $key -ne "") {
            $secretArgs += "--from-literal=${key}=${val}"
        }
    }
}

if ($secretArgs.Count -eq 0) {
    Write-Fail "No secret keys found in backend/.env. Ensure MONGO_URI and JWT_SECRET are set."
}

Write-Step "Creating Secret with $($secretArgs.Count) key(s) [values hidden]..."
# Pipe through dry-run → apply so it's idempotent (create or update)
$cmd = @("kubectl","create","secret","generic","billmate-secrets","--namespace","billmate") + $secretArgs + @("--dry-run=client","-o","yaml")
& $cmd[0] $cmd[1..($cmd.Length-1)] | kubectl apply -f -
if ($LASTEXITCODE -ne 0) { Write-Fail "Failed to create/update Secret." }
Write-Ok "Secret 'billmate-secrets' applied (values not printed)"

# ── 8. Apply Deployments and Services ────────────────────────────────────────
Write-Header "Step 8 — Apply Deployments and Services"
$manifests = @(
    "backend-deployment.yaml",
    "backend-service.yaml",
    "frontend-deployment.yaml",
    "frontend-service.yaml"
)
foreach ($m in $manifests) {
    $path = Join-Path $K8sDir $m
    kubectl apply -f $path
    if ($LASTEXITCODE -ne 0) { Write-Fail "Failed to apply $m" }
    Write-Ok "Applied: $m"
}

# ── 9. Wait for Rollouts ──────────────────────────────────────────────────────
Write-Header "Step 9 — Wait for Rollouts (up to 3 minutes each)"
Write-Step "Waiting for backend rollout..."
kubectl rollout status deployment/billmate-backend --namespace billmate --timeout=180s
Write-Ok "Backend rollout complete"

Write-Step "Waiting for frontend rollout..."
kubectl rollout status deployment/billmate-frontend --namespace billmate --timeout=180s
Write-Ok "Frontend rollout complete"

# ── 10. Status Summary ────────────────────────────────────────────────────────
Write-Header "Step 10 — Resource Status"
Write-Step "Pods:"
kubectl get pods --namespace billmate -o wide

Write-Step "`nDeployments:"
kubectl get deployments --namespace billmate

Write-Step "`nServices:"
kubectl get services --namespace billmate

Write-Step "`nConfigMap:"
kubectl get configmap billmate-config --namespace billmate

Write-Step "`nSecret (keys only):"
kubectl get secret billmate-secrets --namespace billmate -o jsonpath='{.data}' | `
    node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log(Object.keys(d).join(', '));" 2>$null

# ── 11. Access URL ────────────────────────────────────────────────────────────
$accessUrl = "http://${MINIKUBE_IP}:30080"
Write-Header "BillMate is Ready!"
Write-Ok "Frontend URL : $accessUrl"
Write-Ok "Login page   : ${accessUrl}/login"
Write-Ok "Dashboard    : ${accessUrl}/dashboard"
Write-Ok "Backend API  : proxied via Nginx → billmate-backend:5000 (cluster-internal)"
Write-Ok ""
Write-Ok "To verify backend directly:"
Write-Step "kubectl port-forward svc/billmate-backend 5000:5000 -n billmate"
Write-Step "Then: curl http://localhost:5000/health"
