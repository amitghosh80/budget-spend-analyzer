import { useState, useEffect, useMemo } from "react";
import UploadStatements from "./pages/UploadStatements";
import IncomeReview from "./pages/IncomeReview";
import IncomeConfirmed from "./pages/IncomeConfirmed";
import ExpenseUpload from "./pages/ExpenseUpload";
import ExpenseReview from "./pages/ExpenseReview";
import ExpenseDashboard from "./pages/ExpenseDashboard";
import InsightsDashboard from "./pages/InsightsDashboard";
import CategoryEditor from "./pages/CategoryEditor";
import AuthGate from "./pages/AuthGate";
import {
  UploadResponse, ConfirmResponse, DetectedIncome, ExcludedTransfer,
  getDetectedIncome, getConfirmedIncome,
} from "./api/incomeApi";
import { ExpenseUploadResponse } from "./api/expenseApi";
import { getMe, getStoredToken, clearToken, type UserInfo } from "./api/authApi";
import type { MonthlyOverrides } from "./pages/IncomeReview";

type Phase = "income" | "expenses" | "insights" | "categories";
type IncomeStep = "upload" | "review" | "confirmed";
type ExpenseStep = "upload" | "review" | "dashboard";

const NAV_KEY = "bsa_nav";
type SavedNav = {
  phase: Phase;
  incomeStep: IncomeStep;
  expenseStep: ExpenseStep;
  incomeComplete: boolean;
  isGuest: boolean;
  expenseUploadResult: ExpenseUploadResponse | null;
};
function loadNav(): Partial<SavedNav> {
  try {
    const raw = localStorage.getItem(NAV_KEY);
    return raw ? (JSON.parse(raw) as Partial<SavedNav>) : {};
  } catch {
    return {};
  }
}
function saveNav(nav: SavedNav) {
  try { localStorage.setItem(NAV_KEY, JSON.stringify(nav)); } catch { /* ignore */ }
}

const PHASES: { key: Phase; label: string }[] = [
  { key: "income", label: "Income" },
  { key: "expenses", label: "Expenses" },
  { key: "insights", label: "Insights" },
];

