# RepoHealth — Good code deserves a health check.

**Team Paradox** | Hacktoberfest Hack Day NSTP 2026 | Inspect any public GitHub repository and get a transparent, explained health score — computed live from the GitHub API, never guessed.

RepoHealth answers a simple question judges, maintainers, and contributors all ask: is this repository actually maintained? It fetches real repository data, scores it with a published formula, explains every point, charts the last 12 weeks of commits, and lists the next fixes in priority order.

## Features

- Inspect any public repository by `owner/repo` or a full `github.com` URL. No sign-in required.
- **SafePush (new):** a pre-push check that finds leaked secrets and outdated dependencies and gives you the fix.
  Secret scanning runs entirely in your browser — pasted code is never sent to a server, and findings show masked
  values only. The dependency checker asks public PyPI / npm registries for package names only; your code is not
  uploaded. SafePush downloads fixed files, a `.env.example`, a `.gitignore`, and a safe-upgraded dependency file
  (patch/minor only — major upgrades are listed separately and never applied automatically).
- A health score out of 100 with every point explained and the arithmetic shown.
- Five scored categories: Activity, Documentation, Issue care, Project setup, Community.
- Weekly commit-activity chart for the last 12 weeks (or an honest "unavailable" note while GitHub is still computing it).
- Prioritised next fixes (HIGH / MEDIUM / LOW) generated only from checks that actually failed.
- Compare two repositories side by side, with per-category deltas and a winner by total score.
- A "How scoring works" page with the full formula and its limitations.
- **Pre-push hook (new, in `hooks/pre-push`):** copy it to `.git/hooks/pre-push` and it blocks a push when a HIGH secret (AWS, GitHub, Slack, OpenAI, private key) is found in tracked files. It prints only file:line and the secret type, never the secret value. Bypass deliberately with `git push --no-verify` only.
- Honest errors: unknown or private repo → 404, GitHub rate limit → 429 with reset time, network failure → 502. A fabricated score is never returned on error.

## Tech Stack

- Frontend: React + TypeScript + Vite + Tailwind CSS, React Router
- Backend: Python + FastAPI + Pydantic v2 (standard library `urllib` for GitHub calls — see note below)
- Data: GitHub REST API, live. No database: reports are computed live and held in memory for 120 seconds only.
- Tests: pytest

Note on the HTTP client: the GitHub client uses the standard library instead of httpx because httpx's proxy-environment parsing fails on some sandbox proxy setups, while `urllib` honours the same proxy variables correctly. `httpx` remains a dependency only because Starlette's test client needs it.

## Run

Extracted root: the `RepoHealth/` folder inside the ZIP is the project root. All commands below run from that folder.

### Easiest (Windows, one terminal only)

First run only, install dependencies once:

```powershell
cd backend; py -m venv .venv; .\.venv\Scripts\python.exe -m pip install -r requirements.txt; cd ..
cd frontend; npm.cmd install; cd ..
```

After that, from the RepoHealth folder, run just one command (or double-click `START_ALL.bat`):

```powershell
.\START_ALL.ps1
```

This starts the backend (minimized) and the frontend (this terminal). Open http://localhost:5173. Ctrl+C stops both.

### Backend (Windows PowerShell)

```powershell
cd repohealth\backend
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn main:app --reload
```

Backend: http://127.0.0.1:8000/docs

Optional: set `GITHUB_TOKEN` before starting the backend for a higher GitHub rate limit. Never commit a token. Unauthenticated requests are rate-limited by GitHub (60/hour); the app reports a 429 with the reset time when that happens.

### Frontend (second PowerShell terminal)

```powershell
cd repohealth\frontend
npm.cmd install
npm.cmd run dev
```

Frontend: http://localhost:5173 — it opens directly on Inspect. There is no landing page and no login.

### Linux / macOS

```bash
cd repohealth/backend
python3 -m venv .venv
./.venv/bin/python -m pip install -r requirements.txt
./.venv/bin/python -m uvicorn main:app --reload
```

```bash
cd repohealth/frontend
npm install
npm run dev
```

Or run `START_WINDOWS.bat` from the project root (best effort: it starts both servers).

## Pre-push hook

From your repo root (Git Bash on Windows, or any shell):

```bash
cp hooks/pre-push .git/hooks/pre-push
chmod +x .git/hooks/pre-push
```

Then a push with a HIGH secret in a tracked file fails with the file, line and secret type (no secret value printed). Remove the secret, use an environment variable, and push again. Demo it: add a file with a fake key, `git push` fails; remove the key, `git push` passes.

## Scoring formula

The five categories sum to exactly 100. Every rule below is implemented in `backend/scoring.py` and shown on the "How scoring works" page.

| Category | Max | Rules |
| --- | --- | --- |
| Activity | 30 | Last push within 7 days: 12, 30 days: 9, 90 days: 6, 365 days: 3, older: 0. Commits in the last 12 weeks: 50+: 10, 20+: 7, 5+: 4, 1+: 2. Weeks with at least one commit: 8+: 5, 4+: 3, 1+: 1. A release exists: 3. |
| Documentation | 20 | README present: 12. An examples, docs, doc or documentation folder present: 8. |
| Issue care | 20 | Issues enabled: 4. Open-issue load: 10 or fewer: 8, 30 or fewer: 6, 100 or fewer: 3, more: 0. Stale unresponded issues (open, zero comments, created over 30 days ago, counted from the first 30 open issues): none: 8, 1–3: 5, 4–10: 2, more: 0. |
| Project setup | 15 | License present: 6. CONTRIBUTING present: 5. `.gitignore` or a CI workflow under `.github/workflows`: 4. |
| Community | 15 | SECURITY.md present: 6. Code of conduct present: 5. Stars/forks signal, capped at 4: 1000+ stars or 200+ forks: 4, 100+ stars or 20+ forks: 3, 10+ stars or 5+ forks: 2, at least 1 star: 1. |

Status bands: 80–100 Actively maintained · 50–79 Maintained, with gaps · 30–49 Needs attention · 0–29 At risk.

## API summary

- `GET /api/health` — service status.
- `GET /api/inspect?repo=owner/repo` — full report (also accepts a full github.com URL).
- `GET /api/compare?repo=a/b&repo=c/d` — both reports, per-category deltas, winner by total.
- `POST /api/deps` — `{"filename": "requirements.txt" | "package.json", "content": "..."}` — per-package
  current/latest/diff/risk from PyPI / npm, plus safe (patch/minor) and major upgrade lists.

## Tests

Backend (from `backend/`):

```bash
pytest -q
```

Frontend build (from `frontend/`):

```bash
npm run build
```

## Limitations — signals, not guarantees

A high score means a project's public signals look healthy. It does not prove the code is correct, secure, or suitable for any particular use. Stale-issue counts are a sample when a repository has more than 30 open issues, and weekly commit activity is unavailable (not zero) while GitHub is still computing it. Private repositories cannot be inspected without a token.

## Author

Ayesha Javed 
