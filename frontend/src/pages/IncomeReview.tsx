import { useState } from "react";
import {
  DetectedIncome,
  ExcludedTransfer,
  ConfirmationItem,
  confirmIncome,
  rescanIncome,
  ConfirmResponse,
} from "../api/incomeApi";

export type MonthlyOverrides = Record<string, Record<number, string>>;

type Props = {
  detected: DetectedIncome[];
  excludedTransfers: ExcludedTransfer[];
  onConfirmed: (resp: ConfirmResponse, overrides: MonthlyOverrides) => void;
  onMoreDetected: (newItems: DetectedIncome[]) => void;
  onBack: () => void;
};

const CATEGORY_COLORS: Record<string, string> = {
  salary: "#6366f1",
  rental: "#f59e0b",
  pension: "#10b981",
  freelance: "#ec4899",
  interest: "#06b6d4",
  payments: "#14b8a6",
  other: "#8b5cf6",
  transfer: "#64748b",
};

const CATEGORY_LABELS: Record<string, string> = {
  salary: "Salary / Employment",
  rental: "Rental Income",
  pension: "Pension / Social Security",
  freelance: "Freelance / Consulting",
  interest: "Interest Income",
  payments: "Payments Received",
  other: "Other Income",
  transfer: "Transfer",
};

const CONFIDENCE_STYLES: Record<string, { bg: string; text: string }> = {
  high: { bg: "#dcfce7", text: "#166534" },
  medium: { bg: "#fef9c3", text: "#854d0e" },
  low: { bg: "#fee2e2", text: "#991b1b" },
};

