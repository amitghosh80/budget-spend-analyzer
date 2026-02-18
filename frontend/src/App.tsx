import { useState, useEffect } from "react";
import UploadStatements from "./pages/UploadStatements";
import IncomeReview from "./pages/IncomeReview";
import IncomeConfirmed from "./pages/IncomeConfirmed";
import ExpenseUpload from "./pages/ExpenseUpload";
import ExpenseReview from "./pages/ExpenseReview";
import ExpenseDashboard from "./pages/ExpenseDashboard";
import AuthGate from "./pages/AuthGate";
import { UploadResponse, ConfirmResponse, DetectedIncome, ExcludedTransfer } from "./api/incomeApi";
import { ExpenseUploadResponse } from "./api/expenseApi";
import { getMe, getStoredToken, clearToken, type UserInfo } from "./api/authApi";
import type { MonthlyOverrides } from "./pages/IncomeReview";

type Phase = "income" | "expenses" | "insights";
type IncomeStep = "upload" | "review" | "confirmed";
type ExpenseStep = "upload" | "review" | "dashboard";

const PHASES: { key: Phase; label: string }[] = [
  { key: "income", label: "Income" },
  { key: "expenses", label: "Expenses" },
  { key: "insights", label: "Insights" },
];

const PHASE_SUBTITLES: Record<Phase, string> = {
  income: "Upload statements, detect income, confirm & save.",
  expenses: "Categorize expenses and visualize spending patterns.",
  insights: "Net cashflow analysis and savings recommendations.",
};

const INCOME_STEPS: { key: IncomeStep; label: string }[] = [
  { key: "upload", label: "Upload" },
  { key: "review", label: "Review" },
  { key: "confirmed", label: "Done" },
];

const EXPENSE_STEPS: { key: ExpenseStep; label: string }[] = [
  { key: "upload", label: "Upload" },
  { key: "review", label: "Review" },
  { key: "dashboard", label: "Dashboard" },
];

