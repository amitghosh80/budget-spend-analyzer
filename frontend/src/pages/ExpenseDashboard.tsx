import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  getExpenseSummary, exportCsv, ExpenseSummary,
  getCategories, CategoryDefinition,
} from "../api/expenseApi";

type Props = {
  onReset: () => void;
  onInsights: () => void;
  onBack: () => void;
};

const COLORS = [
  "#6366f1", "#f59e0b", "#10b981", "#ef4444", "#ec4899",
  "#0ea5e9", "#f97316", "#8b5cf6", "#0891b2", "#84cc16",
  "#d946ef", "#64748b", "#a855f7", "#78716c", "#14b8a6",
  "#94a3b8",
];

type Priority = "high" | "medium" | "low";
type Rec = { priority: Priority; icon: string; title: string; detail: string };
type Goal = { label: string; target: string; why: string; color: string };

const ExpenseDashboard = ({ onReset, onInsights, onBack }: Props) => {
  const [summary, setSummary] = useState<ExpenseSummary | null>(null);
  const [categories, setCategories] = useState<CategoryDefinition[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [data, cats] = await Promise.all([getExpenseSummary(), getCategories()]);
        setSummary(data);
        setCategories(cats);
      } catch {
        // silent
      }
      setLoading(false);
    })();
  }, []);

  if (loading || !summary) {
    return (
      <div className="step-card fade-in">
        <p style={{ textAlign: "center", color: "#94a3b8" }}>
          Loading dashboard...
        </p>
      </div>
    );
  }

  const barData = summary.monthly_totals.map((m) => ({
    month: m.month,
    total: Math.round(m.total),
  }));

  // ── Recommendations + Goals ──
  const catTotals: Record<string, number> = {};
  for (const c of summary.category_totals) catTotals[c.category] = c.total;

  const numMonths = Math.max(summary.monthly_totals.length, 1);
  const grandTotal = summary.total_expenses;

  const fixedSlugs = new Set(categories.filter((c) => c.type === "fixed").map((c) => c.slug));
  let fixedTotal = 0;
  let variableTotal = 0;
  for (const [slug, amt] of Object.entries(catTotals)) {
    if (fixedSlugs.has(slug)) fixedTotal += amt;
    else variableTotal += amt;
  }
  const fixedPct = grandTotal > 0 ? (fixedTotal / grandTotal) * 100 : 0;

  const shopMo    = (catTotals["shopping"]        ?? 0) / numMonths;
  const diningMo  = (catTotals["food_dining"]     ?? 0) / numMonths;
  const groceryMo = (catTotals["groceries"]       ?? 0) / numMonths;
  const cashMo    = (catTotals["cash_atm"]        ?? 0) / numMonths;
  const zelleMo   = (catTotals["zelle_venmo_out"] ?? 0) / numMonths;
  const subTotal  =  catTotals["subscriptions"]   ?? 0;

  // Trend from monthly totals
  let trendPct = 0;
  let trendDir: "up" | "down" | "flat" = "flat";
  if (summary.monthly_totals.length >= 2) {
    const last = summary.monthly_totals[summary.monthly_totals.length - 1].total;
    const prev = summary.monthly_totals[summary.monthly_totals.length - 2].total;
    if (prev > 0) {
      trendPct = ((last - prev) / prev) * 100;
      trendDir = trendPct > 5 ? "up" : trendPct < -5 ? "down" : "flat";
    }
  }

  const recs: Rec[] = [];

  if (fixedPct > 65) {
    recs.push({ priority: "high", icon: "⚠", title: "High fixed-cost burden",
      detail: `${Math.round(fixedPct)}% of spending is locked into fixed obligations (loans, mortgage, utilities). Focus savings efforts on variable expenses.` });
  }
  if (shopMo > 1200) {
    recs.push({ priority: "high", icon: "🛍", title: `Shopping averaging $${Math.round(shopMo).toLocaleString()}/mo`,
      detail: `Shopping is one of the most controllable categories. Try a monthly cap of $${Math.round(shopMo * 0.7).toLocaleString()} to cut 30%.` });
  }
  if (diningMo > groceryMo * 1.5 && diningMo > 700) {
    const savingsPotential = Math.round((diningMo - groceryMo * 0.8) / 2);
    recs.push({ priority: "medium", icon: "🍽", title: `Dining out ($${Math.round(diningMo).toLocaleString()}/mo) outpaces groceries`,
      detail: `Restaurant spend is ${Math.round(diningMo / groceryMo)}× your grocery bill. Shifting 2–3 meals/week home could free ~$${savingsPotential.toLocaleString()}/mo.` });
  }
  if (trendDir === "up" && summary.monthly_totals.length >= 2) {
    const last = summary.monthly_totals[summary.monthly_totals.length - 1];
    const prev = summary.monthly_totals[summary.monthly_totals.length - 2];
    const delta = last.total - prev.total;
    recs.push({ priority: "medium", icon: "📈", title: `Spending rose ${Math.round(Math.abs(trendPct))}% last month`,
      detail: `${last.month} was $${Math.round(delta).toLocaleString()} higher than ${prev.month}. Review that month in Expenses to find the driver.` });
  }
  if (cashMo > 400) {
    recs.push({ priority: "medium", icon: "💵", title: `$${Math.round(cashMo).toLocaleString()}/mo in ATM withdrawals`,
      detail: `Cash spending is invisible once withdrawn. Use card payments to keep every dollar tracked.` });
  }
  if (zelleMo > 600) {
    recs.push({ priority: "low", icon: "💸", title: `$${Math.round(zelleMo).toLocaleString()}/mo in peer payments`,
      detail: `Zelle/Venmo outflows are hard to categorize. Make sure shared expenses and family payments are mentally budgeted for.` });
  }
  if (subTotal > 0) {
    const subCat = summary.category_totals.find((c) => c.category === "subscriptions");
    const subCount = subCat?.transaction_count ?? 0;
    recs.push({ priority: "low", icon: "🔄", title: `${subCount} subscription transactions — $${Math.round(subTotal / numMonths).toLocaleString()}/mo`,
      detail: `Do an annual audit: cancel anything unused for 2+ months. Even cutting 2–3 services can save $200–500/year.` });
  }

  const goals: Goal[] = [];
  if (shopMo > 500) {
    goals.push({ label: "Shopping cap", target: `$${Math.round(shopMo * 0.75).toLocaleString()}/mo`,
      why: `25% cut from current avg of $${Math.round(shopMo).toLocaleString()}`, color: "#f97316" });
  }
  if (diningMo + groceryMo > 1000) {
    goals.push({ label: "Total food budget", target: `$${Math.round((diningMo + groceryMo) * 0.85).toLocaleString()}/mo`,
      why: `Dining + groceries currently $${Math.round(diningMo + groceryMo).toLocaleString()}/mo`, color: "#f59e0b" });
  }
  const emergencyFund = Math.round((fixedTotal / numMonths) * 6);
  goals.push({ label: "Emergency fund target", target: `$${emergencyFund.toLocaleString()}`,
    why: `6× monthly fixed costs ($${Math.round(fixedTotal / numMonths).toLocaleString()}/mo)`, color: "#10b981" });

  return (
    <div className="step-card fade-in">
      <button className="back-btn" onClick={onBack} type="button">← Back</button>
      <div className="step-icon step-icon--done">&#10003;</div>
      <h2>Expense Dashboard</h2>
      <p className="step-desc">
        Here's a visual breakdown of your spending across all accounts.
      </p>

      {/* Summary stats */}
      <div className="confirmed-stats">
        <div className="stat-card stat-card--purple">
          <span className="stat-card__value">
            ${summary.total_expenses.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </span>
          <span className="stat-card__label">Total Expenses</span>
        </div>
        <div className="stat-card stat-card--amber">
          <span className="stat-card__value">
            ${summary.avg_monthly.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </span>
          <span className="stat-card__label">Avg Monthly</span>
        </div>
        <div className="stat-card stat-card--green">
          <span className="stat-card__value">
            {summary.category_totals.length}
          </span>
          <span className="stat-card__label">Categories</span>
        </div>
      </div>

      {/* Monthly Spending bar chart */}
      <div className="chart-card chart-card--full">
        <h3 className="chart-card__title">Monthly Spending</h3>
        {barData.length > 0 ? (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={barData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(value) => `$${Number(value).toLocaleString()}`} />
              <Legend />
              <Bar dataKey="total" name="Expenses" fill="#6366f1" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="empty-state">No monthly data yet.</div>
        )}
      </div>

      {/* Category breakdown table */}
      <div className="category-breakdown">
        <h3 className="chart-card__title">Category Breakdown</h3>
        <div className="category-breakdown__list">
          {summary.category_totals.map((cat, i) => (
            <div key={cat.category} className="category-breakdown__row">
              <span
                className="category-dot"
                style={{ background: COLORS[i % COLORS.length] }}
              />
              <span className="category-breakdown__name">{cat.name}</span>
              <span className="category-breakdown__bar-wrap">
                <span
                  className="category-breakdown__bar"
                  style={{
                    width: `${cat.percentage}%`,
                    background: COLORS[i % COLORS.length],
                  }}
                />
              </span>
              <span className="category-breakdown__pct">{cat.percentage}%</span>
              <span className="category-breakdown__total">
                ${cat.total.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Recommendations ── */}
      {recs.length > 0 && (
        <div className="insights-card" style={{ marginBottom: 20 }}>
          <div className="insights-card__header insights-card__header--amber">
            <span className="insights-card__title">Recommendations</span>
            <span className="insights-card__pill">{recs.length} action{recs.length > 1 ? "s" : ""}</span>
          </div>
          <div className="insights-card__body">
            <div className="insights-recs">
              {recs.map((rec, i) => (
                <div key={i} className={`insights-rec insights-rec--${rec.priority}`}>
                  <div className="insights-rec__header">
                    <span className="insights-rec__icon">{rec.icon}</span>
                    <span className="insights-rec__title">{rec.title}</span>
                    <span className={`insights-rec__badge insights-rec__badge--${rec.priority}`}>
                      {rec.priority}
                    </span>
                  </div>
                  <p className="insights-rec__detail">{rec.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Suggested Goals ── */}
      {goals.length > 0 && (
        <div className="insights-card" style={{ marginBottom: 20 }}>
          <div className="insights-card__header insights-card__header--green">
            <span className="insights-card__title">Suggested Goals</span>
            <span className="insights-card__pill">{goals.length} target{goals.length > 1 ? "s" : ""}</span>
          </div>
          <div className="insights-card__body">
            <div className="insights-goals">
              {goals.map((g, i) => (
                <div key={i} className="insights-goal">
                  <div className="insights-goal__accent" style={{ background: g.color }} />
                  <div className="insights-goal__body">
                    <div className="insights-goal__label">{g.label}</div>
                    <div className="insights-goal__target" style={{ color: g.color }}>{g.target}</div>
                    <div className="insights-goal__why">{g.why}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{ marginTop: 32, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <button className="btn btn--primary btn--lg" onClick={onInsights}>
          View Insights &rarr;
        </button>
        <button className="btn btn--outline btn--lg" onClick={() => exportCsv()}>
          Export CSV
        </button>
        <button className="btn btn--outline btn--lg" onClick={onReset}>
          Upload More Statements
        </button>
      </div>
    </div>
  );
};

export default ExpenseDashboard;
