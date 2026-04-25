import { useEffect, useState, useMemo } from "react";
import {
  getTransactions,
  getCategories,
  getPivotTable,
  bulkCategorize,
  addCategory,
  ExpenseTransaction,
  CategoryDefinition,
  ExpenseUploadResponse,
  PivotTable,
} from "../api/expenseApi";

type Props = {
  uploadResult: ExpenseUploadResponse;
  onContinue: () => void;
  onBack: () => void;
};

type SortKey = "date" | "amount" | "merchant" | "category";
type SortDir = "asc" | "desc";

const CATEGORY_COLORS: Record<string, string> = {
  mortgage: "#6366f1",
  utilities: "#0ea5e9",
  insurance: "#8b5cf6",
  auto_loan: "#7c3aed",
  loan_payment: "#4f46e5",
  food_dining: "#f59e0b",
  groceries: "#10b981",
  transportation: "#64748b",
  healthcare: "#ef4444",
  entertainment: "#ec4899",
  shopping: "#f97316",
  subscriptions: "#6366f1",
  travel: "#0891b2",
  education: "#a855f7",
  personal_care: "#d946ef",
  pets: "#84cc16",
  home: "#78716c",
  childcare: "#fb923c",
  donations: "#14b8a6",
  fees_charges: "#dc2626",
  cash_atm: "#475569",
  taxes: "#b91c1c",
  professional: "#7c3aed",
  zelle_venmo_out: "#2563eb",
  uncategorized: "#94a3b8",
};

const PAGE_SIZE = 25;

