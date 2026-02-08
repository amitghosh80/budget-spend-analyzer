import { useState } from "react";
import UploadStatements from "./pages/UploadStatements";
import IncomeReview from "./pages/IncomeReview";
import IncomeConfirmed from "./pages/IncomeConfirmed";
import { UploadResponse, ConfirmResponse, DetectedIncome } from "./api/incomeApi";

type Step = "upload" | "review" | "confirmed";

const App = () => {
  const [step, setStep] = useState<Step>("upload");
  const [detected, setDetected] = useState<DetectedIncome[]>([]);
  const [confirmResult, setConfirmResult] = useState<ConfirmResponse | null>(null);

  const handleUploadComplete = (data: UploadResponse) => {
    setDetected(data.detected_income);
    setStep("review");
  };

  const handleConfirmed = (resp: ConfirmResponse) => {
    setConfirmResult(resp);
    setStep("confirmed");
  };

  const handleMoreDetected = (newItems: DetectedIncome[]) => {
    setDetected((prev) => {
      const existingIds = new Set(prev.map((d) => d.id));
      const unique = newItems.filter((d) => !existingIds.has(d.id));
      return [...prev, ...unique];
    });
  };

  const handleReset = () => {
    setDetected([]);
    setConfirmResult(null);
    setStep("upload");
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>
          <span className="logo-icon">$</span> Income Identifier
        </h1>
        <p>Upload statements, detect income, confirm & save.</p>
      </header>

      <nav className="stepper">
        {(["upload", "review", "confirmed"] as Step[]).map((s, i) => (
          <div
            key={s}
            className={`stepper__step ${step === s ? "stepper__step--active" : ""} ${
              (["upload", "review", "confirmed"].indexOf(step) > i) ? "stepper__step--done" : ""
            }`}
          >
            <span className="stepper__num">{i + 1}</span>
            <span className="stepper__label">
              {s === "upload" ? "Upload" : s === "review" ? "Review" : "Done"}
            </span>
          </div>
        ))}
      </nav>

      <main className="app-main">
        {step === "upload" && <UploadStatements onComplete={handleUploadComplete} />}
        {step === "review" && (
          <IncomeReview detected={detected} onConfirmed={handleConfirmed} onMoreDetected={handleMoreDetected} />
        )}
        {step === "confirmed" && confirmResult && (
          <IncomeConfirmed result={confirmResult} onReset={handleReset} />
        )}
      </main>
    </div>
  );
};

export default App;
