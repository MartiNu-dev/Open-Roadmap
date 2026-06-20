"""Phase 8 backend tests: groups (kind/bg_color/label_position/label_align),
resize-aware PATCH /blocks/{id}/position (width/height), smaller default block height (44),
links to/from groups, role enforcement."""
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


def _csrf_headers(session):
    return {"X-CSRF-Token": session.cookies.get("csrf_token")}


def _frontend_id(session=None):
    sess = session or requests
    r = sess.get(f"{API}/roadmaps/frontend")
    assert r.status_code == 200
    return r.json()["id"], r.json()


# --------- BlockOut shape: new fields present on every block ---------
class TestBlockOutShape:
    def test_get_roadmap_embeds_new_fields(self):
        r = requests.get(f"{API}/roadmaps/frontend")
        assert r.status_code == 200
        data = r.json()
        assert data["blocks"], "no blocks"
        for b in data["blocks"]:
            assert b.get("kind") in ("block", "group")
            assert "bg_color" in b and isinstance(b["bg_color"], str) and b["bg_color"].startswith("#")
            assert b.get("label_position") in ("top", "bottom")
            assert b.get("label_align") in ("left", "center", "right")


# --------- Create group ---------
class TestCreateGroup:
    def test_editor_create_group_echoes_fields(self):
        s = _login(EDITOR)
        rid, _ = _frontend_id(s)
        created_ids = []
        try:
            payload = {
                "title": "TEST_group_phase8",
                "kind": "group",
                "bg_color": "#1e3a8a",
                "label_position": "top",
                "label_align": "left",
                "width": 400,
                "height": 200,
                "x": 800, "y": 800,
            }
            r = s.post(f"{API}/roadmaps/{rid}/blocks", json=payload, headers=_csrf_headers(s))
            assert r.status_code == 201, r.text
            body = r.json()
            created_ids.append(body["id"])
            assert body["kind"] == "group"
            assert body["bg_color"] == "#1e3a8a"
            assert body["label_position"] == "top"
            assert body["label_align"] == "left"
            assert body["width"] == 400
            assert body["height"] == 200
            assert body["title"] == "TEST_group_phase8"

            # Persists - re-GET the roadmap and ensure present
            d = s.get(f"{API}/roadmaps/frontend").json()
            match = [b for b in d["blocks"] if b["id"] == body["id"]]
            assert match, "group not persisted"
            m = match[0]
            assert m["kind"] == "group"
            assert m["bg_color"] == "#1e3a8a"
            assert m["label_position"] == "top"
            assert m["label_align"] == "left"
        finally:
            for bid in created_ids:
                s.delete(f"{API}/blocks/{bid}", headers=_csrf_headers(s))


# --------- Default width/height for new blocks ---------
class TestDefaultsSmallerHeight:
    def test_create_block_without_dims_defaults_220x44(self):
        s = _login(EDITOR)
        rid, _ = _frontend_id(s)
        created_ids = []
        try:
            payload = {"title": "TEST_default_dims_phase8"}
            r = s.post(f"{API}/roadmaps/{rid}/blocks", json=payload, headers=_csrf_headers(s))
            assert r.status_code == 201, r.text
            body = r.json()
            created_ids.append(body["id"])
            assert body["width"] == 220, f"expected width=220, got {body['width']}"
            assert body["height"] == 44, f"expected height=44 (smaller than old 64), got {body['height']}"
            # kind defaults to 'block'
            assert body["kind"] == "block"
        finally:
            for bid in created_ids:
                s.delete(f"{API}/blocks/{bid}", headers=_csrf_headers(s))


# --------- PUT updates new fields ---------
class TestPutUpdatesGroupFields:
    def test_put_updates_kind_and_group_props(self):
        s = _login(EDITOR)
        rid, _ = _frontend_id(s)
        created_ids = []
        try:
            r = s.post(
                f"{API}/roadmaps/{rid}/blocks",
                json={"title": "TEST_put_phase8", "kind": "group"},
                headers=_csrf_headers(s),
            )
            assert r.status_code == 201, r.text
            bid = r.json()["id"]
            created_ids.append(bid)

            put_payload = {
                "title": "TEST_put_phase8_renamed",
                "kind": "group",
                "bg_color": "#7c3aed",
                "label_position": "top",
                "label_align": "right",
                "width": 300, "height": 150, "x": 100, "y": 100,
            }
            r2 = s.put(f"{API}/blocks/{bid}", json=put_payload, headers=_csrf_headers(s))
            assert r2.status_code == 200, r2.text
            o = r2.json()
            assert o["bg_color"] == "#7c3aed"
            assert o["label_position"] == "top"
            assert o["label_align"] == "right"
            assert o["title"] == "TEST_put_phase8_renamed"

            # Verify persistence
            d = s.get(f"{API}/roadmaps/frontend").json()
            m = next(b for b in d["blocks"] if b["id"] == bid)
            assert m["bg_color"] == "#7c3aed"
            assert m["label_align"] == "right"
        finally:
            for bid in created_ids:
                s.delete(f"{API}/blocks/{bid}", headers=_csrf_headers(s))


