import { useEffect, useState } from "react";
import {
  getCashflow, CashflowSummary,
  getExpenseSummary, ExpenseSummary,
  getTopMerchants, MerchantTotal,
  getPivotTable, PivotTable,
  getCategories, CategoryDefinition,
  getTransactions, ExpenseTransaction,
  getAccountBreakdown, AccountBreakdownResponse,
  exportCsv,
} from "../api/expenseApi";

const fmt = (n: number) =>
  "$" + Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 });

const fmtPct = (n: number) =>
  (n >= 0 ? "+" : "") + n.toFixed(1) + "%";

// Distinct palette for category bars
const CAT_COLORS = [
  "#6366f1", "#f59e0b", "#10b981", "#ef4444", "#3b82f6",
  "#ec4899", "#8b5cf6", "#14b8a6", "#f97316", "#84cc16",
];

const ACCOUNT_COLORS: Record<string, string> = {
  credit_card: "#6366f1",
  checking: "#10b981",
  savings: "#f59e0b",
};
const ACCOUNT_DISPLAY: Record<string, string> = {
  credit_card: "Credit Card",
  checking: "Checking",
  savings: "Savings",
};

type DrillTarget = {
  label: string;
  filters: { category?: string; search?: string };
} | null;

type Props = { onBack: () => void; onCategoryEditor?: () => void };

