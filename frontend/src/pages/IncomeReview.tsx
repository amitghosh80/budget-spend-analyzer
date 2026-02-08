import { useState } from "react";
import {
  DetectedIncome,
  ConfirmationItem,
  confirmIncome,
  rescanIncome,
  ConfirmResponse,
} from "../api/incomeApi";

type Props = {
  detected: DetectedIncome[];
  onConfirmed: (resp: ConfirmResponse) => void;
  onMoreDetected: (newItems: DetectedIncome[]) => void;
};

const CATEGORY_COLORS: Record<string, string> = {
  salary: "#6366f1",
  rental: "#f59e0b",
  pension: "#10b981",
  freelance: "#ec4899",
  other: "#8b5cf6",
  transfer: "#64748b",
};

const CATEGORY_LABELS: Record<string, string> = {
  salary: "Salary / Employment",
  rental: "Rental Income",
  pension: "Pension / Social Security",
  freelance: "Freelance / Consulting",
  other: "Other Income",
  transfer: "Transfer",
};

const CONFIDENCE_STYLES: Record<string, { bg: string; text: string }> = {
  high: { bg: "#dcfce7", text: "#166534" },
  medium: { bg: "#fef9c3", text: "#854d0e" },
  low: { bg: "#fee2e2", text: "#991b1b" },
};

