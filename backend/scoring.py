"""RepoHealth scoring formula — sums to exactly 100, computed only from
GitHub API responses. No score is invented, estimated from popularity
alone, or copied from any example.

Categories (max points in brackets):
- Activity (30): recency of last push (12) + commit volume in the last
  12 weeks (10) + weeks with at least one commit (5) + a release exists (3).
- Documentation (20): README present (12) + examples/docs folder present (8).
- Issue care (20): issues enabled (4) + open-issue load (8) + stale
  unresponded open issues (8). Stale = open, zero comments, created more
  than 30 days ago, counted from the first 30 open issues returned by the
  API (pull requests excluded). When a repo has more than 30 open issues
  this is a sample, and the reason string says so.
- Project setup (15): license (6) + CONTRIBUTING (5) + .gitignore or CI
  workflow (4).
- Community (15): SECURITY.md (6) + CODE_OF_CONDUCT (5) + a small capped
  stars/forks signal (4 maximum, so popularity cannot dominate).

Status bands: >=80 Actively maintained; >=50 Maintained, with gaps;
>=30 Needs attention; below 30 At risk.

Every category returns points, max, and a reason built from observed
facts. Fixes are generated only from checks that actually failed.
"""
from __future__ import annotations

from datetime import datetime, timezone

LEVELS = [
    (80, "Actively maintained", "Healthy foundation. A few gaps to close."),
    (50, "Maintained, with gaps", "Usable, but several health gaps to fix."),
    (30, "Needs attention", "Maintenance has slipped; fixes are overdue."),
    (0, "At risk", "Little sign of active maintenance."),
]


