"""SQLCipher-encrypted database for expense transactions and categories."""

from __future__ import annotations

import json
import logging
import secrets
import sqlite3 as _stdlib_sqlite3
from pathlib import Path
from typing import Optional

from sqlcipher3 import dbapi2 as sqlite3  # type: ignore[import-untyped]

logger = logging.getLogger(__name__)

DB_PATH = Path(__file__).resolve().parents[1] / "storage" / "expenses.db"
DB_KEY_PATH = Path(__file__).resolve().parents[1] / "storage" / ".db_encryption_key"

_cached_db_key: str | None = None

_SCHEMA = """
CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    amount REAL NOT NULL,
    description TEXT NOT NULL,
    merchant TEXT,
    category TEXT DEFAULT 'uncategorized',
    category_source TEXT DEFAULT 'auto',
    account_source TEXT NOT NULL,
    account_label TEXT,
    is_income INTEGER DEFAULT 0,
    is_excluded INTEGER DEFAULT 0,
    exclusion_reason TEXT,
    fingerprint TEXT UNIQUE,
    source_file TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS categories (
    slug TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT DEFAULT 'variable',
    is_custom INTEGER DEFAULT 0,
    keywords TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category);
CREATE INDEX IF NOT EXISTS idx_transactions_fingerprint ON transactions(fingerprint);
CREATE INDEX IF NOT EXISTS idx_transactions_month ON transactions(substr(date, 1, 7));
"""


def _get_or_create_db_key() -> str:
    """Load or generate a 32-byte hex key for SQLCipher."""
    global _cached_db_key
    if _cached_db_key is not None:
        return _cached_db_key

    DB_KEY_PATH.parent.mkdir(parents=True, exist_ok=True)

    if DB_KEY_PATH.exists():
        raw = DB_KEY_PATH.read_bytes()
        if len(raw) != 32:
            raise ValueError("DB encryption key file is corrupted (expected 32 bytes)")
        _cached_db_key = raw.hex()
    else:
        raw = secrets.token_bytes(32)
        DB_KEY_PATH.write_bytes(raw)
        _cached_db_key = raw.hex()

    return _cached_db_key


def _is_unencrypted_db(path: Path) -> bool:
    """Check if an existing DB file is a plain (unencrypted) SQLite database."""
    if not path.exists() or path.stat().st_size == 0:
        return False
    try:
        conn = _stdlib_sqlite3.connect(str(path))
        conn.execute("SELECT count(*) FROM sqlite_master")
        conn.close()
        return True
    except Exception:
        return False


def _migrate_unencrypted_db() -> None:
    """One-time migration: convert an existing plaintext DB to encrypted."""
    if not _is_unencrypted_db(DB_PATH):
        return

    logger.info("Migrating unencrypted expenses.db to SQLCipher...")
    key_hex = _get_or_create_db_key()

    # Read all data from unencrypted DB
    old_conn = _stdlib_sqlite3.connect(str(DB_PATH))
    old_conn.row_factory = _stdlib_sqlite3.Row

    txn_rows = old_conn.execute("SELECT * FROM transactions").fetchall()
    cat_rows = old_conn.execute("SELECT * FROM categories").fetchall()

    txn_cols = [desc[0] for desc in old_conn.execute("SELECT * FROM transactions LIMIT 0").description] if txn_rows else []
    cat_cols = [desc[0] for desc in old_conn.execute("SELECT * FROM categories LIMIT 0").description] if cat_rows else []
    old_conn.close()

    # Rename old file
    backup_path = DB_PATH.with_suffix(".db.unencrypted_backup")
    DB_PATH.rename(backup_path)

    # Create new encrypted DB
    new_conn = sqlite3.connect(str(DB_PATH))
    new_conn.execute(f"PRAGMA key=\"x'{key_hex}'\"")
    new_conn.execute("PRAGMA journal_mode=WAL")
    new_conn.executescript(_SCHEMA)

    # Re-insert data
    if txn_rows and txn_cols:
        placeholders = ",".join("?" for _ in txn_cols)
        cols = ",".join(txn_cols)
        for row in txn_rows:
            new_conn.execute(
                f"INSERT OR IGNORE INTO transactions ({cols}) VALUES ({placeholders})",
                tuple(row[c] for c in txn_cols),
            )

    if cat_rows and cat_cols:
        placeholders = ",".join("?" for _ in cat_cols)
        cols = ",".join(cat_cols)
        for row in cat_rows:
            new_conn.execute(
                f"INSERT OR IGNORE INTO categories ({cols}) VALUES ({placeholders})",
                tuple(row[c] for c in cat_cols),
            )

    new_conn.commit()
    new_conn.close()

    # Remove backup
    backup_path.unlink()
    logger.info("Migration complete — unencrypted backup removed.")


# Run migration on module load
_migrate_unencrypted_db()