# --------- PATCH position accepts width/height ---------
class TestPatchPositionResize:
    def test_patch_position_persists_width_height(self):
        s = _login(EDITOR)
        rid, _ = _frontend_id(s)
        created_ids = []
        try:
            r = s.post(
                f"{API}/roadmaps/{rid}/blocks",
                json={"title": "TEST_resize_phase8", "x": 0, "y": 0},
                headers=_csrf_headers(s),
            )
            assert r.status_code == 201, r.text
            bid = r.json()["id"]
            created_ids.append(bid)

            patch = {"x": 240, "y": 168, "width": 312, "height": 96}
            r2 = s.patch(f"{API}/blocks/{bid}/position", json=patch, headers=_csrf_headers(s))
            assert r2.status_code == 200, r2.text
            o = r2.json()
            assert o["x"] == 240 and o["y"] == 168
            assert o["width"] == 312 and o["height"] == 96

            # Re-GET
            d = s.get(f"{API}/roadmaps/frontend").json()
            m = next(b for b in d["blocks"] if b["id"] == bid)
            assert m["width"] == 312 and m["height"] == 96

            # Patch without width/height should keep prior dimensions (only x/y change)
            r3 = s.patch(f"{API}/blocks/{bid}/position", json={"x": 480, "y": 240}, headers=_csrf_headers(s))
            assert r3.status_code == 200
            o3 = r3.json()
            assert o3["x"] == 480 and o3["y"] == 240
            assert o3["width"] == 312 and o3["height"] == 96, "width/height should remain when omitted"
        finally:
            for bid in created_ids:
                s.delete(f"{API}/blocks/{bid}", headers=_csrf_headers(s))


# --------- Linking blocks <-> groups ---------
class TestLinkBlocksAndGroups:
    def test_create_link_block_to_group(self):
        s = _login(EDITOR)
        rid, detail = _frontend_id(s)
        created_blocks = []
        created_links = []
        try:
            r1 = s.post(f"{API}/roadmaps/{rid}/blocks",
                        json={"title": "TEST_lnk_block_phase8"},
                        headers=_csrf_headers(s))
            assert r1.status_code == 201
            b1 = r1.json()["id"]; created_blocks.append(b1)

            r2 = s.post(f"{API}/roadmaps/{rid}/blocks",
                        json={"title": "TEST_lnk_group_phase8", "kind": "group"},
                        headers=_csrf_headers(s))
            assert r2.status_code == 201
            g1 = r2.json()["id"]; created_blocks.append(g1)

            link_payload = {
                "from_block_id": b1, "to_block_id": g1,
                "style": "solid", "from_side": "right", "to_side": "left",
            }
            rl = s.post(f"{API}/roadmaps/{rid}/links", json=link_payload, headers=_csrf_headers(s))
            assert rl.status_code == 201, rl.text
            created_links.append(rl.json()["id"])
            lo = rl.json()
            assert lo["from_block_id"] == b1
            assert lo["to_block_id"] == g1
        finally:
            for lid in created_links:
                s.delete(f"{API}/links/{lid}", headers=_csrf_headers(s))
            for bid in created_blocks:
                s.delete(f"{API}/blocks/{bid}", headers=_csrf_headers(s))


# --------- Role enforcement (no new attack surface) ---------
class TestRoleEnforcement:
    def test_anonymous_create_group_401(self):
        rid, _ = _frontend_id()
        r = requests.post(f"{API}/roadmaps/{rid}/blocks",
                          json={"title": "TEST_anon", "kind": "group"})
        assert r.status_code == 401

    def test_user_create_group_403(self):
        s = _login(USER)
        rid, _ = _frontend_id(s)
        r = s.post(f"{API}/roadmaps/{rid}/blocks",
                   json={"title": "TEST_user_block_phase8", "kind": "group"},
                   headers=_csrf_headers(s))
        assert r.status_code == 403

    def test_user_patch_position_403(self):
        s = _login(USER)
        _, d = _frontend_id(s)
        bid = d["blocks"][0]["id"]
        r = s.patch(f"{API}/blocks/{bid}/position",
                    json={"x": 0, "y": 0, "width": 220, "height": 44},
                    headers=_csrf_headers(s))
        assert r.status_code == 403


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
