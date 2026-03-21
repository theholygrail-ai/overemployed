# Publish repo to GitHub (run from repo root after: gh auth login)
# Usage: .\scripts\publish-github.ps1 [-RepoName overemployed]

param(
    [string]$RepoName = "overemployed"
)

$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    Write-Error "GitHub CLI (gh) not found. Install: https://cli.github.com/"
}

gh auth status 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Run: gh auth login"
    exit 1
}

$hasOrigin = git remote get-url origin 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "Remote 'origin' exists: $hasOrigin"
    $r = Read-Host "Remove and recreate? (y/N)"
    if ($r -eq 'y' -or $r -eq 'Y') { git remote remove origin }
}

gh repo create $RepoName --public --source=. --remote=origin --push
Write-Host "Done. Next: import repo in Vercel and set VITE_API_URL (see docs/DEPLOY-CHECKLIST.md)"
