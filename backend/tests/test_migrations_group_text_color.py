import os
import sqlite3
import tempfile

from sqlalchemy import create_engine

from migrations import run_migrations

os.environ.setdefault("SQLITE_PATH", os.path.join(tempfile.gettempdir(), "open-roadmap-test-migrations.db"))

from server import _normalize_text_color


def test_run_migrations_backfills_only_legacy_group_text_color(tmp_path):
    db_path = tmp_path / "group-text-color.db"
    conn = sqlite3.connect(db_path)
    try:
        conn.execute(
            """
            CREATE TABLE roadmap_blocks (
                id VARCHAR NOT NULL PRIMARY KEY,
                kind VARCHAR NOT NULL DEFAULT 'block',
                text_color VARCHAR NOT NULL DEFAULT '#0f172a'
            )
            """
        )
        conn.execute("INSERT INTO roadmap_blocks (id, kind, text_color) VALUES ('group-legacy', 'group', '#0f172a')")
        conn.execute("INSERT INTO roadmap_blocks (id, kind, text_color) VALUES ('group-custom', 'group', '#2563eb')")
        conn.execute("INSERT INTO roadmap_blocks (id, kind, text_color) VALUES ('block-legacy', 'block', '#0f172a')")
        conn.commit()
    finally:
        conn.close()

    engine = create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False})

    run_migrations(engine)
    run_migrations(engine)

    with sqlite3.connect(db_path) as verify:
        rows = dict(verify.execute("SELECT id, text_color FROM roadmap_blocks").fetchall())

    assert rows["group-legacy"] == "#ffffff"
    assert rows["group-custom"] == "#2563eb"
    assert rows["block-legacy"] == "#0f172a"


def test_normalize_text_color_defaults_groups_to_white_without_touching_custom_values():
    assert _normalize_text_color("group", "#0f172a") == "#ffffff"
    assert _normalize_text_color("group", "#2563eb") == "#2563eb"
    assert _normalize_text_color("checkbox", "#0f172a") == "#0f172a"
