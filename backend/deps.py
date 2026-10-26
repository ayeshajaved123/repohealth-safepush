"""Dependency checker: public registries only, no token, no LLM.

Only package NAMES are sent to PyPI / npm; no code is uploaded.
A package that cannot be fetched is reported as "unknown", never guessed.
"""
from __future__ import annotations

import json
import re
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

TIMEOUT = 10.0
HEADERS = {"User-Agent": "RepoHealth/1.0 (dependency check; public registries only)"}


def parse_version(spec: str):
    """First numeric version in a spec string, or None."""
    if not spec:
        return None
    m = re.search(r"(\d+(?:\.\d+)*)", spec)
    return m.group(1) if m else None


def parse_requirements(content: str):
    """Return [{name, spec, current}] for requirements.txt content."""
    out = []
    for line in content.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or line.startswith("-"):
            continue
        line = line.split("#", 1)[0].strip()
        m = re.match(r"^([A-Za-z0-9_.\-]+)(\[[^\]]+\])?\s*(.*)$", line)
        if not m:
            continue
        spec = m.group(3).strip()
        out.append({"name": m.group(1), "spec": spec, "current": parse_version(spec)})
    return out


def parse_package_json(content: str):
    """Return [{name, spec, current}] for package.json content."""
    try:
        data = json.loads(content)
    except Exception as exc:
        raise ValueError("That is not valid JSON.") from exc
    out = []
    for section in ("dependencies", "devDependencies"):
        deps = data.get(section) or {}
        if isinstance(deps, dict):
            for name, spec in deps.items():
                spec = str(spec)
                out.append({"name": name, "spec": spec, "current": parse_version(spec)})
    return out


def split_version(version: str):
    """(numeric tuple padded to 3, is_release). Pre-release < release."""
    base = version.split("+", 1)[0]
    pre = "-" in base or bool(re.search(r"[A-Za-z]", base))
    nums = [int(x) for x in re.findall(r"\d+", base)[:3]]
    while len(nums) < 3:
        nums.append(0)
    return tuple(nums), (not pre)


def compare_versions(current: str, latest: str):
    """-1 if current < latest, 0 if equal, 1 if current > latest."""
    c_nums, c_rel = split_version(current)
    l_nums, l_rel = split_version(latest)
    if c_nums != l_nums:
        return -1 if c_nums < l_nums else 1
    if c_rel == l_rel:
        return 0
    return -1 if not c_rel else 1


def diff_kind(current: str, latest: str):
    """major / minor / patch / up-to-date / unknown."""
    if current is None or latest is None:
        return "unknown"
    if compare_versions(current, latest) >= 0:
        return "up-to-date"
    c, _ = split_version(current)
    l, _ = split_version(latest)
    if l[0] != c[0]:
        return "major"
    if l[1] != c[1]:
        return "minor"
    return "patch"


RISK = {"major": "HIGH", "minor": "MEDIUM", "patch": "LOW",
        "up-to-date": "OK", "unknown": "UNKNOWN"}


def _fetch_json(url: str):
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception:
        return None


def fetch_latest(name: str, kind: str):
    """Latest version string, or None when unknown."""
    if kind == "python":
        data = _fetch_json(f"https://pypi.org/pypi/{name}/json")
        if data:
            version = (data.get("info") or {}).get("version")
            if version:
                return str(version)
        return None
    data = _fetch_json(f"https://registry.npmjs.org/{name}/latest")
    if data and data.get("version"):
        return str(data["version"])
    return None


def check_packages(packages, kind: str):
    """Attach latest/diff/risk to each package (parallel fetches)."""
    with ThreadPoolExecutor(max_workers=8) as pool:
        latests = list(pool.map(lambda p: fetch_latest(p["name"], kind), packages))
    results = []
    for pkg, latest in zip(packages, latests):
        kind_diff = diff_kind(pkg["current"], latest)
        results.append({
            "name": pkg["name"],
            "spec": pkg["spec"],
            "current": pkg["current"],
            "latest": latest,
            "diff": kind_diff,
            "risk": RISK[kind_diff],
            "safe": kind_diff in ("minor", "patch"),
        })
    return results


def safe_upgrades(results):
    """Packages whose upgrade is safe (patch/minor only)."""
    return [r for r in results if r["safe"]]


def major_upgrades(results):
    """Major upgrades, listed separately and never auto-applied."""
    return [r for r in results if r["diff"] == "major"]
