"""RepoHealth API. Reports are computed live from the GitHub API and
optionally held in memory for 120 seconds to spare the rate limit.
No database, no sign-in, no fabricated score on error.
"""
from __future__ import annotations

import time
from typing import List

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

import deps as depcheck
from github import RepoHealthError, inspect_repo, parse_repo_input

app = FastAPI(title="RepoHealth", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

_CACHE = {}
_CACHE_TTL = 120


@app.exception_handler(Exception)
async def _unhandled(request: Request, exc: Exception):
    # Never leak a bare 500 HTML page: every failure is a JSON error the
    # frontend can show, so a real backend fault is distinguishable from
    # the backend simply not running (which the proxy reports as 500).
    return JSONResponse(
        status_code=502,
        content={"detail": f"Backend failed while inspecting: {exc.__class__.__name__}"},
    )


def _inspect(owner, repo):
    key = f"{owner}/{repo}".lower()
    entry = _CACHE.get(key)
    if entry and time.time() - entry[0] < _CACHE_TTL:
        report = dict(entry[1])
        report["cached"] = True
        return report
    try:
        report = inspect_repo(owner, repo)
    except RepoHealthError as exc:
        detail = exc.message
        if exc.reset_at:
            detail += f" Rate limit resets at {exc.reset_at}."
        raise HTTPException(exc.status, detail)
    _CACHE[key] = (time.time(), report)
    return report


class DepsRequest(BaseModel):
    filename: str
    content: str


@app.post("/api/deps")
def check_deps(body: DepsRequest):
    """Check one dependency file against public registries only."""
    name = (body.filename or "").lower()
    if name.endswith(".json") or "package" in name:
        try:
            packages = depcheck.parse_package_json(body.content)
        except ValueError as exc:
            raise HTTPException(400, str(exc))
        kind = "npm"
    elif name.endswith(".txt") or "requirements" in name:
        packages = depcheck.parse_requirements(body.content)
        kind = "python"
    else:
        raise HTTPException(400, "Upload package.json or requirements.txt.")
    if not packages:
        raise HTTPException(400, "No dependencies found in that file.")
    results = depcheck.check_packages(packages, kind)
    return {
        "kind": kind,
        "packages": results,
        "safe": [r["name"] for r in depcheck.safe_upgrades(results)],
        "major": [r["name"] for r in depcheck.major_upgrades(results)],
    }


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "repohealth", "source": "GitHub API"}


@app.get("/api/inspect")
def inspect(repo: str = Query(..., description="owner/repo or a github.com URL")):
    try:
        owner, name = parse_repo_input(repo)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return _inspect(owner, name)


@app.get("/api/compare")
def compare(repo: List[str] = Query(..., description="Exactly two repos: ?repo=a/b&repo=c/d")):
    if len(repo) != 2:
        raise HTTPException(400, "Compare needs exactly two repositories.")
    reports = []
    for raw in repo:
        try:
            owner, name = parse_repo_input(raw)
        except ValueError as exc:
            raise HTTPException(400, str(exc))
        reports.append(_inspect(owner, name))
    a, b = reports
    deltas = []
    for ca, cb in zip(a["categories"], b["categories"]):
        deltas.append({"id": ca["id"], "name": ca["name"],
                       "a_points": ca["points"], "b_points": cb["points"],
                       "delta": ca["points"] - cb["points"]})
    winner = None
    if a["total"] != b["total"]:
        winner = a["repo"]["full_name"] if a["total"] > b["total"] else b["repo"]["full_name"]
    return {"a": a, "b": b, "deltas": deltas, "winner": winner}
