"""API tests with the GitHub client patched — no network calls."""
from fastapi.testclient import TestClient

import main as main_mod
from github import RepoHealthError

SAMPLE = {
    "repo": {"full_name": "example/repo", "description": "d", "language": "Python",
             "license": "MIT", "stars": 10, "forks": 2, "open_issues": 3,
             "pushed_at": None, "updated_at": None, "html_url": "", "default_branch": "main"},
    "total": 70, "status": "Maintained, with gaps", "verdict": "v",
    "categories": [], "arithmetic": "70 / 100", "weekly": [], "weekly_available": True,
    "weekly_note": None, "stale_issues": 0, "fixes": [],
    "fetched_at": "2026-01-01T00:00:00+00:00", "source": "GitHub API", "cached": False,
}


def _client(monkeypatch, fake):
    monkeypatch.setattr(main_mod, "inspect_repo", fake)
    return TestClient(main_mod.app)


def test_health_ok():
    client = TestClient(main_mod.app)
    assert client.get("/api/health").json()["status"] == "ok"


def test_inspect_bad_input_400(monkeypatch):
    client = _client(monkeypatch, lambda o, r: SAMPLE)
    assert client.get("/api/inspect", params={"repo": "not a repo"}).status_code == 400


def test_inspect_not_found_404(monkeypatch):
    def boom(owner, repo):
        raise RepoHealthError(404, "Repository not found or private.")
    client = _client(monkeypatch, boom)
    resp = client.get("/api/inspect", params={"repo": "ghost/nope"})
    assert resp.status_code == 404
    assert "not found" in resp.json()["detail"].lower()


def test_inspect_rate_limit_429(monkeypatch):
    def boom(owner, repo):
        raise RepoHealthError(429, "GitHub API rate limit reached.",
                              reset_at="2026-01-01T01:00:00+00:00")
    client = _client(monkeypatch, boom)
    resp = client.get("/api/inspect", params={"repo": "a/b"})
    assert resp.status_code == 429


def test_compare_needs_two(monkeypatch):
    client = _client(monkeypatch, lambda o, r: SAMPLE)
    assert client.get("/api/compare", params={"repo": "a/b"}).status_code == 400
