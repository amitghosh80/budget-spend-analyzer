# MVP Spend Analyzer - Income Identification Flow

### TL;DR
Manual income identification across multiple accounts is tedious, unreliable, and error-prone. The MVP Income Identification Flow uses AI and keyword search to accurately surface, group, and confirm income transactions from checking and savings statements. Built for users seeking fast, reliable setup for their spend analysis, this flow delivers sub-5 minute, high-confidence income identification—even for freelancers and power users with diverse income streams.

---

## Goals

### User Goals
- Instantly identify all major income sources across multiple accounts.
- Confirm or deny AI-suggested transactions in a simple, bulk-friendly interface.
- Easily detect and add missing income via keyword search (e.g., rental or dividend payments).
- View the exact date, amount, and source of every income entry for transparency.
- Complete setup in under 2–3 minutes with no prior training.

### Non-Goals
- Automatic categorization or analysis of expenses (out of scope for MVP).
- Advanced budgeting, net worth tracking, or cash flow projections.
- Ingestion or categorization of credit card or investment account files.

---

## User Stories

**Persona: New User**
- As a new user, I want to upload my checking and savings statements, so that income identification starts without manual entry.
- As a new user, I want to quickly confirm the AI's suggestions, so I can finish setup fast and reduce errors.

**Persona: Freelancer with Multiple Income Sources**
- As a freelancer, I want to see grouped deposits by client (e.g., ACH, Venmo), so I can double-check all side gig income is recorded.
- As a freelancer, I want to use keyword search to find unique payment patterns, so I don't miss rare income (e.g., a one-off payment or interest).

**Persona: Salaried Employee**
- As a salaried employee, I want employer payments (like Microsoft, JPMorgan) to be clearly detected and labeled, so I can confirm my salary is included.
- As a salaried employee, I want the ability to review transaction details (date, amount, source account), so I can catch any discrepancies.

---

## Functional Requirements

- **File Upload & Validation** (Priority: High)
  - *Format Validation*: Detect and alert on unsupported or corrupted file types.
  - *Multi-File Support*: Allow upload of up to 12 months of statements.

- **File Security & Retention** (Priority: High)
  - *Encryption in Transit and at Rest*: All uploaded statement PDFs are encrypted with AES-256 at rest and with TLS/HTTPS in transit.
  - *Auto-Deletion Policy*: Files are deleted from storage either within 48 hours of upload **or** immediately after user confirms income identification—whichever comes first.
  - *User-Facing Security Notice*: Display clear notification about encryption and retention before file upload.
  - *File Upload Logging*: Track time of upload, time of deletion, and retention policy applied.