const App = () => {
  const [phase, setPhase] = useState<Phase>("income");
  const [incomeComplete, setIncomeComplete] = useState(false);

  // Auth state
  const [authUser, setAuthUser] = useState<UserInfo | null>(null);
  const [isGuest, setIsGuest] = useState(false);
  const [showAuthGate, setShowAuthGate] = useState(false);

  // Income sub-state
  const [incomeStep, setIncomeStep] = useState<IncomeStep>("upload");
  const [detected, setDetected] = useState<DetectedIncome[]>([]);
  const [excludedTransfers, setExcludedTransfers] = useState<ExcludedTransfer[]>([]);
  const [confirmResult, setConfirmResult] = useState<ConfirmResponse | null>(null);
  const [monthlyOverrides, setMonthlyOverrides] = useState<MonthlyOverrides>({});

  // Expense sub-state
  const [expenseStep, setExpenseStep] = useState<ExpenseStep>("upload");
  const [expenseUploadResult, setExpenseUploadResult] = useState<ExpenseUploadResponse | null>(null);

  // Check stored token on mount
  useEffect(() => {
    const token = getStoredToken();
    if (token) {
      getMe()
        .then((user) => setAuthUser(user))
        .catch(() => clearToken());
    }
  }, []);

  const isAuthenticated = authUser !== null || isGuest;

  // ── Income handlers ──
  const handleUploadComplete = (data: UploadResponse) => {
    setDetected(data.detected_income);
    setExcludedTransfers(data.excluded_transfers ?? []);
    setIncomeStep("review");
  };

  const handleConfirmed = (resp: ConfirmResponse, overrides: MonthlyOverrides) => {
    setConfirmResult(resp);
    setMonthlyOverrides(overrides);
    setIncomeStep("confirmed");
    setIncomeComplete(true);
  };

  const handleMoreDetected = (newItems: DetectedIncome[]) => {
    setDetected((prev) => {
      const existingIds = new Set(prev.map((d) => d.id));
      const unique = newItems.filter((d) => !existingIds.has(d.id));
      return [...prev, ...unique];
    });
  };

  const handleIncomeReset = () => {
    setDetected([]);
    setExcludedTransfers([]);
    setConfirmResult(null);
    setMonthlyOverrides({});
    setIncomeStep("upload");
  };

  const handleContinueToExpenses = () => {
    if (isAuthenticated) {
      setPhase("expenses");
    } else {
      setShowAuthGate(true);
    }
  };

  const handleAuthSuccess = (user: UserInfo) => {
    setAuthUser(user);
    setShowAuthGate(false);
    setPhase("expenses");
  };

  const handleGuestContinue = () => {
    setIsGuest(true);
    setShowAuthGate(false);
    setPhase("expenses");
  };

  const handleLogout = () => {
    clearToken();
    setAuthUser(null);
    setIsGuest(false);
  };

  // ── Expense handlers ──
  const handleExpenseUploadComplete = (data: ExpenseUploadResponse) => {
    setExpenseUploadResult(data);
    setExpenseStep("review");
  };

  const handleExpenseContinueToDashboard = () => {
    setExpenseStep("dashboard");
  };

  const handleExpenseReset = () => {
    setExpenseUploadResult(null);
    setExpenseStep("upload");
  };

  // ── Phase nav ──
  const handlePhaseClick = (p: Phase) => {
    if (p === "income") {
      setShowAuthGate(false);
      setPhase(p);
    }
    if (p === "expenses" && incomeComplete) {
      if (isAuthenticated) {
        setShowAuthGate(false);
        setPhase(p);
      } else {
        setShowAuthGate(true);
      }
    }
    // insights locked for now
  };

  // Figure out which sub-steps to show
  const subSteps =
    phase === "income"
      ? INCOME_STEPS
      : phase === "expenses"
        ? EXPENSE_STEPS
        : null;

  const currentSubStep =
    phase === "income"
      ? incomeStep
      : phase === "expenses"
        ? expenseStep
        : null;

  const subStepKeys = subSteps?.map((s) => s.key) ?? [];
  const currentSubIndex = currentSubStep
    ? subStepKeys.indexOf(currentSubStep)
    : -1;

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header__top">
          <h1>
            <span className="logo-icon">$</span> Spend Analyzer
          </h1>
          {authUser && (
            <div className="auth-badge">
              <span className="auth-badge__email">{authUser.email}</span>
              <button className="auth-badge__logout" onClick={handleLogout} type="button">
                Sign out
              </button>
            </div>
          )}
          {isGuest && !authUser && (
            <div className="auth-badge auth-badge--guest">
              <span className="auth-badge__label">Guest Mode</span>
            </div>
          )}
        </div>
        <p>{PHASE_SUBTITLES[phase]}</p>
      </header>

      {/* Unified navigation container */}
      <div className="nav-container">
        <nav className="phase-nav">
          {PHASES.map((p, i) => {
            const isDone =
              (p.key === "income" && incomeComplete && phase !== "income") ||
              false;
            const isActive = phase === p.key && !showAuthGate;
            const isLocked =
              (p.key === "expenses" && !incomeComplete) ||
              p.key === "insights";

            return (
              <button
                key={p.key}
                className={`phase-nav__item ${isActive ? "phase-nav__item--active" : ""} ${
                  isDone ? "phase-nav__item--done" : ""
                } ${isLocked ? "phase-nav__item--locked" : ""}`}
                onClick={() => handlePhaseClick(p.key)}
                disabled={isLocked}
                type="button"
              >
                <span className="phase-nav__num">
                  {isDone ? "\u2713" : i + 1}
                </span>
                <span className="phase-nav__label">{p.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Sub-stepper for the active phase */}
        {subSteps && !showAuthGate && (
          <div className="sub-stepper">
            {subSteps.map((s, i) => {
              const isActive = currentSubStep === s.key;
              const isDone = currentSubIndex > i;
              return (
                <div
                  key={s.key}
                  className={`sub-stepper__step ${isActive ? "sub-stepper__step--active" : ""} ${
                    isDone ? "sub-stepper__step--done" : ""
                  }`}
                >
                  <span className="sub-stepper__dot" />
                  <span className="sub-stepper__label">{s.label}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <main className="app-main">
        {/* Auth Gate interstitial */}
        {showAuthGate && (
          <AuthGate
            onAuthenticated={handleAuthSuccess}
            onGuest={handleGuestContinue}
          />
        )}

        {/* Phase 1: Income */}
        {!showAuthGate && phase === "income" && (
          <>
            {incomeStep === "upload" && (
              <UploadStatements onComplete={handleUploadComplete} />
            )}
            {incomeStep === "review" && (
              <IncomeReview
                detected={detected}
                excludedTransfers={excludedTransfers}
                onConfirmed={handleConfirmed}
                onMoreDetected={handleMoreDetected}
              />
            )}
            {incomeStep === "confirmed" && confirmResult && (
              <IncomeConfirmed
                result={confirmResult}
                detected={detected}
                monthlyOverrides={monthlyOverrides}
                onReset={handleIncomeReset}
                onContinue={handleContinueToExpenses}
              />
            )}
          </>
        )}

        {/* Phase 2: Expenses */}
        {!showAuthGate && phase === "expenses" && (
          <>
            {expenseStep === "upload" && (
              <ExpenseUpload onComplete={handleExpenseUploadComplete} />
            )}
            {expenseStep === "review" && expenseUploadResult && (
              <ExpenseReview
                uploadResult={expenseUploadResult}
                onContinue={handleExpenseContinueToDashboard}
              />
            )}
            {expenseStep === "dashboard" && (
              <ExpenseDashboard onReset={handleExpenseReset} />
            )}
          </>
        )}

        {/* Phase 3: Insights (placeholder) */}
        {!showAuthGate && phase === "insights" && (
          <div className="step-card fade-in">
            <div className="step-icon">3</div>
            <h2>Cashflow Insights</h2>
            <p className="step-desc">
              Net cashflow analysis and savings recommendations. Coming soon.
            </p>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
