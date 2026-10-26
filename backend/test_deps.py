import deps


def test_parse_requirements():
    pkgs = deps.parse_requirements(
        "# comment\nrequests==2.31.0\nflask>=2.0\nnumpy~=1.26.4\n\n"
        "plain-package\n")
    assert [(p["name"], p["current"]) for p in pkgs] == [
        ("requests", "2.31.0"), ("flask", "2.0"),
        ("numpy", "1.26.4"), ("plain-package", None)]


def test_parse_package_json():
    pkgs = deps.parse_package_json(
        '{"dependencies": {"react": "^18.2.0"}, "devDependencies": {"vite": "~5.0.0"}}')
    assert {p["name"]: p["current"] for p in pkgs} == {"react": "18.2.0", "vite": "5.0.0"}


def test_parse_package_json_invalid():
    try:
        deps.parse_package_json("{not json")
    except ValueError:
        return
    raise AssertionError("invalid JSON must raise ValueError")


def test_compare_and_diff():
    assert deps.compare_versions("1.2.3", "1.2.4") == -1
    assert deps.compare_versions("2.0.0", "1.9.9") == 1
    assert deps.compare_versions("1.0.0-beta", "1.0.0") == -1
    assert deps.diff_kind("1.2.3", "2.0.0") == "major"
    assert deps.diff_kind("1.2.3", "1.3.0") == "minor"
    assert deps.diff_kind("1.2.3", "1.2.4") == "patch"
    assert deps.diff_kind("1.2.3", "1.2.3") == "up-to-date"
    assert deps.diff_kind(None, "1.0.0") == "unknown"
    assert deps.diff_kind("1.0.0", None) == "unknown"


def test_risk_classification():
    assert deps.RISK[deps.diff_kind("1.0.0", "2.0.0")] == "HIGH"
    assert deps.RISK[deps.diff_kind("1.0.0", "1.1.0")] == "MEDIUM"
    assert deps.RISK[deps.diff_kind("1.0.0", "1.0.1")] == "LOW"
    assert deps.RISK[deps.diff_kind("1.0.0", "1.0.0")] == "OK"


def test_safe_upgrades_exclude_major(monkeypatch):
    monkeypatch.setattr(deps, "fetch_latest",
                        lambda name, kind: {"a": "1.0.1", "b": "1.1.0", "c": "2.0.0"}[name])
    results = deps.check_packages([
        {"name": "a", "spec": "==1.0.0", "current": "1.0.0"},
        {"name": "b", "spec": "==1.0.0", "current": "1.0.0"},
        {"name": "c", "spec": "==1.0.0", "current": "1.0.0"},
    ], "python")
    safe = [r["name"] for r in deps.safe_upgrades(results)]
    major = [r["name"] for r in deps.major_upgrades(results)]
    assert safe == ["a", "b"]
    assert major == ["c"]


def test_unknown_package(monkeypatch):
    monkeypatch.setattr(deps, "fetch_latest", lambda name, kind: None)
    results = deps.check_packages(
        [{"name": "definitely-not-a-real-package-xyz", "spec": "==1.0.0", "current": "1.0.0"}],
        "python")
    assert results[0]["latest"] is None
    assert results[0]["diff"] == "unknown"
    assert results[0]["risk"] == "UNKNOWN"
    assert results[0]["safe"] is False
