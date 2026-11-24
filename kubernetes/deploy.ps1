#!/usr/bin/env pwsh
<#
.SYNOPSIS
    BillMate Kubernetes deployment script for Minikube on Windows.
.NOTES
    Requires Minikube, Docker, and kubectl in PATH.
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-Header([string]$Message) {
    Write-Host "`n======= $Message =======" -ForegroundColor Cyan
}

function Write-Ok([string]$Message) {
    Write-Host "  [OK] $Message" -ForegroundColor Green
}

function Write-Warn([string]$Message) {
    Write-Host "  [WARN] $Message" -ForegroundColor Yellow
}

function Write-Step([string]$Message) {
    Write-Host "  -> $Message" -ForegroundColor White
}

function Write-Fail([string]$Message) {
    Write-Host "  [FAIL] $Message" -ForegroundColor Red
    throw $Message
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$K8sDir = $ScriptDir
$EnvFile = Join-Path $ProjectRoot 'backend\.env'

Write-Header 'BillMate Kubernetes Deployment'
Write-Step ('Project root: ' + $ProjectRoot)
Write-Step ('K8s manifest: ' + $K8sDir)
Write-Step ('Env file: ' + $EnvFile)

Write-Header 'Step 1 - Verify tools and Minikube'
foreach ($requiredCommand in @('minikube', 'kubectl', 'docker')) {
    if (-not (Get-Command $requiredCommand -ErrorAction SilentlyContinue)) {
        Write-Fail ('Required command not found in PATH: ' + $requiredCommand)
    }
}

$minikubeStatus = & minikube status --format '{{.Host}}' 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Fail 'Unable to query Minikube status. Start it with: minikube start'
}
if ($minikubeStatus -notmatch 'Running') {
    Write-Fail 'Minikube is not running. Start it with: minikube start'
}
Write-Ok 'Minikube is running.'

$minikubeIp = (& minikube ip).Trim()
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($minikubeIp)) {
    Write-Fail 'Unable to determine the Minikube IP.'
}
Write-Ok ('Minikube IP: ' + $minikubeIp)

Write-Header 'Step 2 - Verify the required backend image'
$images = & docker images --format '{{.Repository}}:{{.Tag}}' 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Fail 'Unable to query local Docker images.'
}
if ($images -notcontains 'billremainder-backend:latest') {
    Write-Fail 'billremainder-backend:latest was not found. Build it before deploying.'
}
Write-Ok 'Found billremainder-backend:latest.'

Write-Header 'Step 3 - Build Kubernetes frontend image'
Write-Step 'Building billremainder-frontend-k8s:latest from project root.'
Write-Step 'Using an empty VITE_API_BASE_URL for same-origin /api requests.'

Push-Location $ProjectRoot
& docker build `
    -f kubernetes/frontend-k8s.Dockerfile `
    --build-arg VITE_API_BASE_URL='' `
    -t billremainder-frontend-k8s:latest `
    .
$dockerBuildExitCode = $LASTEXITCODE
Pop-Location

if ($dockerBuildExitCode -ne 0) {
    Write-Fail 'Docker build of billremainder-frontend-k8s:latest failed.'
}

$k8sImage = & docker image inspect billremainder-frontend-k8s:latest 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Fail 'Required image billremainder-frontend-k8s:latest was not created.'
}
Write-Ok 'Built and found billremainder-frontend-k8s:latest.'

Write-Header 'Step 4 - Load images into Minikube'
foreach ($imageName in @(
    'billremainder-backend:latest',
    'billremainder-frontend-k8s:latest'
)) {
    Write-Step ('Loading ' + $imageName)
    & minikube image load $imageName
    if ($LASTEXITCODE -ne 0) {
        Write-Fail ('Failed to load ' + $imageName + ' into Minikube.')
    }
    Write-Ok ('Loaded ' + $imageName)
}

