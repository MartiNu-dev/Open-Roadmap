"""Lightweight SQLite migrations for Phase 2 — add columns/tables to an existing DB."""
from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine


def run_migrations(engine: Engine) -> None:
    insp = inspect(engine)
    cols = {c["name"] for c in insp.get_columns("roadmap_blocks")}
    needed = {
        "x": "INTEGER NOT NULL DEFAULT 0",
        "y": "INTEGER NOT NULL DEFAULT 0",
        "width": "INTEGER NOT NULL DEFAULT 200",
        "height": "INTEGER NOT NULL DEFAULT 64",
        "node_style": "VARCHAR NOT NULL DEFAULT 'primary'",
    }
    with engine.begin() as conn:
        for name, ddl in needed.items():
            if name not in cols:
                conn.execute(text(f"ALTER TABLE roadmap_blocks ADD COLUMN {name} {ddl}"))
