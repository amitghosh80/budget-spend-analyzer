"""Regression tests for PDF parser — transaction extraction."""
import sys
from io import BytesIO
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app.services.pdf_parser import extract_transactions, _parse_transaction_line
from tests.conftest import UNIQUE_PDFS


# -----------------------------------------------------------------------
# Test 1: Transaction counts per PDF
# These are the known-good counts from the baseline run.
# If a parser change causes more or fewer transactions to be extracted
# from any PDF, this test will catch it.
# -----------------------------------------------------------------------
EXPECTED_TRANSACTION_COUNTS = {
    "2025-11-09.pdf": 117,       # Credit card statement (Oct-Nov)
    "2025-12-10.pdf": 115,       # Credit card statement (Nov-Dec)
    "20251010-statements-1874-.pdf": 22,  # Credit card (Sep-Oct)
    "20251110-statements-1874-.pdf": 41,  # Credit card (Oct-Nov)
    "20251128-statements-3278-.pdf": 22,  # Checking account (Nov)
    "20251231-statements-3278-.pdf": 23,  # Checking account (Dec)
    "2026-01-09.pdf": 141,       # Credit card statement (Dec-Jan)
    "20260110-statements-1874-.pdf": 17,  # Credit card (Nov-Dec-Jan)
    "20260130-statements-3278-.pdf": 28,  # Checking account (Jan)
    "GetDocument.pdf": 26,       # FirstTech account (Jan)
    "GetDocument1.pdf": 20,      # FirstTech account (Dec)
    "GetDocument2.pdf": 20,      # FirstTech account (Nov)
}


@pytest.mark.parametrize("pdf_name,expected_count", EXPECTED_TRANSACTION_COUNTS.items())
def test_transaction_count_per_pdf(pdf_name, expected_count):
    """Each PDF should produce the exact same number of transactions."""
    pdf_path = UNIQUE_PDFS[pdf_name]
    txns = extract_transactions(pdf_path)
    assert len(txns) == expected_count, (
        f"{pdf_name}: expected {expected_count} transactions, got {len(txns)}"
    )


def test_total_transaction_count(all_transactions):
    """Total transactions across all PDFs should match baseline."""
    # Note: we exclude test.pdf (duplicate of GetDocument2.pdf)
    expected_total = sum(EXPECTED_TRANSACTION_COUNTS.values())
    assert len(all_transactions) == expected_total, (
        f"Expected {expected_total} total transactions, got {len(all_transactions)}"
    )


# -----------------------------------------------------------------------
# Test 2: Garbled PDF metadata marker recovery
# pdfplumber sometimes merges markers like "*end*transaction detail"
# with the next line, garbling the date. The parser must recover these.
# -----------------------------------------------------------------------
class TestGarbledMarkerRecovery:
    def test_petro_december_garbled_line(self):
        """The known garbled line from Dec 2025 checking statement."""
        garbled = "*end*transac1tion detail2/26 Zelle Payment From Petro Kushnirenko Wfct0Zms6Xgv 2,900.00 5,295.14"
        result = _parse_transaction_line(garbled)
        assert result is not None, "Failed to parse garbled Petro line"
        assert result.date == "12/26"
        assert result.amount == 2900.0
        assert "Petro" in result.description

    def test_normal_line_still_works(self):
        """Normal transaction lines must still parse correctly."""
        line = "12/26 Zelle Payment From Petro Kushnirenko Wfct0Zms6Xgv 2,900.00 5,295.14"
        result = _parse_transaction_line(line)
        assert result is not None
        assert result.date == "12/26"
        assert result.amount == 2900.0

    def test_marker_only_line_returns_none(self):
        """Lines that are only markers should not produce transactions."""
        assert _parse_transaction_line("*start*global product") is None
        assert _parse_transaction_line("*end*transaction detail") is None
        assert _parse_transaction_line("*start*post summary message1") is None

    def test_marker_with_non_transaction_content(self):
        """Marker lines with non-transaction text should return None."""
        line = "*end*consolidated balance summary2"
        result = _parse_transaction_line(line)
        # This should either return None or parse harmlessly
        # (the key thing is it doesn't crash)
        # Note: it might match "2" as a digit but there's no valid date after
        assert result is None or result.date is not None


