import pytest

from github import parse_repo_input


def test_owner_repo_accepted():
    assert parse_repo_input("facebook/react") == ("facebook", "react")


def test_full_url_accepted():
    assert parse_repo_input("https://github.com/facebook/react") == ("facebook", "react")
    assert parse_repo_input("github.com/facebook/react/") == ("facebook", "react")
    assert parse_repo_input("https://github.com/facebook/react.git") == ("facebook", "react")


def test_bad_input_rejected():
    for bad in ["", "justoneword", "a/b/c", "https://gitlab.com/a/b",
                "https://github.com/onlyowner", "a b/c"]:
        with pytest.raises(ValueError):
            parse_repo_input(bad)
