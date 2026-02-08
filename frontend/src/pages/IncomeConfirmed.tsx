import { ConfirmResponse } from "../api/incomeApi";

type Props = {
  result: ConfirmResponse;
  onReset: () => void;
};

const CATEGORY_COLORS: Record<string, string> = {
  salary: "#6366f1",
  rental: "#f59e0b",
  pension: "#10b981",
  freelance: "#ec4899",
  other: "#8b5cf6",
};

const toMonthly = (amount: number, frequency: string): number => {
  switch (frequency) {
    case "biweekly":
      return amount * 26 / 12;
    case "weekly":
      return amount * 52 / 12;
    case "quarterly":
      return amount / 3;
    default:
      return amount;
  }
};

const IncomeConfirmed = ({ result, onReset }: Props) => {
  const totalMonthly = result.confirmed
    .reduce((sum, c) => sum + toMonthly(c.amount_per_occurrence, c.frequency), 0);

  return (
    <div className="step-card fade-in">
      <div className="step-icon step-icon--done">&#10003;</div>
      <h2>Income Confirmed!</h2>
      <p className="step-desc">
        Your income sources have been saved. Here's a summary of what we locked
        in.
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
        <div className="stat-card stat-card--green">
          <span className="stat-card__value">
            ${totalMonthly.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </span>
          <span className="stat-card__label">Est. Monthly Income</span>
        </div>
      </div>

      {result.confirmed.length > 0 && (
        <div className="confirmed-list">
          <h3>Confirmed Income Sources</h3>
          {result.confirmed.map((c) => (
            <div
              key={c.id}
              className="confirmed-row"
              style={{
                borderLeftColor: CATEGORY_COLORS[c.category] || "#6366f1",
              }}
            >
              <div className="confirmed-row__main">
                <span className="confirmed-row__name">{c.source_name}</span>
                <span className="confirmed-row__category">{c.category}</span>
              </div>
              <div className="confirmed-row__meta">
                <span>
                  ${toMonthly(c.amount_per_occurrence, c.frequency).toLocaleString(undefined, { maximumFractionDigits: 0 })} / mo
                  {c.frequency !== "monthly" && (
                    <span className="confirmed-row__orig">
                      {" "}(${c.amount_per_occurrence.toLocaleString()} / {c.frequency})
                    </span>
                  )}
                </span>
                {c.is_fixed_income && (
                  <span className="badge badge--fixed">Fixed Income</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <button className="btn btn--primary btn--lg" onClick={onReset}>
        Upload More Statements
      </button>
    </div>
  );
};

export default IncomeConfirmed;
