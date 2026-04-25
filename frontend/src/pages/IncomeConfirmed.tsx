import { ConfirmResponse, DetectedIncome } from "../api/incomeApi";
import type { MonthlyOverrides } from "./IncomeReview";

type Props = {
  result: ConfirmResponse;
  detected: DetectedIncome[];
  monthlyOverrides: MonthlyOverrides;
  onReset: () => void;
  onContinue: () => void;
  onBack: () => void;
};

const CATEGORY_COLORS: Record<string, string> = {
  salary: "#6366f1",
  rental: "#f59e0b",
  pension: "#10b981",
  freelance: "#ec4899",
  other: "#8b5cf6",
};

type MonthBreakdown = {
  total: number;
  sources: { name: string; category: string; amount: number }[];
};

const IncomeConfirmed = ({ result, detected, monthlyOverrides, onReset, onContinue, onBack }: Props) => {
  const confirmedIds = new Set(result.confirmed.map((c) => c.id));

  // Build month-wise totals with per-source breakdown
  const months: Record<string, MonthBreakdown> = {};

  for (const det of detected) {
    if (!confirmedIds.has(det.id)) continue;
    const overrides = monthlyOverrides[det.id];
    for (let i = 0; i < (det.monthly_totals ?? []).length; i++) {
      const mt = det.monthly_totals[i];
      const ov = overrides?.[i];
      const parsed = ov !== undefined ? parseFloat(ov) : NaN;
      const value = isNaN(parsed) ? mt.total : parsed;

      if (!months[mt.month]) {
        months[mt.month] = { total: 0, sources: [] };
      }
      months[mt.month].total += value;
      months[mt.month].sources.push({
        name: det.source_name,
        category: det.category,
        amount: value,
      });
    }
  }

  const monthEntries = Object.entries(months);

  return (
    <div className="step-card fade-in">
      <button className="back-btn" onClick={onBack} type="button">← Back</button>
      <div className="step-icon step-icon--done">&#10003;</div>
      <h2>Income Confirmed!</h2>
      <p className="step-desc">
        Your income sources have been saved. Here's your month-by-month
        breakdown.
      </p>

      <div className="confirmed-stats">
        <div className="stat-card stat-card--purple">
          <span className="stat-card__value">{result.confirmed.length}</span>
          <span className="stat-card__label">Confirmed Sources</span>
        </div>
        <div className="stat-card stat-card--amber">
          <span className="stat-card__value">{result.dismissed_count}</span>
          <span className="stat-card__label">Dismissed</span>
        </div>
        {monthEntries.length > 0 && (
          <div className="stat-card stat-card--green">
            <span className="stat-card__value">
              ${Math.round(
                monthEntries.reduce((s, [, m]) => s + m.total, 0) / monthEntries.length
              ).toLocaleString()}
            </span>
            <span className="stat-card__label">Avg Monthly Income</span>
          </div>
        )}
      </div>

      {monthEntries.length > 0 && (
        <div className="month-breakdown-list">
          {monthEntries.map(([month, data]) => (
            <div key={month} className="month-block">
              <div className="month-block__header">
                <span className="month-block__name">{month}</span>
                <span className="month-block__total">
                  ${data.total.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
              </div>
              <div className="month-block__sources">
                {data.sources.map((src, i) => (
                  <div key={i} className="month-block__source">
                    <span
                      className="category-dot"
                      style={{ background: CATEGORY_COLORS[src.category] || "#6366f1" }}
                    />
                    <span className="month-block__source-name">{src.name}</span>
                    <span className="month-block__source-amount">
                      ${src.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
        <button className="btn btn--primary btn--lg" onClick={onContinue}>
          Continue to Expenses &rarr;
        </button>
        <button className="btn btn--outline btn--lg" onClick={onReset}>
          Upload More Statements
        </button>
      </div>
    </div>
  );
};

export default IncomeConfirmed;