const ExpenseReview = ({ uploadResult, onContinue, onBack }: Props) => {
  const [transactions, setTransactions] = useState<ExpenseTransaction[]>([]);
  const [categories, setCategories] = useState<CategoryDefinition[]>([]);
  const [pivot, setPivot] = useState<PivotTable | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterMonth, setFilterMonth] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkCategory, setBulkCategory] = useState("");
  const [showNewCat, setShowNewCat] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatType, setNewCatType] = useState<"fixed" | "variable">("variable");
  const [newCatError, setNewCatError] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [txns, cats, piv] = await Promise.all([
          getTransactions(),
          getCategories(),
          getPivotTable(),
        ]);
        setTransactions(txns);
        setCategories(cats);
        setPivot(piv);
      } catch {
        // silent
      }
      setLoading(false);
    })();
  }, []);

  const filtered = transactions
    .filter((t) => {
      if (filterMonth && !t.date.startsWith(filterMonth)) return false;
      if (filterCategory && t.category !== filterCategory) return false;
      if (search) {
        const s = search.toLowerCase();
        return (
          t.description.toLowerCase().includes(s) ||
          t.merchant.toLowerCase().includes(s)
        );
      }
      return true;
    })
    .sort((a, b) => {
      let cmp = 0;
      if (sortKey === "date") cmp = a.date.localeCompare(b.date);
      else if (sortKey === "amount") cmp = a.amount - b.amount;
      else if (sortKey === "merchant") cmp = a.merchant.localeCompare(b.merchant);
      else if (sortKey === "category") cmp = a.category.localeCompare(b.category);
      return sortDir === "asc" ? cmp : -cmp;
    });

  // Reset to page 1 whenever any filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [filterMonth, filterCategory, search]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((t) => t.id)));
    }
  };

  const handleBulkCategorize = async () => {
    if (!bulkCategory || selected.size === 0) return;
    try {
      const updated = await bulkCategorize(Array.from(selected), bulkCategory);
      setTransactions((prev) =>
        prev.map((t) => {
          const u = updated.find((x) => x.id === t.id);
          return u || t;
        })
      );
      setSelected(new Set());
      setBulkCategory("");
      // Refresh pivot after re-categorization
      const piv = await getPivotTable();
      setPivot(piv);
    } catch {
      // silent
    }
  };

  const handleCreateAndAssign = async () => {
    const trimmed = newCatName.trim();
    if (!trimmed) { setNewCatError("Name is required."); return; }
    if (selected.size === 0) { setNewCatError("Select transactions first."); return; }
    const slug = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    if (categories.some((c) => c.slug === slug)) {
      setNewCatError(`"${trimmed}" already exists. Use "Move to" instead.`);
      return;
    }
    try {
      const newCat = await addCategory(slug, trimmed, newCatType);
      const updated = await bulkCategorize(Array.from(selected), slug);
      setCategories((prev) => [...prev, newCat]);
      setTransactions((prev) =>
        prev.map((t) => { const u = updated.find((x) => x.id === t.id); return u || t; })
      );
      setSelected(new Set());
      setShowNewCat(false);
      setNewCatName("");
      setNewCatError("");
      const piv = await getPivotTable();
      setPivot(piv);
    } catch {
      setNewCatError("Failed to create category. Please try again.");
    }
  };

  const handleInlineCategory = async (txnId: string, newCategory: string) => {
    try {
      const updated = await bulkCategorize([txnId], newCategory);
      setTransactions((prev) =>
        prev.map((t) => {
          const u = updated.find((x) => x.id === t.id);
          return u || t;
        })
      );
      // Refresh pivot after re-categorization
      const piv = await getPivotTable();
      setPivot(piv);
    } catch {
      // silent
    }
  };

  // ── Insights computation ──────────────────────────────────────────────────
  const insights = useMemo(() => {
    if (!pivot || pivot.rows.length === 0 || transactions.length === 0) return null;

    const numMonths = pivot.rows.length;
    const grandTotal = pivot.grand_total;
    const monthlyAvg = grandTotal / numMonths;

    // Category totals across all months
    const catTotals: Record<string, number> = {};
    for (const cat of pivot.all_categories) {
      const total = pivot.rows.reduce((sum, row) => {
        const cell = row.categories.find((c) => c.category === cat);
        return sum + (cell?.total ?? 0);
      }, 0);
      if (total > 0) catTotals[cat] = total;
    }

    // Fixed vs variable split (using category type from categories list)
    const fixedSlugs = new Set(categories.filter((c) => c.type === "fixed").map((c) => c.slug));
    let fixedTotal = 0;
    let variableTotal = 0;
    for (const [slug, amt] of Object.entries(catTotals)) {
      if (fixedSlugs.has(slug)) fixedTotal += amt;
      else variableTotal += amt;
    }
    const fixedPct = grandTotal > 0 ? (fixedTotal / grandTotal) * 100 : 0;

    // Top spending categories (top 5, sorted by total)
    const topCats = Object.entries(catTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    const maxCatTotal = topCats[0]?.[1] ?? 1;

    // Per-month amounts for each top category
    const monthlyTopCats = topCats.map(([cat, total]) => ({
      cat,
      total,
      months: pivot.rows.map((row) => ({
        month: row.month,
        monthLabel: row.month_label,
        amount: row.categories.find((c) => c.category === cat)?.total ?? 0,
      })),
    }));

    // Month-over-month trend (last 2 months)
    let trendPct = 0;
    let trendDir: "up" | "down" | "flat" = "flat";
    if (numMonths >= 2) {
      const last = pivot.rows[numMonths - 1].row_total;
      const prev = pivot.rows[numMonths - 2].row_total;
      if (prev > 0) {
        trendPct = ((last - prev) / prev) * 100;
        if (trendPct > 5) trendDir = "up";
        else if (trendPct < -5) trendDir = "down";
      }
    }

    return {
      grandTotal, monthlyAvg, numMonths,
      catTotals, topCats, maxCatTotal, monthlyTopCats,
      fixedTotal, variableTotal, fixedPct,
      trendDir, trendPct,
    };
  }, [pivot, transactions, categories]);

  const sortArrow = (key: SortKey) => {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? " \u25B2" : " \u25BC";
  };

  const catName = (slug: string) => {
    const c = categories.find((x) => x.slug === slug);
    return c ? c.name : slug.replace("_", " ");
  };

  const fmt = (n: number) =>
    n > 0 ? "$" + n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : "";

  if (loading) {
    return (
      <div className="step-card fade-in">
        <p style={{ textAlign: "center", color: "#94a3b8" }}>
          Loading transactions...
        </p>
      </div>
    );
  }

  return (
    <div className="step-card fade-in">
      <button className="back-btn" onClick={onBack} type="button">← Back</button>
      <div className="step-icon">$</div>
      <h2>Expense Review</h2>
      <p className="step-desc">
        {uploadResult.new_transactions} new transactions categorized.
        {uploadResult.duplicate_count > 0 &&
          ` ${uploadResult.duplicate_count} duplicates skipped.`}
        {uploadResult.excluded_count > 0 &&
          ` ${uploadResult.excluded_count} CC payments excluded.`}
      </p>

      {/* ── Insights ── */}
      {insights && (
        <div className="insights-panel">

          {/* ── Card 1: Spending Snapshot ── */}
          <div className="insights-card">
            <div className="insights-card__header insights-card__header--purple">
              <span className="insights-card__title">Top Spending Categories</span>
              <div className="insights-card__meta">
                <span>${Math.round(insights.grandTotal).toLocaleString()} total</span>
                <span className="insights-card__sep">·</span>
                <span>${Math.round(insights.monthlyAvg).toLocaleString()}/mo avg over {insights.numMonths} months</span>
                {insights.trendDir !== "flat" && (
                  <>
                    <span className="insights-card__sep">·</span>
                    <span style={{ color: insights.trendDir === "up" ? "#f87171" : "#34d399", fontWeight: 600 }}>
                      {insights.trendDir === "up" ? "▲" : "▼"} {Math.abs(Math.round(insights.trendPct))}% last month
                    </span>
                  </>
                )}
              </div>
            </div>
            <div className="insights-card__body">
              <table className="cat-month-table">
                <thead>
                  <tr>
                    <th className="cat-month-table__cat-head">Category</th>
                    {pivot!.rows.map((row) => (
                      <th key={row.month} className="cat-month-table__month-head">
                        {row.month_label}
                      </th>
                    ))}
                    <th className="cat-month-table__total-head">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {insights.monthlyTopCats.map(({ cat, total, months }) => {
                    const maxMonth = Math.max(...months.map((m) => m.amount), 1);
                    return (
                      <tr key={cat}>
                        <td className="cat-month-table__cat-cell">
                          <div className="cat-month-table__cat-inner">
                            <span
                              className="category-dot"
                              style={{ background: CATEGORY_COLORS[cat] || "#94a3b8" }}
                            />
                            {pivot!.all_category_names[cat]}
                          </div>
                        </td>
                        {months.map((m) => (
                          <td key={m.month} className="cat-month-table__month-cell">
                            <div className="cat-month-table__amt">
                              {m.amount > 0
                                ? `$${Math.round(m.amount).toLocaleString()}`
                                : "—"}
                            </div>
                            <div className="cat-month-table__mini-track">
                              <div
                                className="cat-month-table__mini-fill"
                                style={{
                                  width: m.amount > 0
                                    ? `${(m.amount / maxMonth) * 100}%`
                                    : "0%",
                                  background: CATEGORY_COLORS[cat] || "#94a3b8",
                                }}
                              />
                            </div>
                          </td>
                        ))}
                        <td className="cat-month-table__total-cell">
                          <span className="cat-month-table__total-amt">
                            ${Math.round(total).toLocaleString()}
                          </span>
                          <span className="cat-month-table__pct">
                            {Math.round((total / insights.grandTotal) * 100)}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="cat-month-table__col-total-row">
                    <td className="cat-month-table__col-total-label">Total</td>
                    {pivot!.rows.map((row, colIdx) => {
                      const colSum = insights.monthlyTopCats.reduce(
                        (sum, { months }) => sum + (months[colIdx]?.amount ?? 0),
                        0
                      );
                      return (
                        <td key={row.month} className="cat-month-table__col-total-cell">
                          {colSum > 0 ? `$${Math.round(colSum).toLocaleString()}` : "—"}
                        </td>
                      );
                    })}
                    <td className="cat-month-table__col-total-cell cat-month-table__col-total-cell--grand">
                      ${Math.round(insights.monthlyTopCats.reduce((s, { total }) => s + total, 0)).toLocaleString()}
                    </td>
                  </tr>
                </tfoot>
              </table>

              {/* Fixed vs Variable inline */}
              <div className="insights-fv-wrap">
                <div className="insights-fv-labels">
                  <span className="insights-fv-label--fixed">
                    Fixed obligations &mdash; ${Math.round(insights.fixedTotal).toLocaleString()} ({Math.round(insights.fixedPct)}%)
                  </span>
                  <span className="insights-fv-label--variable">
                    Variable &mdash; ${Math.round(insights.variableTotal).toLocaleString()} ({Math.round(100 - insights.fixedPct)}%)
                  </span>
                </div>
                <div className="insights-fv-track">
                  <div
                    className="insights-fv-track__fixed"
                    style={{ width: `${insights.fixedPct}%` }}
                  />
                  <div
                    className="insights-fv-track__variable"
                    style={{ width: `${100 - insights.fixedPct}%` }}
                  />
                </div>
              </div>
            </div>
          </div>


        </div>
      )}

      {/* ── Pivot table: Category × Month ── */}
      {pivot && pivot.rows.length > 0 && (
        <div className="pivot-section">
          <h3 className="pivot-section__title">Monthly Breakdown by Category</h3>
          <div className="pivot-table-wrap">
            <table className="pivot-table">
              <thead>
                <tr>
                  <th className="pivot-table__cat-col">Category</th>
                  {pivot.rows.map((row) => (
                    <th key={row.month} className="pivot-table__month-col">
                      {row.month_label}
                    </th>
                  ))}
                  <th className="pivot-table__total-col">Total</th>
                </tr>
              </thead>
              <tbody>
                {pivot.all_categories.map((cat) => {
                  const rowTotal = pivot.rows.reduce((sum, row) => {
                    const cell = row.categories.find((c) => c.category === cat);
                    return sum + (cell?.total ?? 0);
                  }, 0);
                  if (rowTotal === 0) return null;
                  return (
                    <tr key={cat}>
                      <td className="pivot-table__month">
                        <span
                          className="category-dot"
                          style={{
                            background: CATEGORY_COLORS[cat] || "#94a3b8",
                            display: "inline-block",
                            marginRight: 6,
                            verticalAlign: "middle",
                          }}
                        />
                        {pivot.all_category_names[cat]}
                      </td>
                      {pivot.rows.map((row) => {
                        const cell = row.categories.find((c) => c.category === cat);
                        const total = cell?.total ?? 0;
                        return (
                          <td
                            key={row.month}
                            className={`pivot-table__cell ${
                              total > 0 ? "" : "pivot-table__cell--empty"
                            }`}
                          >
                            {fmt(total)}
                          </td>
                        );
                      })}
                      <td className="pivot-table__row-total">{fmt(rowTotal)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td className="pivot-table__month">Total</td>
                  {pivot.rows.map((row) => (
                    <td key={row.month} className="pivot-table__col-total">
                      {fmt(row.row_total)}
                    </td>
                  ))}
                  <td className="pivot-table__grand-total">{fmt(pivot.grand_total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ── Filters ── */}
      <div className="expense-filters">
        <input
          type="text"
          className="rescan-input"
          placeholder="Search transactions..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 240 }}
        />
        <select
          className="expense-select"
          value={filterMonth}
          onChange={(e) => setFilterMonth(e.target.value)}
        >
          <option value="">All Months</option>
          {(pivot?.rows ?? []).map((row) => (
            <option key={row.month} value={row.month}>
              {row.month_label}
            </option>
          ))}
        </select>
        <select
          className="expense-select"
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
        >
          <option value="">All Categories</option>
          {categories
            .filter((c) => c.slug !== "uncategorized")
            .map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          <option value="uncategorized">Uncategorized</option>
        </select>
      </div>

      {/* Bulk actions */}
      {selected.size > 0 && (
        <div className="bulk-bar">
          <span className="bulk-bar__count">{selected.size} selected</span>

          {!showNewCat ? (
            <>
              <select
                className="expense-select"
                value={bulkCategory}
                onChange={(e) => setBulkCategory(e.target.value)}
              >
                <option value="">Move to...</option>
                {categories.map((c) => (
                  <option key={c.slug} value={c.slug}>{c.name}</option>
                ))}
              </select>
              <button
                className="btn btn--primary"
                onClick={handleBulkCategorize}
                disabled={!bulkCategory}
              >
                Apply
              </button>
              <span className="bulk-bar__divider">or</span>
              <button
                className="btn btn--outline"
                onClick={() => { setShowNewCat(true); setNewCatError(""); }}
                type="button"
              >
                + New Category
              </button>
            </>
          ) : (
            <div className="bulk-new-cat">
              <input
                className="rescan-input"
                placeholder="Category name..."
                value={newCatName}
                onChange={(e) => { setNewCatName(e.target.value); setNewCatError(""); }}
                onKeyDown={(e) => e.key === "Enter" && handleCreateAndAssign()}
                autoFocus
              />
              <select
                className="expense-select"
                value={newCatType}
                onChange={(e) => setNewCatType(e.target.value as "fixed" | "variable")}
              >
                <option value="variable">Variable</option>
                <option value="fixed">Fixed</option>
              </select>
              <button className="btn btn--primary" onClick={handleCreateAndAssign} type="button">
                Create &amp; Assign
              </button>
              <button
                className="btn btn--outline"
                onClick={() => { setShowNewCat(false); setNewCatName(""); setNewCatError(""); }}
                type="button"
              >
                Cancel
              </button>
              {newCatError && <span className="bulk-new-cat__error">{newCatError}</span>}
            </div>
          )}
        </div>
      )}

      {/* Transaction table */}
      <div className="expense-table-wrap">
        <table className="expense-table">
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  checked={selected.size === filtered.length && filtered.length > 0}
                  onChange={toggleSelectAll}
                />
              </th>
              <th onClick={() => toggleSort("date")} className="sortable">
                Date{sortArrow("date")}
              </th>
              <th onClick={() => toggleSort("merchant")} className="sortable">
                Merchant{sortArrow("merchant")}
              </th>
              <th onClick={() => toggleSort("amount")} className="sortable">
                Amount{sortArrow("amount")}
              </th>
              <th onClick={() => toggleSort("category")} className="sortable">
                Category{sortArrow("category")}
              </th>
              <th>Account</th>
            </tr>
          </thead>
          <tbody>
            {paginated.map((t) => (
              <tr key={t.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={selected.has(t.id)}
                    onChange={() => toggleSelect(t.id)}
                  />
                </td>
                <td className="expense-table__date">{t.date}</td>
                <td>
                  <div className="expense-table__merchant">{t.merchant}</div>
                  <div className="expense-table__desc">{t.description}</div>
                </td>
                <td className="expense-table__amount">
                  ${t.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </td>
                <td>
                  <select
                    className="category-chip"
                    style={{
                      borderColor: CATEGORY_COLORS[t.category] || "#94a3b8",
                      color: CATEGORY_COLORS[t.category] || "#94a3b8",
                    }}
                    value={t.category}
                    onChange={(e) => handleInlineCategory(t.id, e.target.value)}
                  >
                    {categories.map((c) => (
                      <option key={c.slug} value={c.slug}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="expense-table__account">{t.account_source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && (
        <div className="empty-state">No transactions match your filters.</div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="pagination">
          <button
            className="pagination__btn"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
          >
            ‹ Prev
          </button>
          <span className="pagination__info">
            {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)}{" "}
            of {filtered.length}
          </span>
          <div className="pagination__pages">
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
              .reduce<(number | "…")[]>((acc, p, idx, arr) => {
                if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("…");
                acc.push(p);
                return acc;
              }, [])
              .map((p, i) =>
                p === "…" ? (
                  <span key={`ellipsis-${i}`} className="pagination__ellipsis">…</span>
                ) : (
                  <button
                    key={p}
                    className={`pagination__page ${currentPage === p ? "pagination__page--active" : ""}`}
                    onClick={() => setCurrentPage(p as number)}
                  >
                    {p}
                  </button>
                )
              )}
          </div>
          <button
            className="pagination__btn"
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
          >
            Next ›
          </button>
        </div>
      )}

      <div style={{ marginTop: 24, display: "flex", justifyContent: "flex-end" }}>
        <button className="btn btn--primary btn--lg" onClick={onContinue}>
          Dashboard &rarr;
        </button>
      </div>
    </div>
  );
};

export default ExpenseReview;
