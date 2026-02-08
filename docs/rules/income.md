# Income Transaction Rules

Rules for identifying income transactions from bank and credit card statements.

---

## Rule 1: Salary

### Description

Regular employment income deposited by an employer, typically via direct deposit or payroll processing.

### Keywords

Match any of the following in the transaction description (case-insensitive):

- `DIRECT DEPOSIT` / `DIRECT DEP`
- `PAYROLL`
- `ACH CREDIT`
- Employer name (see Known Employers below)

### Patterns

- **Consistent amount**: The same dollar amount (or within a small tolerance, e.g., +/- $50 for tax adjustments) appears as a credit each period
- **Recurring schedule**: Deposits land on the same day of the month (monthly pay) or the same weekday every two weeks (biweekly pay)
- **Combined signal**: A transaction that matches both a keyword AND a recurring pattern is high-confidence salary

### Known Employers

Add employer names as they appear on statements:

- <!-- example: ACME CORP -->
- <!-- example: CONTOSO INC PAYROLL -->

### Classification

- Category: `Income > Salary`
- Flag as **fixed income** when the recurring pattern is confirmed

---

## Rule 2: Rental Income

### Description

Income from tenants or property management companies for rental properties owned by the user.

### Keywords

Match any of the following in the transaction description (case-insensitive):

- `RENT`
- `TENANT`
- `LEASE`
- `PROPERTY MGMT` / `PROPERTY MANAGEMENT`
- Tenant or property management company name (see Known Sources below)

### Patterns

- **Consistent amount**: The same dollar amount deposited each month (rent is typically a fixed amount)
- **Recurring schedule**: Deposits on or around the same day each month (commonly the 1st–5th)
- **Not an internal transfer**: Must NOT match any transfer keywords (`TRANSFER`, `XFER`, `TFR`, or matching account numbers from the user's own accounts)

### Known Sources

Add tenant names or property management companies as they appear on statements:

- <!-- example: JOHN DOE RENT -->
- <!-- example: GREYSTAR PROPERTY MGMT -->

### Classification

- Category: `Income > Rental`
- Flag as **fixed income** when the recurring pattern is confirmed

---

## Rule 3: Other Recurring Income

### Description

Any other recurring credit that is not salary, rental income, or an internal transfer. Examples include side-job payments, freelance/contract income, pension, social security, annuity payments, or recurring dividends.

### Keywords

Match any of the following in the transaction description (case-insensitive):

- `PENSION`
- `SOC SEC` / `SOCIAL SECURITY` / `SSA`
- `ANNUITY`
- `DIVIDEND`
- `FREELANCE`
- `CONSULTING`
- `COMMISSION`
- Known payer name (see Known Sources below)

### Patterns

- **Consistent amount**: The same (or similar) dollar amount credited each period
- **Recurring schedule**: Deposits on a regular cadence — monthly, biweekly, or quarterly
- **Not an internal transfer**: Must NOT match transfer keywords (`TRANSFER`, `XFER`, `TFR`) or known account-to-account movement patterns
- **Not a refund or reward**: Must NOT match exclusion keywords (see Exclusions section)

### Known Sources

Add payer names as they appear on statements:

- <!-- example: STATE PENSION BOARD -->
- <!-- example: FIDELITY DIVIDEND -->

### Classification

- Category: `Income > Other` (or a more specific sub-category if keyword matches, e.g., `Income > Pension`, `Income > Freelance`)
- Flag as **fixed income** when the amount and schedule are consistent

---

## Exclusions

The following credit types should NOT be classified as income:

- Refunds (keywords: `REFUND`, `RETURN`, `REVERSAL`, `CREDIT ADJ`)
- Transfers between own accounts (keywords: `TRANSFER`, `XFER`, `TFR`)
- Cash back or rewards (keywords: `CASHBACK`, `REWARD`, `REBATE`)
- Interest earned (keywords: `INTEREST`)
