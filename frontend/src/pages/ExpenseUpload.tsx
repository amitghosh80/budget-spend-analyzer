import { useRef, useState } from "react";
import { uploadExpenses, ExpenseUploadResponse } from "../api/expenseApi";

type Props = {
  onComplete: (data: ExpenseUploadResponse) => void;
  onBack: () => void;
};

const ExpenseUpload = ({ onComplete, onBack }: Props) => {
  const [includeExisting, setIncludeExisting] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = (selected: FileList | null) => {
    if (!selected) return;
    const pdfs = Array.from(selected).filter((f) =>
      f.name.toLowerCase().endsWith(".pdf")
    );
    setFiles(pdfs.slice(0, 12));
    setError(null);
  };

  const canAnalyze = includeExisting || files.length > 0;

  const handleAnalyze = async () => {
    if (!canAnalyze) return;
    setProcessing(true);
    setError(null);
    try {
      const result = await uploadExpenses(files, includeExisting);
      onComplete(result);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Processing failed");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="step-card fade-in">
      <button className="back-btn" onClick={onBack} type="button">← Back</button>
      <div className="step-icon">$</div>
      <h2>Analyze Expenses</h2>
      <p className="step-desc">
        Choose which statements to include. You can use statements already
        uploaded during the income step, upload new ones, or both.
      </p>

      <div className="security-banner">
        <span className="security-banner__icon">&#128274;</span>
        <span>
          <strong>Your data is secure.</strong> Files are encrypted (AES-256)
          and auto-deleted after 48 hours. All processing happens locally.
        </span>
      </div>

      {/* Checkbox: use income-step statements */}
      <label
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 12,
          padding: "16px 18px",
          border: `1px solid ${includeExisting ? "rgba(139,92,246,0.5)" : "rgba(255,255,255,0.1)"}`,
          borderRadius: 10,
          background: includeExisting
            ? "rgba(139,92,246,0.12)"
            : "rgba(255,255,255,0.04)",
          cursor: "pointer",
          marginBottom: 20,
          transition: "all 0.2s",
        }}
      >
        <input
          type="checkbox"
          checked={includeExisting}
          onChange={(e) => setIncludeExisting(e.target.checked)}
          style={{ marginTop: 3, accentColor: "#8b5cf6", width: 16, height: 16, flexShrink: 0 }}
        />
        <div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            Include statements from the income step
          </div>
          <div style={{ fontSize: "0.83rem", color: "#94a3b8", lineHeight: 1.5 }}>
            Re-use the checking/savings account statements you already uploaded
            (mortgage, car loans, ACH utilities, etc. will be included;
            income deposits and CC payments will be automatically excluded).
          </div>
        </div>
      </label>

      {/* Additional file upload */}
      <div style={{ marginBottom: 8, fontWeight: 600, fontSize: "0.9rem" }}>
        {includeExisting
          ? "Also upload additional statements (optional)"
          : "Upload statements"}
      </div>
      <p style={{ fontSize: "0.83rem", color: "#94a3b8", marginBottom: 12 }}>
        Credit card statements, any checking/savings PDFs not yet uploaded, etc.
        Bank transactions are automatically filtered — CC bill payments,
        transfers, and deposits are excluded.
      </p>

      <label className="file-drop">
        <input
          ref={inputRef}
          type="file"
          accept=".pdf"
          multiple
          onChange={(e) => handleFiles(e.target.files)}
        />
        <div className="file-drop__inner">
          <span className="file-drop__icon">+</span>
          <span>
            {files.length > 0
              ? `${files.length} file${files.length > 1 ? "s" : ""} selected`
              : "Choose PDF statements (up to 12)"}
          </span>
        </div>
      </label>

      {files.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          {files.map((f) => (
            <div
              key={f.name}
              style={{ fontSize: "0.85rem", color: "#64748b", padding: "4px 0" }}
            >
              {f.name} ({(f.size / 1024).toFixed(0)} KB)
            </div>
          ))}
        </div>
      )}

      <button
        className="btn btn--primary btn--lg"
        onClick={handleAnalyze}
        disabled={!canAnalyze || processing}
        style={{ marginTop: 8 }}
      >
        {processing ? "Processing..." : "Analyze Expenses"}
      </button>

      {!canAnalyze && (
        <div style={{ fontSize: "0.83rem", color: "#64748b", marginTop: 8, textAlign: "center" }}>
          Check the box above and/or select PDF files to continue.
        </div>
      )}

      {error && <div className="error-msg">{error}</div>}
    </div>
  );
};

export default ExpenseUpload;