def get_connection() -> sqlite3.Connection:
    """Return a connection to the encrypted expenses database, creating tables if needed."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    key_hex = _get_or_create_db_key()

    conn = sqlite3.connect(str(DB_PATH))
    conn.execute(f"PRAGMA key=\"x'{key_hex}'\"")
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.executescript(_SCHEMA)
    return conn


def insert_transaction(
    conn: sqlite3.Connection,
    *,
    id: str,
    date: str,
    amount: float,
    description: str,
    merchant: str,
    category: str,
    category_source: str,
    account_source: str,
    account_label: str,
    is_income: bool,
    is_excluded: bool,
    exclusion_reason: Optional[str],
    fingerprint: str,
    source_file: Optional[str],
) -> bool:
    """Insert a transaction, returning True if inserted, False if duplicate."""
    try:
        conn.execute(
            """INSERT INTO transactions
               (id, date, amount, description, merchant, category, category_source,
                account_source, account_label, is_income, is_excluded, exclusion_reason,
                fingerprint, source_file)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                id, date, amount, description, merchant, category, category_source,
                account_source, account_label, int(is_income), int(is_excluded),
                exclusion_reason, fingerprint, source_file,
            ),
        )
        return True
    except sqlite3.IntegrityError:
        return False


def update_categories(conn: sqlite3.Connection, transaction_ids: list[str], new_category: str) -> int:
    """Bulk-update category for a list of transaction IDs. Returns count updated."""
    if not transaction_ids:
        return 0
    placeholders = ",".join("?" for _ in transaction_ids)
    cur = conn.execute(
        f"UPDATE transactions SET category = ?, category_source = 'user' WHERE id IN ({placeholders})",
        [new_category] + transaction_ids,
    )
    conn.commit()
    return cur.rowcount


def get_transactions(
    conn: sqlite3.Connection,
    *,
    month: Optional[str] = None,
    category: Optional[str] = None,
    account: Optional[str] = None,
    search: Optional[str] = None,
    include_excluded: bool = False,
    include_income: bool = False,
) -> list[sqlite3.Row]:
    """Query transactions with optional filters."""
    clauses = []
    params: list = []

    if not include_excluded:
        clauses.append("is_excluded = 0")
    if not include_income:
        clauses.append("is_income = 0")
    if month:
        clauses.append("substr(date, 1, 7) = ?")
        params.append(month)
    if category:
        clauses.append("category = ?")
        params.append(category)
    if account:
        clauses.append("account_source = ?")
        params.append(account)
    if search:
        clauses.append("(description LIKE ? OR merchant LIKE ?)")
        params.extend([f"%{search}%", f"%{search}%"])

    where = " AND ".join(clauses) if clauses else "1=1"
    return conn.execute(
        f"SELECT * FROM transactions WHERE {where} ORDER BY date DESC",
        params,
    ).fetchall()


def get_summary(conn: sqlite3.Connection) -> dict:
    """Aggregate expense totals for the summary endpoint."""
    rows = conn.execute(
        """SELECT category, SUM(amount) as total, COUNT(*) as cnt
           FROM transactions
           WHERE is_excluded = 0 AND is_income = 0
           GROUP BY category
           ORDER BY total DESC""",
    ).fetchall()

    grand_total = sum(r["total"] for r in rows)

    monthly_rows = conn.execute(
        """SELECT substr(date, 1, 7) as month, category, SUM(amount) as total
           FROM transactions
           WHERE is_excluded = 0 AND is_income = 0
           GROUP BY month, category
           ORDER BY month""",
    ).fetchall()

    excluded_count = conn.execute(
        "SELECT COUNT(*) as cnt FROM transactions WHERE is_excluded = 1"
    ).fetchone()["cnt"]

    return {
        "category_rows": rows,
        "grand_total": grand_total,
        "monthly_rows": monthly_rows,
        "excluded_count": excluded_count,
    }


def get_pivot(conn: sqlite3.Connection) -> list[sqlite3.Row]:
    """Return month x category pivot data: (month, category, total, count)."""
    return conn.execute(
        """SELECT substr(date, 1, 7) as month, category,
                  SUM(amount) as total, COUNT(*) as cnt
           FROM transactions
           WHERE is_excluded = 0 AND is_income = 0
           GROUP BY month, category
           ORDER BY month, total DESC""",
    ).fetchall()


def upsert_category(conn: sqlite3.Connection, slug: str, name: str, type_: str, is_custom: bool, keywords: list[str]) -> None:
    """Insert or update a category definition."""
    conn.execute(
        """INSERT INTO categories (slug, name, type, is_custom, keywords)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(slug) DO UPDATE SET name=?, type=?, is_custom=?, keywords=?""",
        (slug, name, type_, int(is_custom), json.dumps(keywords),
         name, type_, int(is_custom), json.dumps(keywords)),
    )
    conn.commit()


def get_all_categories(conn: sqlite3.Connection) -> list[sqlite3.Row]:
    """Return all category definitions."""
    return conn.execute("SELECT * FROM categories ORDER BY slug").fetchall()