const InsightsDashboard = ({ onBack, onCategoryEditor }: Props) => {
  const [cashflow, setCashflow] = useState<CashflowSummary | null>(null);
  const [summary, setSummary] = useState<ExpenseSummary | null>(null);
  const [merchants, setMerchants] = useState<MerchantTotal[]>([]);
  const [pivot, setPivot] = useState<PivotTable | null>(null);
  const [categories, setCategories] = useState<CategoryDefinition[]>([]);
  const [accountBreakdown, setAccountBreakdown] = useState<AccountBreakdownResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Feature A: Drill-down state
  const [drillTarget, setDrillTarget] = useState<DrillTarget>(null);
  const [drillTxns, setDrillTxns] = useState<ExpenseTransaction[]>([]);
  const [drillLoading, setDrillLoading] = useState(false);

  useEffect(() => {
    Promise.all([
      getCashflow(), getExpenseSummary(), getTopMerchants(15),
      getPivotTable(), getCategories(), getAccountBreakdown(),
    ])
      .then(([cf, sm, mr, pv, cats, ab]) => {
        setCashflow(cf); setSummary(sm); setMerchants(mr.merchants);
        setPivot(pv); setCategories(cats); setAccountBreakdown(ab);
      })
      .catch(() => setError("Could not load cashflow data. Make sure the backend is running and expenses have been uploaded."))
      .finally(() => setLoading(false));
  }, []);

  // Feature A: Fetch transactions when drill target changes
  useEffect(() => {
    if (!drillTarget) return;
    setDrillLoading(true);
    setDrillTxns([]);
    getTransactions(drillTarget.filters)
      .then((txns) => setDrillTxns(txns.slice(0, 60)))
      .catch(() => setDrillTxns([]))
      .finally(() => setDrillLoading(false));
  }, [drillTarget]);

  if (loading) {
    return (
      <div className="step-card fade-in">
        <p style={{ textAlign: "center", color: "#94a3b8", padding: "40px 0" }}>
          Loading insights...
        </p>
      </div>
    );
  }

  if (error || !cashflow || cashflow.months.length === 0) {
    return (
      <div className="step-card fade-in">
        <div className="step-icon">3</div>
        <h2>Cashflow Insights</h2>
        <p className="step-desc">
          {error ||
            "No data yet. Complete the Income and Expenses steps first, then come back here."}
        </p>
      </div>
    );
  }

  const maxBar = Math.max(...cashflow.months.map((m) => Math.max(m.income, m.expenses)), 1);
  const avgNetPositive = cashflow.avg_monthly_net >= 0;

  // Savings rate: only for months where income > 0
  const monthsWithIncome = cashflow.months.filter((m) => m.income > 0);
  const savingsRates = cashflow.months.map((m) =>
    m.income > 0 ? (m.net / m.income) * 100 : null
  );
  const avgSavingsRate =
    monthsWithIncome.length > 0
      ? monthsWithIncome.reduce((sum, m) => sum + (m.net / m.income) * 100, 0) /
        monthsWithIncome.length
      : null;
  const savingsBarWidth = (rate: number) => Math.min(Math.abs(rate), 100);

  // Category % of income
  const nMonths = Math.max(monthsWithIncome.length, 1);
  const avgIncome = cashflow.avg_monthly_income;
  const catIncomeRows =
    summary && avgIncome > 0
      ? summary.category_totals
          .map((c, i) => ({
            slug: c.category,
            name: c.name,
            avgMonthly: c.total / nMonths,
            pctOfIncome: (c.total / nMonths / avgIncome) * 100,
            color: CAT_COLORS[i % CAT_COLORS.length],
          }))
          .sort((a, b) => b.pctOfIncome - a.pctOfIncome)
      : [];
  const maxCatPct = Math.max(...catIncomeRows.map((r) => r.pctOfIncome), 1);

  // Feature B: Fixed vs Variable computation
  const typeMap: Record<string, string> = {};
  for (const cat of categories) typeMap[cat.slug] = cat.type;

  const fixedCats = summary
    ? summary.category_totals
        .filter((ct) => (typeMap[ct.category] ?? "variable") === "fixed")
        .sort((a, b) => b.total - a.total)
    : [];
  const variableCats = summary
    ? summary.category_totals
        .filter((ct) => (typeMap[ct.category] ?? "variable") === "variable")
        .sort((a, b) => b.total - a.total)
    : [];
  const fixedTotal = fixedCats.reduce((s, c) => s + c.total, 0);
  const variableTotal = variableCats.reduce((s, c) => s + c.total, 0);
  const fvGrand = fixedTotal + variableTotal;
  const fixedPct = fvGrand > 0 ? (fixedTotal / fvGrand) * 100 : 50;
  const fixedAvgMonthly = fixedTotal / nMonths;
  const variableAvgMonthly = variableTotal / nMonths;

  // Month-over-month category deltas
  type CatDelta = { slug: string; name: string; prev: number; curr: number; delta: number; pct: number };
  const momDeltas: CatDelta[] = [];
  let momPrevLabel = "";
  let momCurrLabel = "";
  if (pivot && pivot.rows.length >= 2) {
    const prevRow = pivot.rows[pivot.rows.length - 2];
    const currRow = pivot.rows[pivot.rows.length - 1];
    momPrevLabel = prevRow.month_label;
    momCurrLabel = currRow.month_label;

    const prevBySlug: Record<string, number> = {};
    const currBySlug: Record<string, number> = {};
    for (const cell of prevRow.categories) prevBySlug[cell.category] = cell.total;
    for (const cell of currRow.categories) currBySlug[cell.category] = cell.total;

    const allSlugs = new Set([...Object.keys(prevBySlug), ...Object.keys(currBySlug)]);
    for (const slug of allSlugs) {
      const prev = prevBySlug[slug] ?? 0;
      const curr = currBySlug[slug] ?? 0;
      const delta = curr - prev;
      if (Math.abs(delta) < 1) continue;
      const name = pivot.all_category_names[slug] ?? slug;
      const pct = prev > 0 ? (delta / prev) * 100 : 100;
      momDeltas.push({ slug, name, prev, curr, delta, pct });
    }
    momDeltas.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  }
  const momIncrease = momDeltas.filter((d) => d.delta > 0).slice(0, 5);
  const momDecrease = momDeltas.filter((d) => d.delta < 0).slice(0, 5);
  const maxMomDelta = Math.max(...momDeltas.map((d) => Math.abs(d.delta)), 1);

  // Top merchants
  const maxMerchantTotal = Math.max(...merchants.map((m) => m.total), 1);
  const cleanMerchantLabel = (name: string) =>
    name.length > 42 ? name.slice(0, 42).replace(/[-\s]+$/, "") + "…" : name;

  // Feature A: Drill handlers
  const handleDrillCategory = (slug: string, name: string) => {
    if (drillTarget?.filters.category === slug) { setDrillTarget(null); return; }
    setDrillTarget({ label: `${name} — Transactions`, filters: { category: slug } });
  };
  const handleDrillMerchant = (merchant: string) => {
    if (drillTarget?.filters.search === merchant) { setDrillTarget(null); return; }
    setDrillTarget({ label: `${cleanMerchantLabel(merchant)} — Transactions`, filters: { search: merchant } });
  };

  // Feature C: Account breakdown data
  const maxAccountTotal = Math.max(
    ...(accountBreakdown?.accounts.map((a) => a.total) ?? [1]),
    1
  );

  return (
    <div className="step-card fade-in">
      <button className="back-btn" onClick={onBack} type="button">← Back</button>
      <div className="step-icon">3</div>
      <h2>Cashflow Insights</h2>
      <p className="step-desc">
        Income vs. expenses across {cashflow.months.length} month
        {cashflow.months.length !== 1 ? "s" : ""}.
      </p>

      {/* ── Summary stat cards ── */}
      <div className="cf-stats">
        <div className="cf-stat cf-stat--income">
          <div className="cf-stat__value">{fmt(cashflow.avg_monthly_income)}</div>
          <div className="cf-stat__label">Avg Monthly Income</div>
        </div>
        <div className="cf-stat cf-stat--expense">
          <div className="cf-stat__value">{fmt(cashflow.avg_monthly_expenses)}</div>
          <div className="cf-stat__label">Avg Monthly Expenses</div>
        </div>
        <div className={`cf-stat ${avgNetPositive ? "cf-stat--surplus" : "cf-stat--deficit"}`}>
          <div className="cf-stat__value">
            {avgNetPositive ? "+" : "−"}{fmt(cashflow.avg_monthly_net)}
          </div>
          <div className="cf-stat__label">Avg Monthly Net</div>
        </div>
      </div>

      {/* ── Month-by-month table ── */}
      <div className="cf-table-wrap">
        <table className="cf-table">
          <thead>
            <tr>
              <th className="cf-table__month-head">Month</th>
              <th>Income</th>
              <th>Expenses</th>
              <th>Net</th>
              <th className="cf-table__bar-head" aria-label="Visual comparison" />
            </tr>
          </thead>
          <tbody>
            {cashflow.months.map((m) => {
              const pos = m.net >= 0;
              return (
                <tr key={m.month}>
                  <td className="cf-table__month">{m.month_label}</td>
                  <td className="cf-table__income">{fmt(m.income)}</td>
                  <td className="cf-table__expense">{fmt(m.expenses)}</td>
                  <td className={`cf-table__net ${pos ? "cf-table__net--pos" : "cf-table__net--neg"}`}>
                    {pos ? "+" : "−"}{fmt(m.net)}
                  </td>
                  <td className="cf-table__bar-cell">
                    <div className="cf-bar-group">
                      <div className="cf-bar-group__track">
                        <div
                          className="cf-bar-group__fill cf-bar-group__fill--income"
                          style={{ width: `${(m.income / maxBar) * 100}%` }}
                        />
                      </div>
                      <div className="cf-bar-group__track">
                        <div
                          className="cf-bar-group__fill cf-bar-group__fill--expense"
                          style={{ width: `${(m.expenses / maxBar) * 100}%` }}
                        />
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td className="cf-table__month cf-table__avg-label">Average</td>
              <td className="cf-table__income">{fmt(cashflow.avg_monthly_income)}</td>
              <td className="cf-table__expense">{fmt(cashflow.avg_monthly_expenses)}</td>
              <td
                className={`cf-table__net ${
                  avgNetPositive ? "cf-table__net--pos" : "cf-table__net--neg"
                }`}
              >
                {avgNetPositive ? "+" : "−"}{fmt(cashflow.avg_monthly_net)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* ── Legend ── */}
      <div className="cf-legend">
        <span className="cf-legend__dot cf-legend__dot--income" />
        <span className="cf-legend__label">Income</span>
        <span className="cf-legend__dot cf-legend__dot--expense" />
        <span className="cf-legend__label">Expenses</span>
      </div>

      {/* ── Savings Rate ── */}
      <div className="sr-section">
        <div className="sr-header">
          <div>
            <h3 className="sr-title">Savings Rate</h3>
            <p className="sr-subtitle">% of income kept each month</p>
          </div>
          {avgSavingsRate !== null && (
            <div className={`sr-avg-badge ${avgSavingsRate >= 0 ? "sr-avg-badge--pos" : "sr-avg-badge--neg"}`}>
              <span className="sr-avg-badge__value">{fmtPct(avgSavingsRate)}</span>
              <span className="sr-avg-badge__label">avg rate</span>
            </div>
          )}
        </div>

        <div className="sr-benchmark">
          <span className="sr-benchmark__line" style={{ left: "20%" }} />
          <span className="sr-benchmark__label" style={{ left: "20%" }}>20% target</span>
        </div>

        <div className="sr-rows">
          {cashflow.months.map((m, i) => {
            const rate = savingsRates[i];
            if (rate === null) {
              return (
                <div key={m.month} className="sr-row">
                  <span className="sr-row__month">{m.month_label}</span>
                  <span className="sr-row__na">— no income data</span>
                </div>
              );
            }
            const pos = rate >= 0;
            return (
              <div key={m.month} className="sr-row">
                <span className="sr-row__month">{m.month_label}</span>
                <div className="sr-row__track">
                  <div
                    className={`sr-row__fill ${pos ? "sr-row__fill--pos" : "sr-row__fill--neg"}`}
                    style={{ width: `${savingsBarWidth(rate)}%` }}
                  />
                  <div className="sr-row__target-mark" />
                </div>
                <span className={`sr-row__pct ${pos ? "sr-row__pct--pos" : "sr-row__pct--neg"}`}>
                  {fmtPct(rate)}
                </span>
              </div>
            );
          })}
        </div>

        <p className="sr-note">
          💡 The 50/30/20 rule recommends saving at least <strong>20%</strong> of take-home income.
        </p>
      </div>

      {/* ── FEATURE B: Fixed vs. Variable Spending ── */}
      {fvGrand > 0 && (
        <div className="fv-section">
          <div className="fv-header">
            <div>
              <h3 className="fv-title">Fixed vs. Variable Spending</h3>
              <p className="fv-subtitle">Fixed = locked-in costs · Variable = discretionary spend</p>
            </div>
          </div>

          <div className="fv-stat-row">
            <div className="fv-stat fv-stat--fixed">
              <div className="fv-stat__value">{fmt(fixedAvgMonthly)}/mo</div>
              <div className="fv-stat__label">Fixed ({fixedPct.toFixed(0)}%)</div>
            </div>
            <div className="fv-stat fv-stat--variable">
              <div className="fv-stat__value">{fmt(variableAvgMonthly)}/mo</div>
              <div className="fv-stat__label">Variable ({(100 - fixedPct).toFixed(0)}%)</div>
            </div>
          </div>

          <div className="fv-split-bar">
            <div className="fv-split-bar__fixed" style={{ flex: fixedPct }} title={`Fixed: ${fixedPct.toFixed(1)}%`} />
            <div className="fv-split-bar__variable" style={{ flex: 100 - fixedPct }} title={`Variable: ${(100 - fixedPct).toFixed(1)}%`} />
          </div>
          <div className="fv-split-labels">
            <span className="fv-split-label fv-split-label--fixed">Fixed</span>
            <span className="fv-split-label fv-split-label--variable">Variable</span>
          </div>

          <div className="fv-columns">
            <div className="fv-col fv-col--fixed">
              <div className="fv-col__heading fv-col__heading--fixed">Fixed Costs</div>
              {fixedCats.map((c) => (
                <div
                  key={c.category}
                  className={`fv-col__row ${drillTarget?.filters.category === c.category ? "fv-col__row--active" : ""}`}
                  onClick={() => handleDrillCategory(c.category, c.name)}
                  title="Click to view transactions"
                >
                  <span className="fv-col__name">{c.name}</span>
                  <span className="fv-col__amt">{fmt(c.total / nMonths)}/mo</span>
                </div>
              ))}
              {fixedCats.length === 0 && <p className="fv-col__empty">None detected</p>}
            </div>
            <div className="fv-col fv-col--variable">
              <div className="fv-col__heading fv-col__heading--variable">Variable Costs</div>
              {variableCats.map((c) => (
                <div
                  key={c.category}
                  className={`fv-col__row ${drillTarget?.filters.category === c.category ? "fv-col__row--active" : ""}`}
                  onClick={() => handleDrillCategory(c.category, c.name)}
                  title="Click to view transactions"
                >
                  <span className="fv-col__name">{c.name}</span>
                  <span className="fv-col__amt">{fmt(c.total / nMonths)}/mo</span>
                </div>
              ))}
              {variableCats.length === 0 && <p className="fv-col__empty">None detected</p>}
            </div>
          </div>
        </div>
      )}

      {/* ── Category % of Income ── */}
      {catIncomeRows.length > 0 && (
        <div className="ci-section">
          <div className="ci-header">
            <div>
              <h3 className="ci-title">Where Your Income Goes</h3>
              <p className="ci-subtitle">
                Avg monthly spend per category as % of avg monthly income ({fmt(avgIncome)}/mo)
                · <span className="ci-hint">click any row to see transactions</span>
              </p>
            </div>
          </div>

          <div className="ci-rows">
            {catIncomeRows.map((row) => (
              <div
                key={row.name}
                className={`ci-row ${drillTarget?.filters.category === row.slug ? "ci-row--active" : ""}`}
                onClick={() => handleDrillCategory(row.slug, row.name)}
                title="Click to view transactions"
              >
                <span className="ci-row__name">{row.name}</span>
                <div className="ci-row__track">
                  <div
                    className="ci-row__fill"
                    style={{
                      width: `${(row.pctOfIncome / maxCatPct) * 100}%`,
                      background: row.color,
                    }}
                  />
                </div>
                <span className="ci-row__pct">{row.pctOfIncome.toFixed(1)}%</span>
                <span className="ci-row__amt">{fmt(row.avgMonthly)}/mo</span>
              </div>
            ))}
          </div>

          {/* stacked visual showing total income allocation */}
          <div className="ci-stack-wrap">
            <p className="ci-stack-label">Income allocation at a glance</p>
            <div className="ci-stack">
              {catIncomeRows.map((row) => {
                const w = Math.min(row.pctOfIncome, 100);
                return w > 0.5 ? (
                  <div
                    key={row.name}
                    className="ci-stack__seg"
                    style={{ flex: w, background: row.color }}
                    title={`${row.name}: ${row.pctOfIncome.toFixed(1)}%`}
                  />
                ) : null;
              })}
              {(() => {
                const totalPct = catIncomeRows.reduce((s, r) => s + Math.min(r.pctOfIncome, 100), 0);
                const remainder = 100 - Math.min(totalPct, 100);
                return remainder > 0 ? (
                  <div
                    className="ci-stack__seg ci-stack__seg--saved"
                    style={{ flex: remainder }}
                    title={`Saved/surplus: ${remainder.toFixed(1)}%`}
                  />
                ) : null;
              })()}
            </div>
            <div className="ci-stack-legend">
              {catIncomeRows.slice(0, 6).map((row) => (
                <span key={row.name} className="ci-stack-legend__item">
                  <span className="ci-stack-legend__dot" style={{ background: row.color }} />
                  {row.name}
                </span>
              ))}
              <span className="ci-stack-legend__item">
                <span className="ci-stack-legend__dot ci-stack-legend__dot--saved" />
                Saved
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Month-over-Month Category Deltas ── */}
      {pivot && pivot.rows.length < 2 && (
        <div className="mom-section">
          <div className="mom-header">
            <h3 className="mom-title">Category Changes</h3>
            <p className="mom-subtitle">Month-over-month comparison requires at least 2 months of data.</p>
          </div>
        </div>
      )}
      {momDeltas.length > 0 && (
        <div className="mom-section">
          <div className="mom-header">
            <h3 className="mom-title">Category Changes: {momPrevLabel} → {momCurrLabel}</h3>
            <p className="mom-subtitle">Which categories moved the most compared to last month</p>
          </div>

          <div className="mom-columns">
            <div className="mom-col">
              <div className="mom-col__heading mom-col__heading--up">▲ Increased</div>
              {momIncrease.length === 0 && (
                <p className="mom-col__empty">No increases</p>
              )}
              {momIncrease.map((d) => (
                <div
                  key={d.slug}
                  className={`mom-row ${drillTarget?.filters.category === d.slug ? "mom-row--active" : ""}`}
                  onClick={() => handleDrillCategory(d.slug, d.name)}
                  title="Click to view transactions"
                >
                  <div className="mom-row__info">
                    <span className="mom-row__name">{d.name}</span>
                    <span className="mom-row__amounts">
                      {fmt(d.prev)} → {fmt(d.curr)}
                    </span>
                  </div>
                  <div className="mom-row__track">
                    <div
                      className="mom-row__fill mom-row__fill--up"
                      style={{ width: `${(Math.abs(d.delta) / maxMomDelta) * 100}%` }}
                    />
                  </div>
                  <span className="mom-row__delta mom-row__delta--up">
                    +{fmt(d.delta)}
                    {Math.abs(d.pct) < 500 && ` (${d.pct > 0 ? "+" : ""}${d.pct.toFixed(0)}%)`}
                  </span>
                </div>
              ))}
            </div>

            <div className="mom-col">
              <div className="mom-col__heading mom-col__heading--down">▼ Decreased</div>
              {momDecrease.length === 0 && (
                <p className="mom-col__empty">No decreases</p>
              )}
              {momDecrease.map((d) => (
                <div
                  key={d.slug}
                  className={`mom-row ${drillTarget?.filters.category === d.slug ? "mom-row--active" : ""}`}
                  onClick={() => handleDrillCategory(d.slug, d.name)}
                  title="Click to view transactions"
                >
                  <div className="mom-row__info">
                    <span className="mom-row__name">{d.name}</span>
                    <span className="mom-row__amounts">
                      {fmt(d.prev)} → {fmt(d.curr)}
                    </span>
                  </div>
                  <div className="mom-row__track">
                    <div
                      className="mom-row__fill mom-row__fill--down"
                      style={{ width: `${(Math.abs(d.delta) / maxMomDelta) * 100}%` }}
                    />
                  </div>
                  <span className="mom-row__delta mom-row__delta--down">
                    −{fmt(Math.abs(d.delta))}
                    {Math.abs(d.pct) < 500 && ` (${d.pct.toFixed(0)}%)`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── FEATURE C: Spending by Account ── */}
      {accountBreakdown && accountBreakdown.accounts.length > 1 && (
        <div className="ab-section">
          <div className="ab-header">
            <h3 className="ab-title">Spending by Account</h3>
            <p className="ab-subtitle">Total across all months</p>
          </div>
          <div className="ab-accounts">
            {accountBreakdown.accounts.map((acc) => {
              const color = ACCOUNT_COLORS[acc.account_source] ?? "#94a3b8";
              const label = ACCOUNT_DISPLAY[acc.account_source] ?? acc.account_source;
              return (
                <div key={acc.account_source} className="ab-row">
                  <div className="ab-row__source">
                    <span className="ab-row__dot" style={{ background: color }} />
                    <span className="ab-row__label">{label}</span>
                  </div>
                  <div className="ab-row__track">
                    <div
                      className="ab-row__fill"
                      style={{ width: `${(acc.total / maxAccountTotal) * 100}%`, background: color }}
                    />
                  </div>
                  <div className="ab-row__numbers">
                    <span className="ab-row__total">{fmt(acc.total)}</span>
                    <span className="ab-row__avg">{fmt(acc.avg_monthly)}/mo</span>
                  </div>
                </div>
              );
            })}
          </div>
          {/* Mini monthly bars per account */}
          {accountBreakdown.months.length > 1 && (
            <div className="ab-monthly">
              <p className="ab-monthly__label">Monthly breakdown</p>
              <div className="ab-monthly__grid">
                {accountBreakdown.months.map((month) => {
                  const label = accountBreakdown.month_labels[month] ?? month;
                  const monthMax = Math.max(
                    ...accountBreakdown.accounts.map(
                      (a) => a.monthly_totals.find((t) => t.month === month)?.total ?? 0
                    ),
                    1
                  );
                  return (
                    <div key={month} className="ab-month-col">
                      <div className="ab-month-bars">
                        {accountBreakdown.accounts.map((acc) => {
                          const t = acc.monthly_totals.find((t) => t.month === month)?.total ?? 0;
                          const color = ACCOUNT_COLORS[acc.account_source] ?? "#94a3b8";
                          return (
                            <div key={acc.account_source} className="ab-month-bar-wrap">
                              <div
                                className="ab-month-bar"
                                style={{
                                  height: `${(t / monthMax) * 48}px`,
                                  background: color,
                                }}
                                title={`${ACCOUNT_DISPLAY[acc.account_source] ?? acc.account_source}: ${fmt(t)}`}
                              />
                            </div>
                          );
                        })}
                      </div>
                      <div className="ab-month-label">{label.split(" ")[0]}</div>
                    </div>
                  );
                })}
              </div>
              <div className="ab-legend">
                {accountBreakdown.accounts.map((acc) => {
                  const color = ACCOUNT_COLORS[acc.account_source] ?? "#94a3b8";
                  const label = ACCOUNT_DISPLAY[acc.account_source] ?? acc.account_source;
                  return (
                    <span key={acc.account_source} className="ab-legend__item">
                      <span className="ab-legend__dot" style={{ background: color }} />
                      {label}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Top Merchants ── */}
      {merchants.length > 0 && (
        <div className="tm-section">
          <div className="tm-header">
            <h3 className="tm-title">Top Merchants by Spend</h3>
            <p className="tm-subtitle">
              Where your money actually goes — total across all months
              · <span className="ci-hint">click any row to see transactions</span>
            </p>
          </div>

          <div className="tm-rows">
            {merchants.map((m, i) => (
              <div
                key={m.merchant}
                className={`tm-row ${drillTarget?.filters.search === m.merchant ? "tm-row--active" : ""}`}
                onClick={() => handleDrillMerchant(m.merchant)}
                title="Click to view transactions"
              >
                <span className="tm-row__rank">#{i + 1}</span>
                <div className="tm-row__info">
                  <span className="tm-row__name" title={m.merchant}>
                    {cleanMerchantLabel(m.merchant)}
                  </span>
                  <span className="tm-row__meta">
                    {m.transaction_count} txn{m.transaction_count !== 1 ? "s" : ""} · {fmt(m.avg_per_transaction)} avg{m.top_category ? ` · ${m.top_category}` : ""}
                  </span>
                </div>
                <div className="tm-row__track">
                  <div
                    className="tm-row__fill"
                    style={{ width: `${(m.total / maxMerchantTotal) * 100}%` }}
                  />
                </div>
                <span className="tm-row__total">{fmt(m.total)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Footer actions ── */}
      <div className="id-footer">
        <button
          className="btn btn--outline"
          type="button"
          onClick={() => exportCsv()}
        >
          Export CSV
        </button>
        {onCategoryEditor && (
          <button
            className="btn btn--outline"
            type="button"
            onClick={onCategoryEditor}
          >
            Edit Categories
          </button>
        )}
      </div>

      {/* ── FEATURE A: Transaction Drill-Down Overlay ── */}
      {drillTarget && (
        <div className="drill-overlay" onClick={() => setDrillTarget(null)}>
          <div className="drill-panel" onClick={(e) => e.stopPropagation()}>
            <div className="drill-panel__header">
              <span className="drill-panel__title">{drillTarget.label}</span>
              <button
                className="drill-panel__close"
                onClick={() => setDrillTarget(null)}
                type="button"
              >
                ✕
              </button>
            </div>
            {drillLoading ? (
              <p className="drill-panel__status">Loading transactions…</p>
            ) : drillTxns.length === 0 ? (
              <p className="drill-panel__status">No transactions found.</p>
            ) : (
              <>
                <p className="drill-panel__count">{drillTxns.length} transaction{drillTxns.length !== 1 ? "s" : ""}</p>
                <div className="drill-txn-list">
                  {drillTxns.map((txn) => (
                    <div key={txn.id} className="drill-txn-row">
                      <span className="drill-txn__date">{txn.date}</span>
                      <span className="drill-txn__desc" title={txn.description}>
                        {txn.merchant || txn.description.slice(0, 48)}
                      </span>
                      <span className="drill-txn__cat">{txn.category.replace(/_/g, " ")}</span>
                      <span className="drill-txn__amount">{fmt(txn.amount)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default InsightsDashboard;