const PHASE_SUBTITLES: Record<Phase, string> = {
  income: "Upload your statements. Get a complete picture of your income, spending, and where you can save.",
  expenses: "Every dollar tracked. Every spending pattern revealed.",
  insights: "The full picture — income, expenses, and what you actually keep.",
  categories: "Your spending, your rules. Fine-tune how we read your finances.",
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
  // Read saved nav state once on mount
  const initNav = useMemo(() => loadNav(), []);

  const [phase, setPhase] = useState<Phase>(initNav.phase ?? "income");
  const [incomeComplete, setIncomeComplete] = useState(initNav.incomeComplete ?? false);

  // Auth state
  const [authUser, setAuthUser] = useState<UserInfo | null>(null);
  const [isGuest, setIsGuest] = useState(initNav.isGuest ?? false);
  const [showAuthGate, setShowAuthGate] = useState(false);

  // Income sub-state
  const [incomeStep, setIncomeStep] = useState<IncomeStep>(initNav.incomeStep ?? "upload");
  const [detected, setDetected] = useState<DetectedIncome[]>([]);
  const [excludedTransfers, setExcludedTransfers] = useState<ExcludedTransfer[]>([]);
  const [confirmResult, setConfirmResult] = useState<ConfirmResponse | null>(null);
  const [monthlyOverrides, setMonthlyOverrides] = useState<MonthlyOverrides>({});

  // Expense sub-state — if restoring to "review" but no saved result, fall back to "upload"
  const [expenseStep, setExpenseStep] = useState<ExpenseStep>(
    initNav.expenseStep === "review" && !initNav.expenseUploadResult ? "upload" : (initNav.expenseStep ?? "upload")
  );
  const [expenseUploadResult, setExpenseUploadResult] = useState<ExpenseUploadResponse | null>(
    initNav.expenseUploadResult ?? null
  );

  // Check stored token on mount
  useEffect(() => {
    const token = getStoredToken();
    if (token) {
      getMe()
        .then((user) => setAuthUser(user))
        .catch(() => clearToken());
    }
  }, []);

  // Restore income API data when refreshing onto review/confirmed steps
  useEffect(() => {
    const nav = initNav;
    if (nav.incomeStep === "review" || nav.incomeStep === "confirmed") {
      getDetectedIncome().then(setDetected).catch(() => {});
    }
    if (nav.incomeStep === "confirmed") {
      getConfirmedIncome()
        .then((items) => setConfirmResult({ confirmed: items, dismissed_count: 0 }))
        .catch(() => {});
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist navigation state to localStorage whenever it changes
  useEffect(() => {
    saveNav({ phase, incomeStep, expenseStep, incomeComplete, isGuest, expenseUploadResult });
  }, [phase, incomeStep, expenseStep, incomeComplete, isGuest, expenseUploadResult]);

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
    setIncomeComplete(false);
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

  // ── Back handlers (navigate without clearing state) ──
  const handleBackFromIncomeReview = () => setIncomeStep("upload");
  const handleBackFromIncomeConfirmed = () => setIncomeStep("review");
  const handleBackFromExpenseUpload = () => { setPhase("income"); setIncomeStep("confirmed"); };
  const handleBackFromExpenseReview = () => setExpenseStep("upload");
  const handleBackFromExpenseDashboard = () => setExpenseStep("review");
  const handleBackFromInsights = () => { setPhase("expenses"); setExpenseStep("dashboard"); };
  const handleGoToCategoryEditor = () => setPhase("categories");
  const handleBackFromCategoryEditor = () => setPhase("insights");

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

  const handleFullReset = () => {
    localStorage.removeItem(NAV_KEY);
    setPhase("income");
    setIncomeStep("upload");
    setExpenseStep("upload");
    setIncomeComplete(false);
    setIsGuest(false);
    setShowAuthGate(false);
    setDetected([]);
    setExcludedTransfers([]);
    setConfirmResult(null);
    setMonthlyOverrides({});
    setExpenseUploadResult(null);
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
    if (p === "insights" && incomeComplete) {
      setShowAuthGate(false);
      setPhase(p);
    }
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
          <div className="app-header__controls" style={{ display: "flex", alignItems: "center", gap: 12 }}>
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
            <button
              className="btn-restart"
              onClick={handleFullReset}
              type="button"
              title="Clear all data and start over"
            >
              ↺ Start Over
            </button>
          </div>
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
              (p.key === "insights" && !incomeComplete);

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
                onBack={handleBackFromIncomeReview}
              />
            )}
            {incomeStep === "confirmed" && !confirmResult && (
              <div className="step-card fade-in">
                <p style={{ textAlign: "center", color: "#94a3b8" }}>Loading...</p>
              </div>
            )}
            {incomeStep === "confirmed" && confirmResult && (
              <IncomeConfirmed
                result={confirmResult}
                detected={detected}
                monthlyOverrides={monthlyOverrides}
                onReset={handleIncomeReset}
                onContinue={handleContinueToExpenses}
                onBack={handleBackFromIncomeConfirmed}
              />
            )}
          </>
        )}

        {/* Phase 2: Expenses */}
        {!showAuthGate && phase === "expenses" && (
          <>
            {expenseStep === "upload" && (
              <ExpenseUpload onComplete={handleExpenseUploadComplete} onBack={handleBackFromExpenseUpload} />
            )}
            {expenseStep === "review" && expenseUploadResult && (
              <ExpenseReview
                uploadResult={expenseUploadResult}
                onContinue={handleExpenseContinueToDashboard}
                onBack={handleBackFromExpenseReview}
              />
            )}
            {expenseStep === "dashboard" && (
              <ExpenseDashboard
                onReset={handleExpenseReset}
                onInsights={() => setPhase("insights")}
                onBack={handleBackFromExpenseDashboard}
              />
            )}
          </>
        )}

        {/* Phase 3: Insights */}
        {!showAuthGate && phase === "insights" && (
          <InsightsDashboard
            onBack={handleBackFromInsights}
            onCategoryEditor={handleGoToCategoryEditor}
          />
        )}

        {/* Category Editor (accessible from Insights) */}
        {!showAuthGate && phase === "categories" && (
          <CategoryEditor onBack={handleBackFromCategoryEditor} />
        )}
      </main>
    </div>
  );
};

export default App;
