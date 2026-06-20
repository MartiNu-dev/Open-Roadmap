"""Phase 7: filter/search roadmaps by tag & level + /api/tags + tag normalization tests."""
import os
import uuid
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {
    "email": os.environ.get("ADMIN_EMAIL", "admin@example.com"),
    "password": os.environ.get("ADMIN_PASSWORD", "admin123"),
}
EDITOR = {
    "email": os.environ.get("SEED_EDITOR_EMAIL", "editor@example.com"),
    "password": os.environ.get("SEED_EDITOR_PASSWORD", "editor123"),
}
USER = {
    "email": os.environ.get("SEED_USER_EMAIL", "user@example.com"),
    "password": os.environ.get("SEED_USER_PASSWORD", "user123"),
}


def _login(creds):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=creds)
    assert r.status_code == 200, r.text
    return s


# -------- BASIC LIST: tags+level present in payload --------
class TestListSummaryFields:
    def test_summary_has_tags_and_level(self):
        r = requests.get(f"{API}/roadmaps")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) and len(data) >= 3
        slugs = {x["slug"]: x for x in data}
        for slug in ("frontend", "backend", "devops"):
            assert slug in slugs, f"missing seeded roadmap {slug}"
            rm = slugs[slug]
            assert "tags" in rm and isinstance(rm["tags"], str)
            assert "level" in rm and rm["level"] in ("beginner", "intermediate", "advanced", "mixed")
        # Specific seeded values
        assert "react" in slugs["frontend"]["tags"].split(",")
        assert slugs["devops"]["level"] == "advanced"


# -------- FILTERS --------
class TestFilters:
    def test_q_filter_case_insensitive_title(self):
        r = requests.get(f"{API}/roadmaps", params={"q": "front"})
        assert r.status_code == 200
        slugs = [x["slug"] for x in r.json()]
        assert slugs == ["frontend"], slugs

    def test_tag_filter_exact_boundary(self):
        r = requests.get(f"{API}/roadmaps", params={"tag": "react"})
        assert r.status_code == 200
        slugs = [x["slug"] for x in r.json()]
        assert slugs == ["frontend"], slugs

    def test_tag_boundary_safety_no_substring_match(self):
        # 'reac' should NOT match 'react'
        r = requests.get(f"{API}/roadmaps", params={"tag": "reac"})
        assert r.status_code == 200
        assert r.json() == [], "tag substring should not match 'react'"

    def test_level_filter_advanced(self):
        r = requests.get(f"{API}/roadmaps", params={"level": "advanced"})
        assert r.status_code == 200
        slugs = [x["slug"] for x in r.json()]
        assert slugs == ["devops"], slugs

    def test_combined_filters(self):
        r = requests.get(f"{API}/roadmaps", params={"q": "cloud", "tag": "kubernetes", "level": "advanced"})
        assert r.status_code == 200
        slugs = [x["slug"] for x in r.json()]
        assert slugs == ["devops"], slugs

    def test_level_all_is_no_filter(self):
        all_r = requests.get(f"{API}/roadmaps").json()
        sentinel_r = requests.get(f"{API}/roadmaps", params={"level": "all"}).json()
        assert {x["slug"] for x in all_r} == {x["slug"] for x in sentinel_r}
        assert len(sentinel_r) == len(all_r)

    def test_no_match_returns_empty(self):
        r = requests.get(f"{API}/roadmaps", params={"tag": "nope-xyz"})
        assert r.status_code == 200
        assert r.json() == []


# -------- /api/tags --------
class TestTagsEndpoint:
    def test_tags_sorted_unique(self):
        r = requests.get(f"{API}/tags")
        assert r.status_code == 200
        tags = r.json()
        assert isinstance(tags, list)
        assert tags == sorted(tags), "tags should be sorted"
        assert len(tags) == len(set(tags)), "tags should be unique"
        # Some seeded tags exist
        for t in ("react", "python", "kubernetes"):
            assert t in tags, f"expected seeded tag {t} missing"


# -------- NORMALIZATION on POST/PUT --------
class TestNormalizationCRUD:
    def test_editor_create_normalizes_tags_and_persists_level(self):
        s = _login(EDITOR)
        csrf = s.cookies.get("csrf_token")
        slug = f"test-filter-{uuid.uuid4().hex[:8]}"
        payload = {
            "slug": slug, "title": "TEST_filter_norm", "description": "n",
            "cover_emoji": "🧪", "status": "published",
            "tags": "  Foo, bar, foo ", "level": "beginner",
        }
        r = s.post(f"{API}/roadmaps", json=payload, headers={"X-CSRF-Token": csrf})
        assert r.status_code == 201, r.text
        created = r.json()
        assert created["tags"] == "foo,bar", created["tags"]
        assert created["level"] == "beginner"
        rid = created["id"]

        # Re-fetch via list (published) and confirm
        listed = requests.get(f"{API}/roadmaps").json()
        match = [x for x in listed if x["id"] == rid]
        assert match and match[0]["tags"] == "foo,bar" and match[0]["level"] == "beginner"

        # PUT update + normalization (case+dedup+trim)
        upd = {"tags": "NEW, tag, new", "level": "intermediate"}
        r2 = s.put(f"{API}/roadmaps/{rid}", json=upd, headers={"X-CSRF-Token": csrf})
        assert r2.status_code == 200, r2.text
        assert r2.json()["tags"] == "new,tag"
        assert r2.json()["level"] == "intermediate"

        # Reflected in subsequent GET
        listed2 = requests.get(f"{API}/roadmaps").json()
        match2 = [x for x in listed2 if x["id"] == rid]
        assert match2 and match2[0]["tags"] == "new,tag"
        assert match2[0]["level"] == "intermediate"

        # Filter by the new tag
        r3 = requests.get(f"{API}/roadmaps", params={"tag": "new"}).json()
        assert any(x["id"] == rid for x in r3)

        # Cleanup as admin
        a = _login(ADMIN)
        acsrf = a.cookies.get("csrf_token")
        rdel = a.delete(f"{API}/roadmaps/{rid}", headers={"X-CSRF-Token": acsrf})
        assert rdel.status_code == 204


# -------- REGRESSION: existing endpoints still work --------
class TestRegression:
    def test_roadmap_detail_includes_tags_level(self):
        r = requests.get(f"{API}/roadmaps/frontend")
        assert r.status_code == 200
        d = r.json()
        assert "tags" in d and "react" in d["tags"]
        assert d["level"] in ("beginner", "intermediate", "advanced", "mixed")

    def test_cookie_auth_progress_works(self):
        s = _login(USER)
        csrf = s.cookies.get("csrf_token")
        rd = s.get(f"{API}/roadmaps/frontend").json()
        block = rd["blocks"][0]
        payload = {"roadmap_id": rd["id"], "block_id": block["id"], "status": "in_progress", "notes": "TEST_filter_regression"}
        r = s.post(f"{API}/progress", json=payload, headers={"X-CSRF-Token": csrf})
        assert r.status_code == 200, r.text

    def test_admin_users_endpoint(self):
        s = _login(ADMIN)
        r = s.get(f"{API}/admin/users")
        assert r.status_code == 200
        emails = {u["email"] for u in r.json()}
        assert {"admin@example.com", "editor@example.com", "user@example.com"} <= emails


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
