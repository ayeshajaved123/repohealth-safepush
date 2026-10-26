"""GitHub API client for RepoHealth. No token is required for public
repos; an optional GITHUB_TOKEN env var only raises the rate limit.

Implementation note: this module uses urllib, not httpx, because
httpx's proxy-environment parsing fails on some sandbox proxy setups
while urllib honours the same proxy variables correctly (verified live:
urllib and curl both reach api.github.com here).

Errors are mapped honestly and never turned into a fabricated score:
404 -> repository not found or private; 403 with an exhausted rate
limit -> rate-limited with a reset time; anything else from the network
-> upstream failure.
"""
from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

from scoring import count_stale_issues, score_repo

BASE = "https://api.github.com"
TIMEOUT = 15.0


class RepoHealthError(Exception):
    def __init__(self, status, message, reset_at=None):
        super().__init__(message)
        self.status = status
        self.message = message
        self.reset_at = reset_at


def parse_repo_input(raw):
    """Accept 'owner/repo' or a full github.com URL; reject everything else."""
    value = (raw or "").strip().rstrip("/")
    if not value:
        raise ValueError("Enter a repository as owner/repo or a github.com URL.")
    if value.startswith("http://") or value.startswith("https://") or value.startswith("github.com/"):
        url = value if value.startswith("http") else "https://" + value
        match = re.match(r"^https?://github\.com/([^/]+)/([^/?#]+)", url)
        if not match:
            raise ValueError("That is not a github.com repository URL.")
        owner, repo = match.group(1), match.group(2)
        if repo.endswith(".git"):
            repo = repo[:-4]
        return owner, repo
    match = re.match(r"^([\w.\-]+)/([\w.\-]+)$", value)
    if not match:
        raise ValueError("Enter a repository as owner/repo or a github.com URL.")
    return match.group(1), match.group(2)


def _headers():
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "RepoHealth/1.0 (hackathon; public repo inspection)",
    }
    token = os.getenv("GITHUB_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def _get(path, params=None):
    url = BASE + path
    if params:
        url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers=_headers())
    opener = urllib.request.build_opener(urllib.request.ProxyHandler())
    try:
        with opener.open(req, timeout=TIMEOUT) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            raise RepoHealthError(404, "Repository not found or private.") from exc
        if exc.code == 403:
            remaining = exc.headers.get("x-ratelimit-remaining") if exc.headers else None
            if remaining == "0":
                reset = exc.headers.get("x-ratelimit-reset") if exc.headers else None
                reset_at = None
                if reset and reset.isdigit():
                    reset_at = datetime.fromtimestamp(int(reset), tz=timezone.utc).isoformat()
                raise RepoHealthError(
                    429, "GitHub API rate limit reached. Try again after the reset time.",
                    reset_at=reset_at) from exc
            raise RepoHealthError(502, "GitHub refused the request (403).") from exc
        if exc.code == 202:
            return None  # still computing (used for commit activity)
        raise RepoHealthError(502, f"GitHub API returned {exc.code}.") from exc
    except Exception as exc:
        raise RepoHealthError(502, f"Could not reach the GitHub API: {exc.__class__.__name__}") from exc


def inspect_repo(owner, repo):
    """Fetch everything needed and score it. Returns the scoring dict
    plus fetched_at and source fields."""
    repo_data = _get(f"/repos/{owner}/{repo}")
    # The remaining calls are independent, so fetch them in parallel:
    # sequential calls made a single inspect take long enough that the
    # dev-server proxy could time out and report a bare 500.
    from concurrent.futures import ThreadPoolExecutor

    def _community():
        try:
            return _get(f"/repos/{owner}/{repo}/community/profile") or {}
        except RepoHealthError as exc:
            if exc.status == 404:
                return {}
            raise

    def _activity():
        return _get(f"/repos/{owner}/{repo}/stats/commit_activity")

    def _issues():
        return _get(f"/repos/{owner}/{repo}/issues",
                    params={"state": "open", "per_page": 30, "sort": "created", "direction": "asc"}) or []

    def _contents():
        try:
            contents = _get(f"/repos/{owner}/{repo}/contents")
        except RepoHealthError:
            return set()
        if not contents:
            return set()
        return {str(item.get("name", "")).lower() for item in contents}

    def _releases():
        try:
            releases = _get(f"/repos/{owner}/{repo}/releases", params={"per_page": 1})
            return bool(releases)
        except RepoHealthError:
            return False

    with ThreadPoolExecutor(max_workers=5) as pool:
        futures = {
            "community": pool.submit(_community),
            "activity": pool.submit(_activity),
            "issues": pool.submit(_issues),
            "contents": pool.submit(_contents),
            "releases": pool.submit(_releases),
        }
        community = futures["community"].result()
        activity = futures["activity"].result()
        issues = futures["issues"].result()
        root_names = futures["contents"].result()
        releases_exist = futures["releases"].result()
    # Guard against malformed sub-responses (seen transiently while GitHub
    # was rate-limiting): a dict/error payload must never crash Inspect.
    if isinstance(issues, dict):
        issues = []
    issues = [i for i in issues if isinstance(i, dict)]
    if isinstance(activity, dict):
        activity = None
    weekly = None
    if activity is not None:
        weekly = []
        for entry in activity[-12:]:
            if not isinstance(entry, dict) or "week" not in entry or "total" not in entry:
                continue
            week = datetime.fromtimestamp(entry["week"], tz=timezone.utc).date().isoformat()
            weekly.append({"week_start": week, "commits": int(entry["total"])})
    now = datetime.now(timezone.utc)
    stale = count_stale_issues(issues, now)
    truncated = (repo_data.get("open_issues_count") or 0) > len(issues)
    has_ci = False
    if ".github" in root_names:
        try:
            workflows = _get(f"/repos/{owner}/{repo}/contents/.github/workflows")
            has_ci = bool(workflows)
        except RepoHealthError:
            has_ci = False

    report = score_repo(repo_data, community, weekly, stale, truncated,
                        releases_exist, root_names, has_ci)
    report["fetched_at"] = datetime.now(timezone.utc).isoformat()
    report["source"] = "GitHub API"
    report["cached"] = False
    return report