- **AI Income Detection** (Priority: High)
  - *Pattern Recognition*: Use employer ACH patterns (e.g., "JPMORGAN CHASE PAYROLL", "MICROSOFT PAYROLL") and regularity to group salary deposits.
  - *Non-Salary Identification*: Surface Zelle/Venmo cashouts, distinguishing personal payments from self-transfers.
  - *Interest/Dividend Recognition*: Flag "Interest Paid", "DIVIDEND", or similar patterns as income.
  - *Transfer Filtering*: Use robust heuristics to identify and automatically exclude intra-account transfers (e.g., transactions labeled "Online Transfer from Savings to Checking", transfers between user's own accounts or accounts sharing the same user identity) and refunds. These transfers will not be surfaced as income by default to reduce noise. Users will have the ability to view the excluded transfers if needed.

- **Confirmation Interface** (Priority: High)
  - *Screen 1 - Table View*: Display grouped transactions by source (e.g., "Microsoft Salary", "Brian Heredia/Zelle", "Interest"), with columns for date, amount, description, and source account.
  - *Bulk UX*: Allow single-click confirmation or denial per group/transaction; enable group and bulk actions.
  - *Manual Amount Editing*: Allow inline editing of the amount for any transaction. Changes are highlighted with an orange border or "edited" badge, and original/modified amounts, plus edit timestamps, are tracked. 
    - Amount edit is available both for correcting AI misreadings and for handling one-off or unusual income transaction cases.
  - *Missing Income Button*: Prominent CTA at the table's end to launch keyword search.

- **Keyword Search Flow** (Priority: High)
  - *Iterative Search*: Users can trigger keyword search via "missing income?" button, enter queries (e.g., "rental", "dividend"), and see real-time, highlighted matched results in table format.
  - *Transaction Actions*: Confirm/deny income per result instantly; allow returning to previous screen.
  - *Manual Amount Editing in Search*: Allow inline edit of amount field within the search results, with same visual indicators and audit trail as above.
  - *Multi-Round Search*: Permit repeated keyword searches to incrementally identify niche or missed income.

- **Data Persistence** (Priority: High)
  - *Transaction Storage*: Save user-confirmed income transactions and groupings in persistent storage; keep historical original/edited amount data with timestamps.
  - *Metadata*: Store income source names/types for reuse in expense analysis.

---

## User Experience

**Entry Point & First-Time User Experience**
   - Users land on the Income Identification Flow via dashboard CTA or onboarding link.
   - Short introduction/tooltip explains that only checking and savings statements qualify.  
   - User sees a security banner: "Your uploaded statements are encrypted and deleted automatically—see details."
   - File selector appears; user selects PDF(s) (up to 12).

**File Validation & Processing**
   - System validates file formats in real time.
   - On upload, loading spinner (max 10s) indicates processing. System extracts transactions with OCR/NLP if necessary.

**Screen 1 – AI-Identified Income Table**
   - Upon completion, user sees a table grouped by identified sources (e.g., "Microsoft Payroll," "Brian Heredia/Zelle," "Interest").
   - Each group expands to reveal each transaction: date, amount (inline-editable), original description, source account.
   - If user edits the amount, the row highlights with an orange border and/or an "edited" badge appears.
   - Undo or revert-to-original option for amount edits.
   - Bulk and per-item checkboxes/buttons allow confirmation/denial, with inline undo.
   - Optional: "Details" tooltip for each source, e.g., employer frequency, first/last seen.
   - Transfers filtered as intra-account are automatically hidden from the table to reduce confusion/noise; however, the user can toggle to view these excluded transfers if they wish for review.
   - After reviewing, user clicks "Confirm All" or confirms individually.
   - At the table's end, "Missing income?" button is displayed prominently.

**Screen 2 – Keyword Search for Missing Income**
   - Clicking "missing income?" transitions to search interface.
   - User enters keywords ("rental," "dividend," specific client names).
   - Results table instantly updates with matching transactions (highlighted matches), including date, amount (inline-editable), description, and source account.
   - Inline confirm/deny for each result; inline undo for editing.
   - User can return to Screen 1, and repeat keyword search as needed.

**Final State**
   - Once users finalize, a summary of confirmed income sources, transaction counts, and any manual edits is shown.
   - Clear CTA to proceed to Expense Analysis onboarding.

**Advanced Features & Edge Cases**
   - Users uploading more than 12 statements receive error ("12 month history max for MVP").
   - If AI cannot confidently group a deposit, it presents it as "Uncategorized—Review Needed".
   - Handle low-confidence OCR with warnings and option for manual review.
   - Users have optional visibility into filtered intra-account transfers upon request.
  
**UI/UX Highlights**
   - Responsive design for desktop and tablet.
   - High contrast, WCAG AA-compliant colors.
   - Grouped table with expandable rows for clarity.
   - Inline amount editing with explicit indicators for changes.
   - Progress stepper or indicator at top for transparency.
   - Accessible with ARIA labels and keyboard navigation.
   - Clear "back" and "finish" navigation options at each step.

---

## Narrative

Lisa, a consultant who juggles both salaried work at Microsoft and multiple freelance projects, finally decides she needs real financial insight. Up until now, she's spent hours each tax season toggling between accounts, laboriously identifying each paycheck, Venmo payment, and interest deposit. 

With MVP Spend Analyzer, Lisa quickly uploads her most recent checking and savings statements. At upload, she sees a reassuring message: her sensitive data is protected, and files will be safely deleted within 48 hours or as soon as she's done. The system processes her files in seconds, and the first screen instantly surfaces neatly grouped transactions: every "Microsoft Payroll" deposit, recurring "Zelle: Brian Heredia" rental payment, "Venmo Transfer" side gig, and bank "Interest" credit. Lisa simply reviews, bulk selects, and confirms—all items at once, trusting the recognizable source names and intuitive table display.

She notices one bonus deposit is for a different amount and corrects it in-line, with the change clearly flagged for future review. But she remembers a rare one-off dividend, so she clicks "Missing income?", types "dividend", and the search returns a single match she quickly adds. In less than two minutes, Lisa has captured all income across accounts—no more missed deposits or duplicated salary lines. The app's clarity and precision assure her; she's finally ready for accurate expense analysis. For Lisa, a tedious task is now effortless—and she's more likely to use the service next month.

---

## Technical Considerations

### Technical Needs
- **PDF Parsing:** Robust extraction for common formats (Chase, BofA, Wells Fargo) with fallback to OCR for non-standard layouts.
- **NLP/Keyword Extraction:** Tokenization and high-recall pattern matching for transaction descriptions (ACH, Zelle, Venmo, employer name variants, e.g., "MICROSOFT PAYROLL", "JPMORGAN CHASE PAYROLL", "BRIAN HEREDIA/ZELLE").
- **Transfer Filtering Logic:** Implement rules for robust detection of intra-account transfers—transactions with descriptions indicating transfer from one user-owned account to another (e.g., "Online Transfer from Savings to Checking"), or between accounts registered to the same user. These transactions are auto-tagged as transfers, excluded from income, but available in a separate view if needed.
- **Data Models:** Tables for raw transactions, AI-identified income candidates, user confirmations/overrides, income source metadata, transaction amount edits with edit history, and a log/flags for filtered intra-account transfers.

### Integration Points
- None required for MVP. (No external partners or accounts.)

### Data Storage & Privacy
- **Short-term Storage:** Uploaded files are encrypted at rest (AES-256) and in transit (TLS/HTTPS), stored only until processing is complete.
- **Auto-Deletion:** All statement files are deleted automatically—within 48 hours of upload or immediately after user confirmation. Only transaction metadata (dates, amounts, income categorization, edit history) persists; raw files are never retained beyond policy.
- **File Upload Logs:** Each upload and deletion event is logged, including timestamps and deletion trigger (policy expiry or manual flow completion).
- **Compliance:** Adherence to baseline PII handling, least-access, and transparent user file retention policies.

### Scalability & Performance
- Support processing up to 12 months of statements per user, including concurrent uploads (aim for up to 50 active users per minute for MVP).
- Ensure server-side components are stateless/scalable for peak demand.