Write-Header 'Step 5 - Apply namespace'
& kubectl apply -f (Join-Path $K8sDir 'namespace.yaml')
if ($LASTEXITCODE -ne 0) {
    Write-Fail 'Failed to apply namespace.yaml.'
}
Write-Ok 'Namespace billmate applied.'

Write-Header 'Step 6 - Apply ConfigMap'
$frontendUrl = 'http://' + $minikubeIp + ':30080,http://localhost:30080,http://127.0.0.1:30080'
Write-Step ('Patching FRONTEND_URL with the Minikube IP.')

$configMapArgs = @(
    'create',
    'configmap',
    'billmate-config',
    '--namespace',
    'billmate',
    '--from-literal=NODE_ENV=production',
    '--from-literal=PORT=5000',
    ('--from-literal=FRONTEND_URL=' + $frontendUrl),
    '--from-literal=MOCK_EMAIL=false',
    '--from-literal=DIFY_BASE_URL=https://api.dify.ai/v1',
    '--from-literal=CONTACT_TO=support@billmate.app'
)

$configMapYaml = & kubectl @configMapArgs --dry-run=client -o yaml
$createConfigMapExitCode = $LASTEXITCODE
if ($createConfigMapExitCode -ne 0) {
    Write-Fail 'Failed to generate the billmate-config ConfigMap YAML.'
}

$configMapYaml | & kubectl apply -f -
$applyConfigMapExitCode = $LASTEXITCODE
if ($applyConfigMapExitCode -ne 0) {
    Write-Fail 'Failed to apply the billmate-config ConfigMap.'
}
Write-Ok 'ConfigMap billmate-config applied.'

Write-Header 'Step 7 - Create Secret from backend/.env'
if (-not (Test-Path $EnvFile)) {
    Write-Fail ('backend/.env not found at ' + $EnvFile)
}

$allowedSecretKeys = @(
    'MONGO_URI',
    'JWT_SECRET',
    'RESEND_API_KEY',
    'RESEND_FROM_EMAIL',
    'GEMINI_API_KEY',
    'DIFY_API_KEY'
)
$secretValues = @{}

foreach ($rawLine in Get-Content $EnvFile) {
    $line = $rawLine.Trim()
    if (-not $line -or $line.StartsWith('#')) {
        continue
    }
    if ($line -match '^export\s+') {
        $line = ($line -replace '^export\s+', '').Trim()
    }
    if ($line -notmatch '=') {
        continue
    }

    $equalsIndex = $line.IndexOf('=')
    $key = $line.Substring(0, $equalsIndex).Trim()
    $value = $line.Substring($equalsIndex + 1).Trim()

    if ($key -notmatch '^[A-Za-z_][A-Za-z0-9_]*$') {
        continue
    }
    if ($key -notin $allowedSecretKeys) {
        continue
    }

    if ($value.StartsWith('"') -or $value.StartsWith("'")) {
        $quoteCharacter = $value.Substring(0, 1)
        $closingQuoteIndex = $value.IndexOf($quoteCharacter, 1)
        if ($closingQuoteIndex -ge 1) {
            $remainder = $value.Substring($closingQuoteIndex + 1).Trim()
            if (-not $remainder -or $remainder.StartsWith('#')) {
                $value = $value.Substring(1, $closingQuoteIndex - 1)
            }
        }
    } elseif ($value -match '^(.*?)\s+#.*$') {
        $value = $Matches[1].TrimEnd()
    }

    $secretValues[$key] = $value
}

foreach ($requiredKey in @('MONGO_URI', 'JWT_SECRET')) {
    if (-not $secretValues.ContainsKey($requiredKey) -or
        [string]::IsNullOrWhiteSpace($secretValues[$requiredKey])) {
        Write-Fail ('Required secret is missing or empty in backend/.env: ' + $requiredKey)
    }
}

$includedKeys = @($allowedSecretKeys | Where-Object { $secretValues.ContainsKey($_) })
if ($includedKeys.Count -eq 0) {
    Write-Fail 'No permitted secret keys were found in backend/.env.'
}

