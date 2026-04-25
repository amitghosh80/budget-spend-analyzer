"""Detect credit card payment transactions in checking/savings accounts."""

from __future__ import annotations

# ── Explicit keyword phrases (fast path) ────────────────────────────────────
CC_PAYMENT_KEYWORDS = [
    "PAYMENT TO AMERICAN EXPRESS",
    "PAYMENT TO AMEX",
    "AMEX EPAYMENT",
    "AMEX ACH PMT",
    "AMERICAN EXPRESS ACH",
    "CHASE CREDIT CARD PAYMENT",
    "PAYMENT TO CHASE CARD",
    "CAPITAL ONE PAYMENT",
    "PAYMENT TO CAPITAL ONE",
    "DISCOVER PAYMENT",
    "PAYMENT TO DISCOVER",
    "CREDIT CARD PAYMENT",
    "ONLINE PAYMENT THANK YOU",
    "PAYMENT THANK YOU",
    "CITI CARD PAYMENT",
    "PAYMENT TO CITI",
    "CITICARD PAYMENT",
    "BARCLAYS PAYMENT",
    "BARCLAYCARD PAYMENT",
    "WELLS FARGO CARD PMT",
    "BK OF AMER VISA",
    "BANK CARD - PAYMENT",
    "AUTOPAY PAYMENT",
    "AUTOPAY CREDIT CARD",
]

# ── Two-component matching ────────────────────────────────────────────────────
# If a description contains BOTH a CC issuer token AND a payment action token
# it is treated as a CC payment regardless of exact phrasing.

_CC_ISSUER_TOKENS = [
    # Amex
    "AMEX", "AMERICAN EXPRESS", "AMERICANEXPRESS",
    # Citi (including store-card autopay Web IDs like "Citiautfdr")
    "CITICARD", "CITI CARD", "CITIBANK CARD", "CITIAUT",
    # Discover
    "DISCOVER CARD", "DISCOVER FINANCIAL",
    # Capital One
    "CAPITAL ONE CARD", "CAP ONE CARD",
    # Chase
    "CHASE CREDIT", "CHASE CARD",
    # Barclays
    "BARCLAYS", "BARCLAYCARD",
    # Synchrony (store cards)
    "SYNCHRONY",
    # Bank of America
    "BK OF AMER VISA", "BANK OF AMERICA VISA", "BOFA VISA",
    # Wells Fargo
    "WELLS FARGO CARD", "WF CARD",
    # US Bank
    "US BANK CARD", "USBANK CARD",
    # TD
    "TD BANK CARD",
    # Comenity (store cards)
    "COMENITY",
    # Generic bank card
    "BANK CARD",
]

_PAYMENT_ACTION_TOKENS = [
    "PAYMENT",    # catches PAYMENT, EPAYMENT, AUTOPAYMENT
    " PMT",       # space-prefixed to avoid matching e.g. "SHIPMT"
    "AUTOPAY",
    "AUTO PAY",
    "PYMT",
    "BILL PAY",
    "BILL PMT",
    "ACH PMT",
]

# ── Transfer keywords ─────────────────────────────────────────────────────────
TRANSFER_KEYWORDS = [
    # Explicit account-type transfers
    "TRANSFER TO SAVINGS",
    "TRANSFER TO CHECKING",
    "TRANSFER FROM SAVINGS",
    "TRANSFER FROM CHECKING",
    "INTERNAL TRANSFER",
    "FUNDS TRANSFER",
    # Bank external/online transfer formats
    "EXT TRNSFR",        # JPMorgan Chase "Ext Trnsfr"
    "EXTRNLTFR",         # First Tech FCU "Extrnltfr"
    "EXTERNAL TRANSFER", # generic "OLB External Transfer"
    # Statement-level transfer descriptions
    "DEPOSIT TRANSFER",      # "Deposit Transfer From ******0912"
    "WITHDRAWAL TRANSFER",   # "Withdrawal Transfer To ******0912"
    "M2M ",                  # Chase Money-to-Money P2P ("AMIT GHOSH M2M 88850042")
    # Non-transaction balance markers
    "STARTING BALANCE",
]

# ── Income credits (deposits into checking/savings that are NOT expenses) ─────
INCOME_CREDIT_KEYWORDS = [
    # Payroll / salary
    "DIRECT DEPOSIT",
    "DIRECT DEP",
    "PAYROLL",
    "ACH CREDIT",
    "SALARY",
    "EDIPAYMENT",
    # Government / tax
    "SOC SEC",
    "SOCIAL SECURITY",
    "SSA TREAS",
    "IRS TREAS",
    "TAX REFUND",
    "STATE REFUND",
    # Peer payments received
    "ZELLE PAYMENT FROM",
    "ZELLE FROM",
    "VENMO CASHOUT",
    "VENMO CREDIT",
    # Check / mobile deposits
    "MOBILE DEPOSIT",
    "MOBILE CHECK",
    "CHECK DEPOSIT",
    # Interest earned on savings/checking
    "INTEREST PAYMENT",
    "INTEREST CREDIT",
    "INTEREST PAID",
    "DIVIDEND CREDIT",
    # Bank fee refunds
    "ATM SURCHARGE REFUND",
    "ATM FEE REFUND",
    "OVERDRAFT FEE REFUND",
]


def is_cc_payment(description: str) -> bool:
    """Return True if description looks like a credit card bill payment.

    Uses two strategies:
    1. Explicit keyword phrases (fast, handles common formats).
    2. Two-component match: CC issuer name + payment action word in same line.
       This catches bank-specific formatting like 'AMEX EPAYMENT ER AM - ACH PMT'
       or 'American Express ACH Pmt W1252 Web ID: ...' without requiring an
       exact phrase match.
    """
    desc_upper = description.upper()

    # Fast path: explicit phrases
    if any(kw in desc_upper for kw in CC_PAYMENT_KEYWORDS):
        return True

    # Two-component match
    has_issuer = any(token in desc_upper for token in _CC_ISSUER_TOKENS)
    if not has_issuer:
        return False
    has_action = any(token in desc_upper for token in _PAYMENT_ACTION_TOKENS)
    return has_action


def is_transfer(description: str) -> bool:
    """Return True if description looks like an internal account transfer."""
    desc_upper = description.upper()
    return any(kw in desc_upper for kw in TRANSFER_KEYWORDS)


def is_income_credit(description: str) -> bool:
    """Return True if a checking/savings credit is an income deposit, not an expense."""
    desc_upper = description.upper()
    return any(kw in desc_upper for kw in INCOME_CREDIT_KEYWORDS)


def get_exclusion_reason(description: str) -> str | None:
    """Return the exclusion reason for a checking/savings transaction, or None.

    Excludes:
    - Credit card bill payments (cc_payment)
    - Internal account transfers (transfer)
    - Income credits / deposits (income_credit)

    Returns None if the transaction is a legitimate expense to keep.
    """
    if is_cc_payment(description):
        return "cc_payment"
    if is_transfer(description):
        return "transfer"
    if is_income_credit(description):
        return "income_credit"
    return None
