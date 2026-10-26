@echo off
REM RepoHealth starter (best effort). Run from the project root.
REM Terminal 1: backend. Terminal 2: frontend. Keep both open.
start "RepoHealth backend" cmd /k "cd backend && if not exist .venv py -m venv .venv && .\.venv\Scripts\python.exe -m pip install -r requirements.txt && .\.venv\Scripts\python.exe -m uvicorn main:app --reload"
start "RepoHealth frontend" cmd /k "cd frontend && npm.cmd install && npm.cmd run dev"
echo Backend: http://127.0.0.1:8000/docs
echo Frontend: http://localhost:5173
