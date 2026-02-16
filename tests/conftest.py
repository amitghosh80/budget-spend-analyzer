"""Shared fixtures for regression tests."""
import sys
from pathlib import Path

import pytest

# Add backend to path so we can import app modules
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app.services.pdf_parser import extract_transactions, RawTransaction
from app.services.income_identifier import identify_income, identify_income_by_keywords

UPLOADS_DIR = Path(__file__).resolve().parents[1] / "backend" / "app" / "storage" / "uploads"

# Canonical set of unique PDFs (one representative per statement type)
# test.pdf is excluded as it's identical to GetDocument2.pdf
UNIQUE_PDFS = {
    "2025-11-09.pdf": UPLOADS_DIR / "848c544c_2025-11-09.pdf",
    "2025-12-10.pdf": UPLOADS_DIR / "3bbc3cf1_2025-12-10.pdf",
    "20251010-statements-1874-.pdf": UPLOADS_DIR / "daabaf3f_20251010-statements-1874-.pdf",
    "20251110-statements-1874-.pdf": UPLOADS_DIR / "154eb494_20251110-statements-1874-.pdf",
    "20251128-statements-3278-.pdf": UPLOADS_DIR / "0066d39a_20251128-statements-3278-.pdf",
    "20251231-statements-3278-.pdf": UPLOADS_DIR / "03ef5715_20251231-statements-3278-.pdf",
    "2026-01-09.pdf": UPLOADS_DIR / "7d3a12e5_2026-01-09.pdf",
    "20260110-statements-1874-.pdf": UPLOADS_DIR / "fa875887_20260110-statements-1874-.pdf",
    "20260130-statements-3278-.pdf": UPLOADS_DIR / "08dbf3ac_20260130-statements-3278-.pdf",
    "GetDocument.pdf": UPLOADS_DIR / "02c985f1_GetDocument.pdf",
    "GetDocument1.pdf": UPLOADS_DIR / "01011e39_GetDocument1.pdf",
    "GetDocument2.pdf": UPLOADS_DIR / "17fa627a_GetDocument2.pdf",
}


@pytest.fixture(scope="session")
def all_transactions():
    """Extract transactions from all unique PDFs (cached for the session)."""
    txns = []
    for name, path in sorted(UNIQUE_PDFS.items()):
        txns.extend(extract_transactions(path))
    return txns


@pytest.fixture(scope="session")
def auto_detected(all_transactions):
    """Run auto income detection on all transactions."""
    detected, _excluded = identify_income(all_transactions)
    return detected


@pytest.fixture(scope="session")
def auto_detected_by_source(auto_detected):
    """Index auto-detected income by source_name for easy lookup."""
    return {d.source_name: d for d in auto_detected}
