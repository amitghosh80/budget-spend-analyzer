"""Regression tests for income detection — rules, classification, and aggregation."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app.services.pdf_parser import RawTransaction
from app.services.income_identifier import (
    _classify_transaction,
    identify_income,
    identify_income_by_keywords,
    SALARY_KEYWORDS,
    RENTAL_KEYWORDS,
    OTHER_INCOME_KEYWORDS,
    EXCLUSION_KEYWORDS,
)


# =====================================================================
# Part A: Classification rule tests
# Verify that individual transactions are classified correctly.
# =====================================================================

class TestSalaryClassification:
    """Rule 1: Salary keyword matching."""

    @pytest.mark.parametrize("keyword", SALARY_KEYWORDS)
    def test_salary_keywords_detected(self, keyword):
        txn = RawTransaction(date="01/15", description=f"ACH {keyword} deposit", amount=5000.0, line_text="")
        result = _classify_transaction(txn)
        assert result is not None, f"Salary keyword '{keyword}' not detected"
        assert result[0] == "salary"

    def test_microsoft_edipayment(self):
        txn = RawTransaction(date="01/15", description="Microsoft Edipayment PPD ID: 9911144442", amount=1500.0, line_text="")
        result = _classify_transaction(txn)
        assert result is not None
        assert result[0] == "salary"
        assert "EDIPAYMENT" in result[1]

    def test_ach_deposit_microsoft_edipayment(self):
        txn = RawTransaction(date="01/13", description="01/13 ACH Deposit MICROSOFT - EDIPAYMENT", amount=4257.19, line_text="")
        result = _classify_transaction(txn)
        assert result is not None
        assert result[0] == "salary"


class TestRentalClassification:
    """Rule 2: Rental keyword matching."""

    @pytest.mark.parametrize("keyword", RENTAL_KEYWORDS)
    def test_rental_keywords_detected(self, keyword):
        txn = RawTransaction(date="01/01", description=f"{keyword} payment received", amount=2000.0, line_text="")
        result = _classify_transaction(txn)
        assert result is not None, f"Rental keyword '{keyword}' not detected"
        assert result[0] == "rental"


class TestInterestClassification:
    """Rule 3 — Interest income must be detected, NOT excluded."""

    def test_interest_payment_detected(self):
        txn = RawTransaction(date="12/31", description="Interest Payment", amount=0.03, line_text="")
        result = _classify_transaction(txn)
        assert result is not None, "Interest Payment should be income, not excluded"
        assert result[0] == "interest"

    def test_interest_paid_detected(self):
        txn = RawTransaction(date="12/31", description="Interest Paid Year-to-Date", amount=0.44, line_text="")
        result = _classify_transaction(txn)
        assert result is not None, "Interest Paid should be income"
        assert result[0] == "interest"

    def test_interest_credit_detected(self):
        txn = RawTransaction(date="12/31", description="Interest Credit", amount=5.0, line_text="")
        result = _classify_transaction(txn)
        assert result is not None
        assert result[0] == "interest"

    def test_interest_not_in_exclusion_keywords(self):
        """INTEREST must not be in exclusion list (was a bug — see PRD gap #1)."""
        assert "INTEREST" not in EXCLUSION_KEYWORDS, (
            "INTEREST should NOT be in EXCLUSION_KEYWORDS — it blocks interest income detection"
        )


class TestZelleVenmoClassification:
    """Rule 3 — Zelle/Venmo income detection (PRD gap #2)."""

    def test_zelle_payment_from_detected(self):
        txn = RawTransaction(date="12/03", description="Zelle Payment From Brian Heredia Wfct0Zk93Cpk", amount=4145.0, line_text="")
        result = _classify_transaction(txn)
        assert result is not None, "Zelle Payment From should be auto-detected"
        assert result[0] == "payments"

    def test_zelle_payment_to_not_detected(self):
        """Outgoing Zelle payments should NOT be detected as income."""
        txn = RawTransaction(date="12/08", description="Zelle Payment To Nil Jpm99Bxf2Et6", amount=78.0, line_text="")
        result = _classify_transaction(txn)
        assert result is None, "Outgoing Zelle should not be income"

    def test_venmo_cashout_detected(self):
        txn = RawTransaction(date="12/01", description="Venmo Cashout PPD ID: 5264681992", amount=2450.0, line_text="")
        result = _classify_transaction(txn)
        assert result is not None, "Venmo Cashout should be auto-detected"
        assert result[0] == "payments"

    def test_venmo_credit_detected(self):
        txn = RawTransaction(date="01/05", description="Venmo Credit to account", amount=200.0, line_text="")
        result = _classify_transaction(txn)
        assert result is not None
        assert result[0] == "payments"


class TestExclusions:
    """Exclusion keywords must still block non-income credits."""

    @pytest.mark.parametrize("keyword", EXCLUSION_KEYWORDS)
    def test_exclusion_keywords_block(self, keyword):
        txn = RawTransaction(date="01/01", description=f"Some {keyword} transaction", amount=100.0, line_text="")
        result = _classify_transaction(txn)
        assert result is None, f"Exclusion keyword '{keyword}' should block detection"

    def test_refund_excluded(self):
        txn = RawTransaction(date="01/01", description="Amazon Refund to card", amount=50.0, line_text="")
        assert _classify_transaction(txn) is None

    def test_transfer_excluded(self):
        txn = RawTransaction(date="01/01", description="Transfer to Savings account", amount=1000.0, line_text="")
        assert _classify_transaction(txn) is None


class TestFallbackACH:
    """Large ACH deposits that don't match other rules get caught by fallback."""

    def test_large_ach_deposit_detected(self):
        txn = RawTransaction(date="01/23", description="ACH Deposit AMIT GHOSH M2M 88850042 - P2P", amount=10000.0, line_text="")
        result = _classify_transaction(txn)
        assert result is not None
        assert result[0] == "other"

    def test_small_ach_deposit_not_detected(self):
        """ACH deposits under $500 should not trigger the fallback."""
        txn = RawTransaction(date="01/01", description="ACH Deposit SMALL PAYMENT", amount=100.0, line_text="")
        result = _classify_transaction(txn)
        assert result is None


# =====================================================================
# Part B: End-to-end detection on real PDF data
# Verify that identify_income() produces the expected sources with
# correct totals, counts, and frequencies.
# =====================================================================

class TestAutoDetectionEndToEnd:
    """Full pipeline: PDFs → extract → identify_income → expected results."""

    def test_expected_source_count(self, auto_detected):
        """Should detect exactly 8 income sources from the full PDF set."""
        assert len(auto_detected) == 8, (
            f"Expected 8 auto-detected sources, got {len(auto_detected)}: "
            f"{[d.source_name for d in auto_detected]}"
        )

    def test_microsoft_salary_firsttech(self, auto_detected_by_source):
        """ACH Deposit Microsoft Edipayment (FirstTech account)."""
        d = auto_detected_by_source.get("Ach Deposit Microsoft Edipayment")
        assert d is not None, "Microsoft salary (FirstTech) not detected"
        assert d.category == "salary"
        assert d.total_amount == pytest.approx(31100.85, abs=0.01)
        assert d.occurrence_count == 6
        assert d.frequency == "biweekly"
        assert d.confidence == "high"

    def test_microsoft_salary_checking(self, auto_detected_by_source):
        """Microsoft Edipayment (checking account)."""
        d = auto_detected_by_source.get("Microsoft Edipayment Ppd Id:")
        assert d is not None, "Microsoft salary (checking) not detected"
        assert d.category == "salary"
        assert d.total_amount == pytest.approx(9000.0, abs=0.01)
        assert d.occurrence_count == 6
        assert d.frequency == "biweekly"

    def test_zelle_brian(self, auto_detected_by_source):
        """Zelle Payment From Brian Heredia — now auto-detected via #2 fix."""
        d = auto_detected_by_source.get("Zelle Payment From Brian")
        assert d is not None, "Zelle from Brian not auto-detected"
        assert d.category == "payments"
        assert d.total_amount == pytest.approx(13989.32, abs=0.01)
        assert d.occurrence_count == 3

    def test_zelle_petro(self, auto_detected_by_source):
        """Zelle Payment From Petro — now auto-detected via #2 fix + parser fix."""
        d = auto_detected_by_source.get("Zelle Payment From Petro")
        assert d is not None, "Zelle from Petro not auto-detected"
        assert d.category == "payments"
        assert d.total_amount == pytest.approx(8700.0, abs=0.01)
        assert d.occurrence_count == 3  # Nov, Dec (recovered), Jan

    def test_venmo_cashout(self, auto_detected_by_source):
        """Venmo Cashout — now auto-detected via #2 fix."""
        d = auto_detected_by_source.get("Venmo Cashout Ppd Id:")
        assert d is not None, "Venmo Cashout not auto-detected"
        assert d.category == "payments"
        assert d.total_amount == pytest.approx(7350.0, abs=0.01)
        assert d.occurrence_count == 3

    def test_interest_payment(self, auto_detected_by_source):
        """Interest Payment — now auto-detected via #1 fix."""
        d = auto_detected_by_source.get("Interest Payment")
        assert d is not None, "Interest Payment not auto-detected"
        assert d.category == "interest"
        assert d.total_amount == pytest.approx(0.08, abs=0.01)
        assert d.occurrence_count == 3

    def test_ach_deposit_amit(self, auto_detected_by_source):
        """ACH Deposit Amit Ghosh — large P2P caught by fallback rule."""
        d = auto_detected_by_source.get("Ach Deposit Amit Ghosh")
        assert d is not None, "ACH Deposit Amit Ghosh not detected"
        assert d.category == "other"
        assert d.total_amount == pytest.approx(20000.0, abs=0.01)

    def test_jpmorgan_chase_transfers(self, auto_detected_by_source):
        """JPMorgan Chase Ext Trnsfr — caught by ACH deposit fallback."""
        d = auto_detected_by_source.get("Ach Deposit Jpmorgan Chase")
        assert d is not None, "JPMorgan Chase transfers not detected"
        assert d.category == "other"
        assert d.total_amount == pytest.approx(9500.0, abs=0.01)


# =====================================================================
# Part C: Keyword search (rescan) regression
# Verify that user-specified keyword searches find the expected sources.
# =====================================================================

class TestKeywordSearch:
    """Keyword search for sources that may not be auto-detected."""

    def test_deposit_transfer_keyword(self, all_transactions, auto_detected):
        """'deposit transfer' keyword should find Deposit Transfer From ******0912."""
        existing = set()
        for d in auto_detected:
            existing.update(d.sample_descriptions)

        results = identify_income_by_keywords(
            all_transactions, ["deposit transfer"], existing
        )
        assert len(results) >= 1, "Deposit Transfer not found via keyword search"
        dt = next((r for r in results if "Deposit Transfer" in r.source_name), None)
        assert dt is not None
        assert dt.total_amount == pytest.approx(10500.0, abs=0.01)
        assert dt.occurrence_count == 4

    def test_keyword_search_excludes_already_detected(self, all_transactions, auto_detected):
        """Keyword search should not duplicate already auto-detected sources."""
        existing = set()
        for d in auto_detected:
            existing.update(d.sample_descriptions)

        # Search for 'brian' — Brian is now auto-detected, so keyword should find nothing new
        results = identify_income_by_keywords(
            all_transactions, ["brian"], existing
        )
        # All Brian transactions should already be in existing_descriptions
        brian_results = [r for r in results if "Brian" in r.source_name]
        assert len(brian_results) == 0, (
            "Brian should be auto-detected now, keyword search should not re-find him"
        )


# =====================================================================
# Part D: Monthly aggregation regression
# Verify monthly_totals are computed correctly.
# =====================================================================

class TestMonthlyAggregation:
    def test_microsoft_salary_monthly_totals(self, auto_detected_by_source):
        d = auto_detected_by_source.get("Ach Deposit Microsoft Edipayment")
        assert d is not None
        monthly = {m.month: m.total for m in d.monthly_totals}
        assert monthly.get("Nov") == pytest.approx(11009.54, abs=0.01)
        assert monthly.get("Dec") == pytest.approx(11576.92, abs=0.01)
        assert monthly.get("Jan") == pytest.approx(8514.39, abs=0.01)

    def test_zelle_petro_monthly_totals(self, auto_detected_by_source):
        """Petro should have 3 months: Nov, Dec (recovered), Jan."""
        d = auto_detected_by_source.get("Zelle Payment From Petro")
        assert d is not None
        monthly = {m.month: m.total for m in d.monthly_totals}
        assert len(monthly) == 3, f"Expected 3 months, got {list(monthly.keys())}"
        assert monthly.get("Nov") == pytest.approx(2900.0, abs=0.01)
        assert monthly.get("Dec") == pytest.approx(2900.0, abs=0.01)
        assert monthly.get("Jan") == pytest.approx(2900.0, abs=0.01)

    def test_venmo_cashout_monthly_totals(self, auto_detected_by_source):
        d = auto_detected_by_source.get("Venmo Cashout Ppd Id:")
        assert d is not None
        monthly = {m.month: m.total for m in d.monthly_totals}
        assert len(monthly) == 3
        for month in ["Nov", "Dec", "Jan"]:
            assert monthly.get(month) == pytest.approx(2450.0, abs=0.01)
