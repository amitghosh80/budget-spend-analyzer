const BASE = "http://localhost:8000/income";

export type FileResult = {
  filename: string;
  stored_as?: string | null;
  size_bytes?: number | null;
  status: string;
  error?: string | null;
};

export type DetectedIncome = {
  id: string;
  source_name: string;
  category: string;
  rule_matched: string;
  amount_per_occurrence: number;
  total_amount: number;
  occurrence_count: number;
  frequency: string;
  confidence: string;
  sample_descriptions: string[];
  is_recurring: boolean;
};

export type UploadResponse = {
  total_files: number;
  stored_files: number;
  file_results: FileResult[];
  detected_income: DetectedIncome[];
};

export type ConfirmationItem = {
  id: string;
  status: "confirmed" | "dismissed" | "reclassified";
  reclassified_category?: string | null;
  amount_per_occurrence?: number | null;
};

export type ConfirmedIncome = {
  id: string;
  source_name: string;
  category: string;
  original_category: string;
  status: string;
  amount_per_occurrence: number;
  total_amount: number;
  frequency: string;
  is_fixed_income: boolean;
  rule_matched: string;
};

export type ConfirmResponse = {
  confirmed: ConfirmedIncome[];
  dismissed_count: number;
};

export async function uploadStatements(files: FileList): Promise<UploadResponse> {
  const form = new FormData();
  Array.from(files).forEach((f) => form.append("files", f));
  const res = await fetch(`${BASE}/upload`, { method: "POST", body: form });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function confirmIncome(
  confirmations: ConfirmationItem[]
): Promise<ConfirmResponse> {
  const res = await fetch(`${BASE}/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirmations }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function rescanIncome(
  keywords: string[]
): Promise<DetectedIncome[]> {
  const res = await fetch(`${BASE}/rescan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keywords }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getConfirmedIncome(): Promise<ConfirmedIncome[]> {
  const res = await fetch(`${BASE}/confirmed`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