def _parse_dt(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


def _days_since(value, now):
    dt = _parse_dt(value)
    if dt is None:
        return None
    return (now - dt).days


def _points_for_recency(days):
    if days is None:
        return 0
    if days <= 7:
        return 12
    if days <= 30:
        return 9
    if days <= 90:
        return 6
    if days <= 365:
        return 3
    return 0


def _points_for_volume(total):
    if total >= 50:
        return 10
    if total >= 20:
        return 7
    if total >= 5:
        return 4
    if total >= 1:
        return 2
    return 0


def _points_for_consistency(weeks_active):
    if weeks_active >= 8:
        return 5
    if weeks_active >= 4:
        return 3
    if weeks_active >= 1:
        return 1
    return 0


def _points_for_open_load(count):
    if count <= 10:
        return 8
    if count <= 30:
        return 6
    if count <= 100:
        return 3
    return 0


def _points_for_stale(stale):
    if stale == 0:
        return 8
    if stale <= 3:
        return 5
    if stale <= 10:
        return 2
    return 0


def _points_for_community_signal(stars, forks):
    if stars >= 1000 or forks >= 200:
        return 4
    if stars >= 100 or forks >= 20:
        return 3
    if stars >= 10 or forks >= 5:
        return 2
    if stars >= 1:
        return 1
    return 0


def count_stale_issues(issues, now):
    """Count open issues with zero comments created >30 days ago.

    Pull requests are excluded (they carry a pull_request key).
    `issues` is the API sample; callers must say so when it is truncated.
    """
    stale = 0
    for item in issues or []:
        if item.get("pull_request"):
            continue
        if (item.get("comments") or 0) != 0:
            continue
        days = _days_since(item.get("created_at"), now)
        if days is not None and days > 30:
            stale += 1
    return stale


def score_repo(repo, community, weekly, stale_count, stale_sample_truncated,
               releases_exist, root_files, has_ci):
    """Compute the full report from already-fetched GitHub data.

    repo: dict from GET /repos/{owner}/{repo}
    community: dict from GET /repos/{owner}/{repo}/community/profile
    weekly: list of {"week_start": iso date, "commits": int} for the last
        12 weeks, or None when GitHub is still computing it (202).
    stale_count: int from count_stale_issues over the open-issue sample.
    root_files: set of lower-cased root file/dir names from /contents.
    has_ci: bool, True when a .github/workflows file was found.
    """
    now = datetime.now(timezone.utc)
    files = (community or {}).get("files") or {}

    def has_file(key):
        value = files.get(key)
        return value is not None

    # ---- Activity /30 ----
    days = _days_since(repo.get("pushed_at") or repo.get("updated_at"), now)
    recency = _points_for_recency(days)
    if weekly is None:
        volume, consistency, total_commits, weeks_active = 0, 0, None, None
        activity_reason = (
            "Commit activity is unavailable right now (GitHub is still "
            "computing it), so no volume or consistency points were awarded."
        )
    else:
        total_commits = sum(w["commits"] for w in weekly)
        weeks_active = sum(1 for w in weekly if w["commits"] > 0)
        volume = _points_for_volume(total_commits)
        consistency = _points_for_consistency(weeks_active)
        activity_reason = (
            f"Last push {days} days ago; {total_commits} commits in the last "
            f"12 weeks across {weeks_active} active weeks."
        )
    release_pts = 3 if releases_exist else 0
    activity = recency + volume + consistency + release_pts
    if weekly is not None:
        activity_reason += " Release found." if releases_exist else " No release found."

    # ---- Documentation /20 ----
    readme = has_file("readme")
    docs = any(name in root_files for name in ("docs", "examples", "doc", "documentation"))
    documentation = (12 if readme else 0) + (8 if docs else 0)
    doc_reason = (
        ("README found. " if readme else "No README found. ")
        + ("Examples or docs folder found." if docs else "No examples or docs folder found.")
    )

    # ---- Issue care /20 ----
    issues_enabled = bool(repo.get("has_issues"))
    open_count = repo.get("open_issues_count") or 0
    enabled_pts = 4 if issues_enabled else 0
    load_pts = _points_for_open_load(open_count) if issues_enabled else 0
    stale_pts = _points_for_stale(stale_count) if issues_enabled else 0
    issue_care = enabled_pts + load_pts + stale_pts
    if not issues_enabled:
        issue_reason = "Issues are disabled for this repository."
    else:
        sample_note = (" (counted from the first 30 open issues)"
                       if stale_sample_truncated else "")
        issue_reason = (
            f"{open_count} open issues; {stale_count} stale unresponded "
            f"issues{sample_note}."
        )

    # ---- Project setup /15 ----
    has_license = bool(repo.get("license")) or has_file("license")
    contributing = has_file("contributing")
    gitignore = ".gitignore" in root_files
    setup = (6 if has_license else 0) + (5 if contributing else 0) + (4 if (gitignore or has_ci) else 0)
    setup_reason = (
        ("License found. " if has_license else "No license found. ")
        + ("CONTRIBUTING found. " if contributing else "No CONTRIBUTING guide found. ")
        + (".gitignore or CI workflow found." if (gitignore or has_ci) else "No .gitignore or CI workflow found.")
    )

    # ---- Community /15 ----
    security = has_file("security")
    coc = has_file("code_of_conduct")
    stars = repo.get("stargazers_count") or 0
    forks = repo.get("forks_count") or 0
    signal = _points_for_community_signal(stars, forks)
    community_pts = (6 if security else 0) + (5 if coc else 0) + signal
    community_reason = (
        ("SECURITY.md found. " if security else "SECURITY.md missing. ")
        + ("Code of conduct found. " if coc else "No code of conduct found. ")
        + f"{stars} stars, {forks} forks."
    )

    categories = [
        {"id": "activity", "name": "Activity", "points": activity, "max": 30, "reason": activity_reason},
        {"id": "documentation", "name": "Documentation", "points": documentation, "max": 20, "reason": doc_reason},
        {"id": "issue_care", "name": "Issue care", "points": issue_care, "max": 20, "reason": issue_reason},
        {"id": "project_setup", "name": "Project setup", "points": setup, "max": 15, "reason": setup_reason},
        {"id": "community", "name": "Community", "points": community_pts, "max": 15, "reason": community_reason},
    ]
    total = sum(c["points"] for c in categories)
    assert total <= 100 and all(c["points"] <= c["max"] for c in categories)
    status, verdict = next((s, v) for threshold, s, v in LEVELS if total >= threshold)

    fixes = []
    if not readme:
        fixes.append({"priority": "HIGH", "title": "Add a README",
                      "reason": "No README was found, so new contributors cannot orient themselves."})
    if not has_license:
        fixes.append({"priority": "HIGH", "title": "Add a license",
                      "reason": "No license was found, so reuse terms are unclear."})
    if not security:
        fixes.append({"priority": "HIGH", "title": "Add a SECURITY.md policy",
                      "reason": "No security policy was found, so vulnerability reports have no channel."})
    if issues_enabled and stale_count > 0:
        fixes.append({"priority": "MEDIUM", "title": "Respond to older open issues",
                      "reason": f"{stale_count} open issues have no response after 30+ days."})
    if not contributing:
        fixes.append({"priority": "MEDIUM", "title": "Add a CONTRIBUTING guide",
                      "reason": "No contributing guide was found."})
    if not (gitignore or has_ci):
        fixes.append({"priority": "MEDIUM", "title": "Add continuous integration",
                      "reason": "No .gitignore or CI workflow was found."})
    if days is not None and days > 90:
        fixes.append({"priority": "MEDIUM", "title": "Resume maintenance",
                      "reason": f"No push in {days} days."})
    if not coc:
        fixes.append({"priority": "LOW", "title": "Add a code of conduct",
                      "reason": "No code of conduct was found."})

    return {
        "repo": {
            "full_name": repo.get("full_name"),
            "description": repo.get("description"),
            "language": repo.get("language"),
            "license": (repo.get("license") or {}).get("spdx_id") if repo.get("license") else None,
            "stars": stars,
            "forks": forks,
            "open_issues": open_count,
            "pushed_at": repo.get("pushed_at"),
            "updated_at": repo.get("updated_at"),
            "html_url": repo.get("html_url"),
            "default_branch": repo.get("default_branch"),
        },
        "total": total,
        "status": status,
        "verdict": verdict,
        "categories": categories,
        "arithmetic": " + ".join(str(c["points"]) for c in categories) + f" = {total} / 100",
        "weekly": weekly,
        "weekly_available": weekly is not None,
        "weekly_note": None if weekly is not None else (
            "GitHub returned 202 for commit activity (still computing); "
            "weekly bars are unavailable for this report, not zero."),
        "stale_issues": stale_count,
        "fixes": fixes[:6],
    }
