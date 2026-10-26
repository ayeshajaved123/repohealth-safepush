# RepoHealth - one terminal, both servers.
# Run from the RepoHealth folder:  .\START_ALL.ps1
# First run only (one time): set up the backend venv + install deps:
#   cd backend; py -m venv .venv; .\.venv\Scripts\python.exe -m pip install -r requirements.txt; cd ..
#   cd frontend; npm.cmd install; cd ..
# After that, this script starts the backend (minimized window) and the
# frontend (this terminal). Ctrl+C in this terminal stops the frontend
# and then stops the backend too.

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
Set-Location $root

$backendExe = Join-Path $root "backend\.venv\Scripts\python.exe"
if (-not (Test-Path $backendExe)) {
    Write-Host "Backend venv not found. First run setup:" -ForegroundColor Yellow
    Write-Host "  cd backend; py -m venv .venv; .\.venv\Scripts\python.exe -m pip install -r requirements.txt; cd .."
    Write-Host "  cd frontend; npm.cmd install; cd .."
    exit 1
}

$backend = Start-Process -FilePath $backendExe -ArgumentList "-m", "uvicorn", "main:app" `
    -WorkingDirectory (Join-Path $root "backend") -WindowStyle Minimized -PassThru
Write-Host "Backend started (PID $($backend.Id)). Starting frontend..." -ForegroundColor Green
Write-Host "Open http://localhost:5173  |  Stop with Ctrl+C" -ForegroundColor Green
try {
    Set-Location (Join-Path $root "frontend")
    npm.cmd run dev
} finally {
    if ($backend -and -not $backend.HasExited) {
        Stop-Process -Id $backend.Id -ErrorAction SilentlyContinue
        Write-Host "Backend stopped." -ForegroundColor Green
    }
}