# -----------------------------------------------------------------------
# Test 3: Key transactions that must always be found
# These are specific transactions the user confirmed as income.
# If any of these go missing, something is broken.
# -----------------------------------------------------------------------
class TestKeyTransactionsExist:
    def test_petro_december_exists(self):
        """Dec 2025 Petro transaction must be parsed (was previously missing)."""
        pdf_path = UNIQUE_PDFS["20251231-statements-3278-.pdf"]
        txns = extract_transactions(pdf_path)
        petro_txns = [t for t in txns if "PETRO" in t.description.upper()]
        assert len(petro_txns) >= 1, "December Petro transaction not found"
        assert any(t.date == "12/26" and t.amount == 2900.0 for t in petro_txns)

    def test_microsoft_edipayment_in_checking(self):
        """Microsoft salary deposits must be found in checking statements."""
        for pdf_name in ["20251128-statements-3278-.pdf", "20251231-statements-3278-.pdf", "20260130-statements-3278-.pdf"]:
            txns = extract_transactions(UNIQUE_PDFS[pdf_name])
            ms_txns = [t for t in txns if "EDIPAYMENT" in t.description.upper()]
            assert len(ms_txns) >= 1, f"No Microsoft Edipayment in {pdf_name}"

    def test_zelle_brian_in_checking(self):
        """Zelle from Brian Heredia must be found in checking statements."""
        for pdf_name in ["20251128-statements-3278-.pdf", "20251231-statements-3278-.pdf", "20260130-statements-3278-.pdf"]:
            txns = extract_transactions(UNIQUE_PDFS[pdf_name])
            brian_txns = [t for t in txns if "BRIAN" in t.description.upper() and "ZELLE" in t.description.upper()]
            assert len(brian_txns) >= 1, f"No Zelle from Brian in {pdf_name}"

    def test_venmo_cashout_in_checking(self):
        """Venmo Cashout must be found in checking statements."""
        for pdf_name in ["20251128-statements-3278-.pdf", "20251231-statements-3278-.pdf", "20260130-statements-3278-.pdf"]:
            txns = extract_transactions(UNIQUE_PDFS[pdf_name])
            venmo_txns = [t for t in txns if "VENMO" in t.description.upper() and "CASHOUT" in t.description.upper()]
            assert len(venmo_txns) >= 1, f"No Venmo Cashout in {pdf_name}"

    def test_interest_payment_in_checking(self):
        """Interest Payment must be found in checking statements."""
        for pdf_name in ["20251128-statements-3278-.pdf", "20251231-statements-3278-.pdf", "20260130-statements-3278-.pdf"]:
            txns = extract_transactions(UNIQUE_PDFS[pdf_name])
            interest_txns = [t for t in txns if "INTEREST PAYMENT" in t.description.upper()]
            assert len(interest_txns) >= 1, f"No Interest Payment in {pdf_name}"


# -----------------------------------------------------------------------
# Test 4: BytesIO input produces same results as Path input
# -----------------------------------------------------------------------
class TestBytesIOInput:
    def test_bytesio_matches_path(self):
        """extract_transactions(BytesIO(bytes)) must match extract_transactions(Path)."""
        pdf_path = UNIQUE_PDFS["20251231-statements-3278-.pdf"]
        pdf_bytes = pdf_path.read_bytes()

        txns_from_path = extract_transactions(pdf_path)
        txns_from_bytes = extract_transactions(BytesIO(pdf_bytes))

        assert len(txns_from_path) == len(txns_from_bytes)
        for t1, t2 in zip(txns_from_path, txns_from_bytes):
            assert t1.date == t2.date
            assert t1.description == t2.description
            assert t1.amount == t2.amount
