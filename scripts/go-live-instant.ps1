# ==============================================================================
# TeamTrack - Instant Public Internet Live Tunnel
# Gives you a public HTTPS link immediately to test on mobile & share with anyone!
# ==============================================================================

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   🚀 TeamTrack Instant Live Public URL Generator" -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Cyan

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = Split-Path -Parent $scriptDir
$binDir = Join-Path $scriptDir "bin"
if (!(Test-Path $binDir)) {
    New-Item -ItemType Directory -Path $binDir -Force | Out-Null
}

$cloudflaredPath = Join-Path $binDir "cloudflared.exe"

# Check if cloudflared is installed globally or locally
if (Get-Command cloudflared -ErrorAction SilentlyContinue) {
    $cloudflaredCmd = "cloudflared"
} elseif (Test-Path $cloudflaredPath) {
    $cloudflaredCmd = $cloudflaredPath
} else {
    Write-Host "📥 Downloading Cloudflare Tunnel utility (Official binary)..." -ForegroundColor Yellow
    $url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $url -OutFile $cloudflaredPath -UseBasicParsing
        Write-Host "✅ Download complete." -ForegroundColor Green
        $cloudflaredCmd = $cloudflaredPath
    } catch {
        Write-Host "⚠️ Direct download failed, falling back to npx localtunnel..." -ForegroundColor Red
        npx localtunnel --port 3000
        exit
    }
}

Write-Host "🌐 Launching live public secure HTTPS tunnel..." -ForegroundColor Green
Write-Host "👉 Look for the link ending in .trycloudflare.com below:" -ForegroundColor Yellow
Write-Host "----------------------------------------------------------" -ForegroundColor Gray

& $cloudflaredCmd tunnel --url http://localhost:3000
