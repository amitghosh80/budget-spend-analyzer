import { useState } from "react";
import { uploadStatements, UploadResponse } from "../api/incomeApi";

type Props = {
  onComplete: (data: UploadResponse) => void;
};

const UploadStatements = ({ onComplete }: Props) => {
  const [files, setFiles] = useState<FileList | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = async () => {
    if (!files || files.length === 0) {
      setError("Please select at least one PDF statement.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const data = await uploadStatements(files);
      onComplete(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="step-card fade-in">
      <div className="step-icon">1</div>
      <h2>Upload Your Statements</h2>
      <p className="step-desc">
        Upload your <strong>checking or savings account</strong> statements
        — the accounts where your income lands. We'll scan them to detect
        salary, rental, and other recurring deposits. Credit card statements
        will be uploaded later for tracking expenses.
      </p>

      <label className="file-drop">
        <input
          type="file"
          accept="application/pdf"
          multiple
          onChange={(e) => {
            setFiles(e.target.files);
            setError(null);
          }}
        />
        <div className="file-drop__inner">
          <span className="file-drop__icon">+</span>
          <span>
            {files && files.length > 0
              ? `${files.length} file${files.length > 1 ? "s" : ""} selected`
              : "Choose PDF files"}
          </span>
        </div>
      </label>

      <button
        className="btn btn--primary btn--lg"
        onClick={handleUpload}
        disabled={uploading}
      >
        {uploading ? "Analyzing..." : "Scan for Income"}
      </button>

      {error && <p className="error-msg">{error}</p>}
    </div>
  );
};

export default UploadStatements;