const IncomeReview = ({ detected, onConfirmed, onMoreDetected }: Props) => {
  const [decisions, setDecisions] = useState<Record<string, "confirmed" | "dismissed">>({});
  const [amountOverrides, setAmountOverrides] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rescanOpen, setRescanOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [rescanning, setRescanning] = useState(false);
  const [rescanMsg, setRescanMsg] = useState<string | null>(null);

  const allDecided = detected.length > 0 && detected.every((d) => decisions[d.id]);

  const setDecision = (id: string, status: "confirmed" | "dismissed") => {
    setDecisions((prev) => ({ ...prev, [id]: status }));
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    const confirmations: ConfirmationItem[] = detected.map((d) => {
      const override = amountOverrides[d.id];
      const parsed = override !== undefined ? parseFloat(override) : NaN;
      return {
        id: d.id,
        status: decisions[d.id] || "dismissed",
        amount_per_occurrence: !isNaN(parsed) && parsed !== d.amount_per_occurrence ? parsed : undefined,
      };
    });
    try {
      const resp = await confirmIncome(confirmations);
      onConfirmed(resp);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Confirmation failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRescan = async () => {
    const trimmed = keyword.trim();
    if (!trimmed) return;
    setRescanning(true);
    setRescanMsg(null);
    try {
      const allDetected = await rescanIncome([trimmed]);
      const existingIds = new Set(detected.map((d) => d.id));
      const newItems = allDetected.filter((d) => !existingIds.has(d.id));
      if (newItems.length > 0) {
        onMoreDetected(newItems);
        setRescanOpen(false);
        setRescanMsg(`Found ${newItems.length} new income source${newItems.length !== 1 ? "s" : ""}. Please confirm or dismiss them above.`);
      } else {
        setRescanMsg("No new income sources found for that keyword.");
      }
      setKeyword("");
    } catch (err) {
      setRescanMsg(err instanceof Error ? err.message : "Rescan failed.");
    } finally {
      setRescanning(false);
    }
  };

  // Group by category
  const groups = detected.reduce<Record<string, DetectedIncome[]>>((acc, d) => {
    (acc[d.category] ??= []).push(d);
    return acc;
  }, {});

  const categoryOrder = ["salary", "rental", "pension", "freelance", "other", "transfer"];
  const sortedCategories = categoryOrder.filter((c) => groups[c]);

  return (
    <div className="step-card fade-in">
      <div className="step-icon">2</div>
      <h2>Review Detected Income</h2>
      <p className="step-desc">
        We found <strong>{detected.length}</strong> potential income source
        {detected.length !== 1 ? "s" : ""}. Confirm which ones are real income.
      </p>

      {detected.length === 0 ? (
        <div className="empty-state">
          <p>No income transactions detected in your statements.</p>
        </div>
      ) : (
        <>
          {sortedCategories.map((cat) => (
            <div key={cat} className="income-group">
              <div className="income-group__header">
                <span
                  className="category-dot"
                  style={{ background: CATEGORY_COLORS[cat] || "#6366f1" }}
                />
                <h3>{CATEGORY_LABELS[cat] || cat}</h3>
                <span className="income-group__count">{groups[cat].length}</span>
              </div>

              <div className="income-cards">
                {groups[cat].map((item) => {
                  const conf = CONFIDENCE_STYLES[item.confidence] || CONFIDENCE_STYLES.low;
                  const decision = decisions[item.id];
                  return (
                    <div
                      key={item.id}
                      className={`income-card ${
                        decision === "confirmed"
                          ? "income-card--confirmed"
                          : decision === "dismissed"
                          ? "income-card--dismissed"
                          : ""
                      }`}
                      style={{
                        borderLeftColor: CATEGORY_COLORS[item.category] || "#6366f1",
                      }}
                    >
                      <div className="income-card__top">
                        <span className="income-card__name">{item.source_name}</span>
                        <span
                          className="badge"
                          style={{ background: conf.bg, color: conf.text }}
                        >
                          {item.confidence}
                        </span>
                      </div>

                      <div className="income-card__details">
                        <div className="detail">
                          <span className="detail__label">Per occurrence</span>
                          <div className="detail__editable">
                            <span className="detail__dollar">$</span>
                            <input
                              type="text"
                              inputMode="decimal"
                              className="amount-input"
                              value={amountOverrides[item.id] ?? item.amount_per_occurrence.toString()}
                              onChange={(e) =>
                                setAmountOverrides((prev) => ({ ...prev, [item.id]: e.target.value }))
                              }
                            />
                          </div>
                        </div>
                        <div className="detail">
                          <span className="detail__label">Total</span>
                          <span className="detail__value detail__value--accent">
                            ${item.total_amount.toLocaleString()}
                          </span>
                        </div>
                        <div className="detail">
                          <span className="detail__label">Occurrences</span>
                          <span className="detail__value">{item.occurrence_count}x</span>
                        </div>
                        <div className="detail">
                          <span className="detail__label">Frequency</span>
                          <span className="detail__value">{item.frequency}</span>
                        </div>
                      </div>

                      <div className="income-card__rule">
                        {item.rule_matched}
                      </div>

                      {item.sample_descriptions.length > 0 && (
                        <div className="income-card__samples">
                          {item.sample_descriptions.map((s, i) => (
                            <code key={i}>{s}</code>
                          ))}
                        </div>
                      )}

                      <div className="income-card__actions">
                        <button
                          className={`btn btn--confirm ${decision === "confirmed" ? "btn--active" : ""}`}
                          onClick={() => setDecision(item.id, "confirmed")}
                        >
                          Yes, this is income
                        </button>
                        <button
                          className={`btn btn--dismiss ${decision === "dismissed" ? "btn--active" : ""}`}
                          onClick={() => setDecision(item.id, "dismissed")}
                        >
                          Not income
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="rescan-section">
            <button
              className="btn btn--outline"
              onClick={() => setRescanOpen((o) => !o)}
              type="button"
            >
              {rescanOpen ? "Hide" : "Missing income?"}
            </button>
            {rescanOpen && (
              <div className="rescan-panel">
                <p className="rescan-hint">
                  Enter a name or keyword from transactions you expect to be income
                  (e.g., tenant name, payer name).
                </p>
                <div className="rescan-input-row">
                  <input
                    type="text"
                    className="rescan-input"
                    placeholder="e.g. JOHN DOE"
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleRescan()}
                  />
                  <button
                    className="btn btn--primary"
                    onClick={handleRescan}
                    disabled={rescanning || !keyword.trim()}
                  >
                    {rescanning ? "Scanning..." : "Re-scan"}
                  </button>
                </div>
              </div>
            )}
            {rescanMsg && <p className="rescan-msg">{rescanMsg}</p>}
          </div>

          <div className="review-footer">
            <div className="review-footer__summary">
              <span className="pill pill--green">
                {Object.values(decisions).filter((d) => d === "confirmed").length} confirmed
              </span>
              <span className="pill pill--red">
                {Object.values(decisions).filter((d) => d === "dismissed").length} dismissed
              </span>
              <span className="pill pill--gray">
                {detected.length - Object.keys(decisions).length} pending
              </span>
            </div>
            <button
              className="btn btn--primary btn--lg"
              onClick={handleSubmit}
              disabled={!allDecided || submitting}
            >
              {submitting ? "Saving..." : "Confirm & Save"}
            </button>
            {error && <p className="error-msg">{error}</p>}
          </div>
        </>
      )}
    </div>
  );
};

export default IncomeReview;
