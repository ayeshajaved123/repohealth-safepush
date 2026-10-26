"""Scoring tests on canned API payloads — no network calls."""
from datetime import datetime, timedelta, timezone

from scoring import count_stale_issues, score_repo

NOW = datetime.now(timezone.utc)


def _repo(**overrides):
    base = {
        "full_name": "example/repo",
        "description": "Example",
        "language": "Python",
        "license": {"spdx_id": "MIT"},
        "stargazers_count": 120,
        "forks_count": 30,
        "open_issues_count": 5,
        "has_issues": True,
        "pushed_at": (NOW - timedelta(days=2)).isoformat(),
        "updated_at": (NOW - timedelta(days=2)).isoformat(),
        "html_url": "https://github.com/example/repo",
        "default_branch": "main",
    }
    base.update(overrides)
    return base


def _community(**files):
    return {"files": files}


def _weekly(total=60, active=10):
    out = []
    for i in range(12):
        out.append({"week_start": f"2026-01-{i + 1:02d}", "commits": 5 if i < active else 0})
    return out


def test_full_healthy_repo_scores_100():
    report = score_repo(
        _repo(stargazers_count=1200), _community(readme={}, contributing={}, code_of_conduct={},
                            security={}, license={}),
        _weekly(), stale_count=0, stale_sample_truncated=False,
        releases_exist=True, root_files={"docs", ".gitignore"}, has_ci=True)
    assert report["total"] == 100, report["categories"]
    assert report["status"] == "Actively maintained"
    assert report["arithmetic"] == "30 + 20 + 20 + 15 + 15 = 100 / 100"


def test_missing_security_loses_exactly_six_points():
    report = score_repo(
        _repo(), _community(readme={}, contributing={}, code_of_conduct={},
                            license={}),
        _weekly(), stale_count=0, stale_sample_truncated=False,
        releases_exist=True, root_files={"docs", ".gitignore"}, has_ci=True)
    assert report["total"] == 93
    community = next(c for c in report["categories"] if c["id"] == "community")
    assert community["points"] == 8  # 5 code of conduct + 3 signal (120 stars)
    assert any(f["title"] == "Add a SECURITY.md policy" and f["priority"] == "HIGH"
               for f in report["fixes"])


def test_stale_repo_loses_activity_and_issue_points():
    old = (NOW - timedelta(days=400)).isoformat()
    report = score_repo(
        _repo(pushed_at=old, updated_at=old, open_issues_count=50),
        _community(readme={}), _weekly(total=0, active=0),
        stale_count=12, stale_sample_truncated=False,
        releases_exist=False, root_files=set(), has_ci=False)
    activity = next(c for c in report["categories"] if c["id"] == "activity")
    assert activity["points"] == 0
    issues = next(c for c in report["categories"] if c["id"] == "issue_care")
    assert issues["points"] == 4 + 3 + 0  # enabled + load + stale
    assert report["status"] == "At risk"


def test_commit_activity_unavailable_awards_no_volume_points():
    report = score_repo(
        _repo(), _community(readme={}, contributing={}, code_of_conduct={},
                            security={}, license={}),
        None, stale_count=0, stale_sample_truncated=False,
        releases_exist=True, root_files={"docs", ".gitignore"}, has_ci=True)
    assert report["weekly_available"] is False
    assert report["weekly"] is None
    activity = next(c for c in report["categories"] if c["id"] == "activity")
    assert activity["points"] == 12 + 3  # recency + release only


def test_stale_counting_excludes_prs_and_commented_issues():
    issues = [
        {"created_at": (NOW - timedelta(days=40)).isoformat(), "comments": 0},
        {"created_at": (NOW - timedelta(days=40)).isoformat(), "comments": 2},
        {"created_at": (NOW - timedelta(days=40)).isoformat(), "comments": 0,
         "pull_request": {"url": "x"}},
        {"created_at": (NOW - timedelta(days=5)).isoformat(), "comments": 0},
    ]
    assert count_stale_issues(issues, NOW) == 1