$tempEnvFile = [System.IO.Path]::GetTempFileName()
try {
    $tempLines = foreach ($key in $includedKeys) {
        $key + '=' + $secretValues[$key]
    }
    [System.IO.File]::WriteAllLines(
        $tempEnvFile,
        [string[]]$tempLines,
        [System.Text.UTF8Encoding]::new($false)
    )

    Write-Step ('Creating Secret with ' + $includedKeys.Count + ' permitted key(s); values are hidden.')
    & kubectl create secret generic billmate-secrets `
        --namespace billmate `
        --from-env-file=$tempEnvFile `
        --dry-run=client -o yaml | & kubectl apply -f -
    if ($LASTEXITCODE -ne 0) {
        Write-Fail 'Failed to create or update billmate-secrets.'
    }
    Write-Ok 'Secret billmate-secrets applied; values were not printed.'
} finally {
    Remove-Item -LiteralPath $tempEnvFile -Force -ErrorAction SilentlyContinue
}

Write-Header 'Step 8 - Apply Deployments and Services'
$manifests = @(
    'backend-deployment.yaml',
    'backend-service.yaml',
    'frontend-deployment.yaml',
    'frontend-service.yaml'
)
foreach ($manifestName in $manifests) {
    $manifestPath = Join-Path $K8sDir $manifestName
    & kubectl apply -f $manifestPath
    if ($LASTEXITCODE -ne 0) {
        Write-Fail ('Failed to apply ' + $manifestName)
    }
    Write-Ok ('Applied ' + $manifestName)
}

Write-Header 'Step 9 - Wait for rollouts'
Write-Step 'Waiting for backend rollout.'
& kubectl rollout status deployment/billmate-backend --namespace billmate --timeout=180s
if ($LASTEXITCODE -ne 0) {
    Write-Fail 'Backend rollout did not complete successfully.'
}
Write-Ok 'Backend rollout complete.'

Write-Step 'Waiting for frontend rollout.'
& kubectl rollout status deployment/billmate-frontend --namespace billmate --timeout=180s
if ($LASTEXITCODE -ne 0) {
    Write-Fail 'Frontend rollout did not complete successfully.'
}
Write-Ok 'Frontend rollout complete.'

Write-Header 'Step 10 - Resource status'

Write-Step 'Pods'
& kubectl get pods --namespace billmate -o wide
if ($LASTEXITCODE -ne 0) {
    Write-Warn 'Unable to display pod status.'
}

Write-Step 'Deployments'
& kubectl get deployments --namespace billmate
if ($LASTEXITCODE -ne 0) {
    Write-Warn 'Unable to display deployment status.'
}

Write-Step 'Services'
& kubectl get services --namespace billmate
if ($LASTEXITCODE -ne 0) {
    Write-Warn 'Unable to display service status.'
}

Write-Step 'ConfigMap'
& kubectl get configmap billmate-config --namespace billmate
if ($LASTEXITCODE -ne 0) {
    Write-Warn 'Unable to display ConfigMap status.'
}

Write-Step 'Secret keys only'
$secret = & kubectl get secret billmate-secrets --namespace billmate -o json |
    ConvertFrom-Json
if ($LASTEXITCODE -eq 0 -and $secret.data) {
    $secretKeyNames = $secret.data.PSObject.Properties.Name
    Write-Host ($secretKeyNames -join ', ')
}

$accessUrl = 'http://' + $minikubeIp + ':30080'
Write-Header 'BillMate is ready'
Write-Ok ('Frontend URL: ' + $accessUrl)
Write-Ok ('Login page: ' + $accessUrl + '/login')
Write-Ok ('Dashboard: ' + $accessUrl + '/dashboard')
Write-Ok 'Backend API: Nginx proxy to billmate-backend:5000'
Write-Step 'To verify the backend directly:'
Write-Step 'kubectl port-forward svc/billmate-backend 5000:5000 -n billmate'
Write-Step 'Then open http://localhost:5000/health'