const IncomeReview = ({ detected, excludedTransfers, onConfirmed, onMoreDetected, onBack }: Props) => {
  const [decisions, setDecisions] = useState<Record<string, "confirmed" | "dismissed">>({});
  const [amountOverrides, setAmountOverrides] = useState<Record<string, string>>({});
  const [monthlyOverrides, setMonthlyOverrides] = useState<Record<string, Record<number, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rescanOpen, setRescanOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [rescanning, setRescanning] = useState(false);
  const [rescanMsg, setRescanMsg] = useState<string | null>(null);
  const [showTransfers, setShowTransfers] = useState(false);
  const [expandedTxns, setExpandedTxns] = useState<Record<string, boolean>>({});

  const canSubmit = detected.length > 0 && Object.keys(decisions).length > 0;

  const setDecision = (id: string, status: "confirmed" | "dismissed") => {
    setDecisions((prev) => ({ ...prev, [id]: status }));
  };

  // ── Bulk actions ──
  const bulkSetAll = (status: "confirmed" | "dismissed") => {
    const bulk: Record<string, "confirmed" | "dismissed"> = {};
    for (const d of detected) {
      bulk[d.id] = status;
    }
    setDecisions(bulk);
  };

  const bulkSetGroup = (category: string, status: "confirmed" | "dismissed") => {
    setDecisions((prev) => {
      const next = { ...prev };
      for (const d of detected) {
        if (d.category === category) {
          next[d.id] = status;
        }
      }
      return next;
    });
  };

  // ── Transaction detail toggle ──
  const toggleTxnExpand = (id: string) => {
    setExpandedTxns((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const setMonthAmount = (itemId: string, index: number, value: string) => {
    setMonthlyOverrides((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], [index]: value },
    }));
  };

  const resetMonthly = (itemId: string) => {
    setMonthlyOverrides((prev) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
    setAmountOverrides((prev) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
  };

  const getEffectiveAmount = (item: DetectedIncome): string => {
    const perMonth = monthlyOverrides[item.id];
    const months = item.monthly_totals ?? [];
    if (perMonth && Object.keys(perMonth).length > 0 && months.length > 0) {
      const values = months.map((m, i) => {
        const ov = perMonth[i];
        const parsed = ov !== undefined ? parseFloat(ov) : NaN;
        return isNaN(parsed) ? m.total : parsed;
      });
      const avg = values.reduce((s, v) => s + v, 0) / values.length;
      return avg.toFixed(2);
    }
    return amountOverrides[item.id] ?? item.amount_per_occurrence.toString();
  };

  const isPerMonthMode = (id: string) => {
    const perMonth = monthlyOverrides[id];
    return perMonth && Object.keys(perMonth).length > 0;
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    const confirmations: ConfirmationItem[] = detected.map((d) => {
      const perMonth = monthlyOverrides[d.id];
      const hasPerMonth = perMonth && Object.keys(perMonth).length > 0;

      if (hasPerMonth) {
        const overrides: Record<number, number> = {};
        for (const [idx, val] of Object.entries(perMonth)) {
          const parsed = parseFloat(val);
          if (!isNaN(parsed)) {
            overrides[Number(idx)] = parsed;
          }
        }
        return {
          id: d.id,
          status: decisions[d.id] || "dismissed",
          monthly_overrides: Object.keys(overrides).length > 0 ? overrides : undefined,
        };
      }

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
      onConfirmed(resp, monthlyOverrides);
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

  const categoryOrder = ["salary", "rental", "pension", "freelance", "interest", "payments", "other", "transfer"];
  const sortedCategories = [
    ...categoryOrder.filter((c) => groups[c]),
    ...Object.keys(groups).filter((c) => !categoryOrder.includes(c)),
  ];

  const confirmedCount = Object.values(decisions).filter((d) => d === "confirmed").length;
  const dismissedCount = Object.values(decisions).filter((d) => d === "dismissed").length;
  const pendingCount = detected.length - Object.keys(decisions).length;

  return (
    <div className="step-card fade-in">
      <button className="back-btn" onClick={onBack} type="button">← Back</button>
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
          {/* ── Bulk actions bar ── */}
          <div className="bulk-actions">
            <button
              className="btn btn--confirm btn--sm"
              onClick={() => bulkSetAll("confirmed")}
              type="button"
            >
              Confirm All ({detected.length})
            </button>
            <button
              className="btn btn--dismiss btn--sm"
              onClick={() => bulkSetAll("dismissed")}
              type="button"
            >
              Dismiss All
            </button>
            {Object.keys(decisions).length > 0 && (
              <button
                className="btn btn--outline btn--sm"
                onClick={() => setDecisions({})}
                type="button"
              >
                Reset All
              </button>
            )}
          </div>

          {sortedCategories.map((cat) => (
            <div key={cat} className="income-group">
              <div className="income-group__header">
                <span
                  className="category-dot"
                  style={{ background: CATEGORY_COLORS[cat] || "#6366f1" }}
                />
                <h3>{CATEGORY_LABELS[cat] || cat}</h3>
                <span className="income-group__count">{groups[cat].length}</span>
                {/* Per-group bulk buttons */}
                {groups[cat].length > 1 && (
                  <div className="income-group__bulk">
                    <button
                      className={`btn btn--confirm btn--xs${groups[cat].every((d) => decisions[d.id] === "confirmed") ? " btn--active" : " btn--ghost"}`}
                      onClick={() => bulkSetGroup(cat, "confirmed")}
                      type="button"
                    >
                      Confirm group
                    </button>
                    <button
                      className={`btn btn--dismiss btn--xs${groups[cat].every((d) => decisions[d.id] === "dismissed") ? " btn--active" : " btn--ghost"}`}
                      onClick={() => bulkSetGroup(cat, "dismissed")}
                      type="button"
                    >
                      Dismiss group
                    </button>
                  </div>
                )}
              </div>

              <div className="income-cards">
                {groups[cat].map((item) => {
                  const conf = CONFIDENCE_STYLES[item.confidence] || CONFIDENCE_STYLES.low;
                  const decision = decisions[item.id];
                  const txnsExpanded = expandedTxns[item.id] ?? false;
                  const txns = item.transactions ?? [];
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

                      {(item.monthly_totals?.length ?? 0) > 0 && (
                        <div className="monthly-breakdown">
                          <div className="monthly-breakdown__header">
                            <span className="monthly-breakdown__title">Monthly Income</span>
                            {isPerMonthMode(item.id) && (
                              <button
                                type="button"
                                className="toggle-expand toggle-expand--reset"
                                onClick={() => resetMonthly(item.id)}
                              >
                                Reset
                              </button>
                            )}
                          </div>
                          <div className="occurrence-list">
                            {item.monthly_totals.map((mt, idx) => (
                              <div key={idx} className="occurrence-row">
                                <span className="occurrence-row__month">{mt.month}</span>
                                <span className="occurrence-row__txns">
                                  {mt.transaction_count} txn{mt.transaction_count !== 1 ? "s" : ""}
                                </span>
                                <div className="occurrence-row__amount">
                                  <span className="detail__dollar">$</span>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    className="amount-input amount-input--sm"
                                    value={
                                      monthlyOverrides[item.id]?.[idx] ??
                                      mt.total.toString()
                                    }
                                    onChange={(e) =>
                                      setMonthAmount(item.id, idx, e.target.value)
                                    }
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="income-card__details">
                        <div className="detail">
                          <span className="detail__label">Avg / month</span>
                          <span className="detail__value detail__value--accent">
                            ${getEffectiveAmount(item)}
                          </span>
                        </div>
                        <div className="detail">
                          <span className="detail__label">Total</span>
                          <span className="detail__value">
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

                      {/* ── Per-transaction detail (expandable) ── */}
                      {txns.length > 0 && (
                        <div className="txn-detail">
                          <button
                            type="button"
                            className="txn-detail__toggle"
                            onClick={() => toggleTxnExpand(item.id)}
                          >
                            {txnsExpanded ? "Hide" : "Show"} {txns.length} transaction{txns.length !== 1 ? "s" : ""}
                          </button>
                          {txnsExpanded && (
                            <div className="txn-detail__table-wrap">
                              <table className="txn-detail__table">
                                <thead>
                                  <tr>
                                    <th>Date</th>
                                    <th>Description</th>
                                    <th>Amount</th>
                                    <th>Source</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {txns.map((t, i) => (
                                    <tr key={i}>
                                      <td className="txn-detail__date">{t.date}</td>
                                      <td className="txn-detail__desc">{t.description}</td>
                                      <td className="txn-detail__amount">${t.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                      <td className="txn-detail__source">{t.source_file || "-"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
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

          {/* ── Excluded transfers section ── */}
          {excludedTransfers.length > 0 && (
            <div className="excluded-section">
              <button
                className="btn btn--outline btn--sm"
                onClick={() => setShowTransfers((s) => !s)}
                type="button"
              >
                {showTransfers ? "Hide" : "Show"} excluded transfers ({excludedTransfers.length})
              </button>
              {showTransfers && (
                <div className="excluded-panel">
                  <p className="excluded-hint">
                    These transactions were automatically excluded because they look like
                    inter-account transfers. Review them to make sure nothing was incorrectly filtered.
                  </p>
                  <div className="txn-detail__table-wrap">
                    <table className="txn-detail__table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Description</th>
                          <th>Amount</th>
                          <th>Reason</th>
                          <th>Source</th>
                        </tr>
                      </thead>
                      <tbody>
                        {excludedTransfers.map((t, i) => (
                          <tr key={i}>
                            <td className="txn-detail__date">{t.date}</td>
                            <td className="txn-detail__desc">{t.description}</td>
                            <td className="txn-detail__amount">${t.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                            <td className="txn-detail__reason">{t.reason}</td>
                            <td className="txn-detail__source">{t.source_file || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

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
                {confirmedCount} confirmed
              </span>
              <span className="pill pill--red">
                {dismissedCount} dismissed
              </span>
              <span className="pill pill--gray">
                {pendingCount} pending
              </span>
            </div>
            <button
              className="btn btn--primary btn--lg"
              onClick={handleSubmit}
              disabled={!canSubmit || submitting}
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
