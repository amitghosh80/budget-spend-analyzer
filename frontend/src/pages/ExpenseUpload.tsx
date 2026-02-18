import { useRef, useState } from "react";
import { uploadExpenses, ExpenseUploadResponse } from "../api/expenseApi";

type Props = {
  onComplete: (data: ExpenseUploadResponse) => void;
};

const ExpenseUpload = ({ onComplete }: Props) => {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
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

  const handleUpload = async () => {
    if (files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const result = await uploadExpenses(files);
      onComplete(result);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="step-card fade-in">
      <div className="step-icon">$</div>
      <h2>Upload Credit Card Statements</h2>
      <p className="step-desc">
        Upload your credit card PDF statements to categorize and track your
        spending.
      </p>

      <div className="security-banner">
        <span className="security-banner__icon">&#128274;</span>
        <span>
          <strong>Your data is secure.</strong> Files are encrypted (AES-256) and
          auto-deleted after 48 hours. All processing happens locally.
        </span>
      </div>

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
              style={{
                fontSize: "0.85rem",
                color: "#64748b",
                padding: "4px 0",
              }}
            >
              {f.name} ({(f.size / 1024).toFixed(0)} KB)
            </div>
          ))}
        </div>
      )}

      <button
        className="btn btn--primary btn--lg"
        onClick={handleUpload}
        disabled={files.length === 0 || uploading}
      >
        {uploading ? "Processing..." : "Upload & Categorize"}
      </button>

      {error && <div className="error-msg">{error}</div>}
    </div>
  );
};

export default ExpenseUpload;
