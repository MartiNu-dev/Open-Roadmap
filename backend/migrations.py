"""Lightweight SQLite migrations for Phase 2 — add columns/tables to an existing DB."""
from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine


def _ensure_nullable_password_hash(engine: Engine) -> None:
    insp = inspect(engine)
    if "users" not in insp.get_table_names():
        return

    columns = insp.get_columns("users")
    password_col = next((col for col in columns if col["name"] == "password_hash"), None)
    if password_col is None or password_col.get("nullable", True):
        return

    with engine.begin() as conn:
        conn.execute(text("PRAGMA foreign_keys=OFF"))
        conn.execute(text(
            """
            CREATE TABLE users__new (
                id VARCHAR NOT NULL PRIMARY KEY,
                email VARCHAR NOT NULL,
                name VARCHAR NOT NULL,
                password_hash VARCHAR NULL,
                role VARCHAR NOT NULL DEFAULT 'user',
                created_at DATETIME NOT NULL
            )
            """
        ))
        conn.execute(text(
            """
            INSERT INTO users__new (id, email, name, password_hash, role, created_at)
            SELECT id, email, name, password_hash, role, created_at
            FROM users
            """
        ))
        conn.execute(text("DROP TABLE users"))
        conn.execute(text("ALTER TABLE users__new RENAME TO users"))
        conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_email ON users (email)"))
        conn.execute(text("PRAGMA foreign_keys=ON"))


def run_migrations(engine: Engine) -> None:
    insp = inspect(engine)
    cols = {c["name"] for c in insp.get_columns("roadmap_blocks")}
    needed = {
        "x": "INTEGER NOT NULL DEFAULT 0",
        "y": "INTEGER NOT NULL DEFAULT 0",
        "width": "INTEGER NOT NULL DEFAULT 220",
        "height": "INTEGER NOT NULL DEFAULT 44",
        "node_style": "VARCHAR NOT NULL DEFAULT 'primary'",
        "kind": "VARCHAR NOT NULL DEFAULT 'block'",
        "visibility_mode": "VARCHAR NOT NULL DEFAULT 'visible'",
        "bg_color": "VARCHAR NOT NULL DEFAULT '#0f172a'",
        "border_color": "VARCHAR NOT NULL DEFAULT '#94a3b8'",
        "border_style": "VARCHAR NOT NULL DEFAULT 'solid'",
        "border_thickness": "VARCHAR NOT NULL DEFAULT 'small'",
        "label_position": "VARCHAR NOT NULL DEFAULT 'bottom'",
        "label_align": "VARCHAR NOT NULL DEFAULT 'center'",
    }
    link_cols = {c["name"] for c in insp.get_columns("roadmap_links")} if "roadmap_links" in insp.get_table_names() else set()
    link_needed = {
        "label": "VARCHAR NOT NULL DEFAULT ''",
        "color": "VARCHAR NOT NULL DEFAULT '#475569'",
        "thickness": "VARCHAR NOT NULL DEFAULT 'medium'",
        "from_side": "VARCHAR NOT NULL DEFAULT 'bottom'",
        "to_side": "VARCHAR NOT NULL DEFAULT 'top'",
    }
    rm_cols = {c["name"] for c in insp.get_columns("roadmaps")} if "roadmaps" in insp.get_table_names() else set()
    rm_needed = {
        "tags": "TEXT NOT NULL DEFAULT ''",
        "level": "VARCHAR NOT NULL DEFAULT 'mixed'",
    }
    user_cols = {c["name"] for c in insp.get_columns("users")} if "users" in insp.get_table_names() else set()
    user_needed = {
        "oidc_roles": "TEXT NOT NULL DEFAULT ''",
    }
    auth_cols = {c["name"] for c in insp.get_columns("auth_settings")} if "auth_settings" in insp.get_table_names() else set()
    auth_needed = {
        "editors_see_all_roadmaps": "BOOLEAN NOT NULL DEFAULT 1",
    }
    with engine.begin() as conn:
        for name, ddl in needed.items():
            if name not in cols:
                conn.execute(text(f"ALTER TABLE roadmap_blocks ADD COLUMN {name} {ddl}"))
        for name, ddl in link_needed.items():
            if link_cols and name not in link_cols:
                conn.execute(text(f"ALTER TABLE roadmap_links ADD COLUMN {name} {ddl}"))
        for name, ddl in rm_needed.items():
            if rm_cols and name not in rm_cols:
                conn.execute(text(f"ALTER TABLE roadmaps ADD COLUMN {name} {ddl}"))
        for name, ddl in user_needed.items():
            if user_cols and name not in user_cols:
                conn.execute(text(f"ALTER TABLE users ADD COLUMN {name} {ddl}"))
        for name, ddl in auth_needed.items():
            if auth_cols and name not in auth_cols:
                conn.execute(text(f"ALTER TABLE auth_settings ADD COLUMN {name} {ddl}"))
        conn.execute(text(
            """
            CREATE TABLE IF NOT EXISTS oidc_role_tag_mappings (
                id VARCHAR NOT NULL PRIMARY KEY,
                role_name VARCHAR NOT NULL,
                role_key VARCHAR NOT NULL,
                tags TEXT NOT NULL DEFAULT '',
                created_at DATETIME NOT NULL,
                updated_at DATETIME NOT NULL,
                CONSTRAINT uq_oidc_role_tag_mappings_role_key UNIQUE (role_key)
            )
            """
        ))
        conn.execute(text(
            """
            CREATE INDEX IF NOT EXISTS ix_oidc_role_tag_mappings_role_key
            ON oidc_role_tag_mappings (role_key)
            """
        ))
    _ensure_nullable_password_hash(engine)
