"""Migration: re-categorize uncategorized transactions + exclude CC payment credits.

Run from the backend/ directory:
    python migrate_categories.py
"""
from __future__ import annotations

import sys
import os

# Make sure app package is importable
sys.path.insert(0, os.path.dirname(__file__))

from app.services.database import get_connection
from app.services.expense_categorizer import categorize_transaction
from app.services.cc_payment_detector import is_cc_payment

def run():
    conn = get_connection()
    try:
        # ── 0. Fix savings-account personal transfers not caught by keyword rules ──
        # These are inter-account transfers using the account-holder name and
        # masked account numbers (e.g. "Withdrawal Ghosh Pmt from 9324733212 CK").
        # They don't match the generic TRANSFER_KEYWORDS but are clearly not expenses.
        savings_transfer_patterns = [
            # Pattern: account number followed by " CK" (checking account marker)
            ("WITHDRAWAL GHOSH PMT", "transfer"),
            ("DEPOSIT GHOSH CREDIT", "income_credit"),
        ]
        for (pat, reason) in savings_transfer_patterns:
            affected = conn.execute(
                "SELECT id, description FROM transactions WHERE UPPER(description) LIKE ? AND is_excluded=0",
                (f"%{pat}%",),
            ).fetchall()
            for row in affected:
                conn.execute(
                    "UPDATE transactions SET is_excluded=1, exclusion_reason=? WHERE id=?",
                    (reason, row["id"]),
                )
                print(f"  Excluded [{reason}]: {row['description'][:80]}")
        print()

        # ── 1a. Fix mis-categorized auto_loan → loan_payment ─────────────────────
        # Re-run categorizer on all auto_loan records; those that now resolve to
        # loan_payment (Boeing ECU, Cal Bank Trust, generic LOAN PAYMT) get updated.
        auto_rows = conn.execute(
            "SELECT id, description FROM transactions WHERE category = 'auto_loan' AND is_excluded = 0"
        ).fetchall()
        for row in auto_rows:
            new_cat, _ = categorize_transaction(row["description"])
            if new_cat != "auto_loan":
                conn.execute(
                    "UPDATE transactions SET category = ?, category_source = 'auto' WHERE id = ?",
                    (new_cat, row["id"]),
                )
                print(f"  auto_loan -> {new_cat}: {row['description'][:70]}")

        # ── 1b. Re-categorize uncategorized non-excluded, non-income transactions ──
        rows = conn.execute(
            """
            SELECT id, description
            FROM transactions
            WHERE category = 'uncategorized'
              AND is_excluded = 0
              AND is_income = 0
            """
        ).fetchall()

        recategorized = 0
        for row in rows:
            cat_slug, _ = categorize_transaction(row["description"])
            if cat_slug != "uncategorized":
                conn.execute(
                    "UPDATE transactions SET category = ?, category_source = 'auto' WHERE id = ?",
                    (cat_slug, row["id"]),
                )
                recategorized += 1

        print(f"Re-categorized {recategorized} / {len(rows)} uncategorized transactions.")

        # ── 2. Exclude CC payment credits on CC statements ──────────────────────
        # These are "Payment Thank You" entries — credits posted to a CC account
        # when you pay the bill. They should not count as expenses.
        cc_rows = conn.execute(
            """
            SELECT id, description
            FROM transactions
            WHERE account_source = 'credit_card'
              AND is_excluded = 0
            """
        ).fetchall()

        # Keywords that identify a CC payment credit on a CC statement
        CC_CREDIT_KEYWORDS = [
            "PAYMENT THANK YOU",
            "PAYMENT - THANK YOU",
            "ONLINE PAYMENT THANK YOU",
            "AUTOPAY PAYMENT",
            "AUTOPAY CREDIT",
            "PAYMENT RECEIVED",
        ]

        def is_cc_credit(description: str) -> bool:
            d = description.upper()
            return any(kw in d for kw in CC_CREDIT_KEYWORDS)

        excluded = 0
        for row in cc_rows:
            if is_cc_credit(row["description"]):
                conn.execute(
                    """
                    UPDATE transactions
                    SET is_excluded = 1,
                        exclusion_reason = 'cc_payment_credit',
                        category = 'uncategorized'
                    WHERE id = ?
                    """,
                    (row["id"],),
                )
                excluded += 1
                print(f"  Excluded CC credit: {row['description'][:80]}")

        print(f"\nExcluded {excluded} CC payment credit(s) from CC statements.")

        conn.commit()
        print("\nMigration complete.")

    except Exception as e:
        conn.rollback()
        print(f"ERROR: {e}", file=sys.stderr)
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    run()
