const API = `${import.meta.env.VITE_API_BASE}/expenses`;

// ── Types ────────────────────────────────────────────────────────

export interface FileResult {
  filename: string;
  stored_as: string | null;
  size_bytes: number | null;
  status: string;
  error: string | null;
  transaction_count: number | null;
}

export interface ExpenseUploadResponse {
  total_files: number;
  stored_files: number;
  file_results: FileResult[];
  transaction_count: number;
  new_transactions: number;
  duplicate_count: number;
  categorized_count: number;
  excluded_count: number;
}

export interface ExpenseTransaction {
  id: string;
  date: string;
  amount: number;
  description: string;
  merchant: string;
  category: string;
  category_source: string;
  account_source: string;
  account_label: string;
  is_excluded: boolean;
  exclusion_reason: string | null;
  fingerprint: string;
}

export interface CategoryTotal {
  category: string;
  name: string;
  total: number;
  percentage: number;
  transaction_count: number;
}

export interface MonthlyExpenseTotal {
  month: string;
  total: number;
  category_breakdown: Record<string, number>;
}

export interface ExpenseSummary {
  total_expenses: number;
  avg_monthly: number;
  category_totals: CategoryTotal[];
  monthly_totals: MonthlyExpenseTotal[];
  excluded_count: number;
}

export interface CategoryDefinition {
  slug: string;
  name: string;
  type: string;
  is_custom: boolean;
  keywords: string[];
}

export interface PivotCell {
  category: string;
  name: string;
  total: number;
  count: number;
}

export interface PivotRow {
  month: string;
  month_label: string;
  categories: PivotCell[];
  row_total: number;
}

export interface PivotTable {
  rows: PivotRow[];
  all_categories: string[];
  all_category_names: Record<string, string>;
  grand_total: number;
}

// ── API calls ────────────────────────────────────────────────────

export async function uploadExpenses(
  files: File[],
  includeExisting = false
): Promise<ExpenseUploadResponse> {
  const form = new FormData();
  files.forEach((f) => form.append("files", f));
  const url = `${API}/upload${includeExisting ? "?include_existing=true" : ""}`;
  const res = await fetch(url, { method: "POST", body: form });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getTransactions(params?: {
  month?: string;
  category?: string;
  account?: string;
  search?: string;
  include_excluded?: boolean;
}): Promise<ExpenseTransaction[]> {
  const qs = new URLSearchParams();
  if (params?.month) qs.set("month", params.month);
  if (params?.category) qs.set("category", params.category);
  if (params?.account) qs.set("account", params.account);
  if (params?.search) qs.set("search", params.search);
  if (params?.include_excluded) qs.set("include_excluded", "true");
  const res = await fetch(`${API}/transactions?${qs}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getExpenseSummary(): Promise<ExpenseSummary> {
  const res = await fetch(`${API}/summary`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function bulkCategorize(
  transactionIds: string[],
  newCategory: string
): Promise<ExpenseTransaction[]> {
  const res = await fetch(`${API}/categorize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transaction_ids: transactionIds, new_category: newCategory }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getPivotTable(): Promise<PivotTable> {
  const res = await fetch(`${API}/pivot`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getCategories(): Promise<CategoryDefinition[]> {
  const res = await fetch(`${API}/categories`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function addCategory(
  slug: string,
  name: string,
  type: "fixed" | "variable"
): Promise<CategoryDefinition> {
  const res = await fetch(`${API}/categories`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug, name, type, is_custom: true, keywords: [] }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export interface CashflowMonth {
  month: string;
  month_label: string;
  income: number;
  expenses: number;
  net: number;
}

export interface CashflowSummary {
  months: CashflowMonth[];
  total_income: number;
  total_expenses: number;
  total_net: number;
  avg_monthly_income: number;
  avg_monthly_expenses: number;
  avg_monthly_net: number;
}

export async function getCashflow(): Promise<CashflowSummary> {
  const res = await fetch(`${API}/cashflow`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export interface MerchantTotal {
  merchant: string;
  total: number;
  transaction_count: number;
  avg_per_transaction: number;
  top_category: string;
}

export interface MerchantsResponse {
  merchants: MerchantTotal[];
}

export async function getTopMerchants(limit = 15): Promise<MerchantsResponse> {
  const res = await fetch(`${API}/merchants?limit=${limit}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export interface AccountMonthlyTotal {
  month: string;
  month_label: string;
  total: number;
}

export interface AccountBreakdown {
  account_source: string;
  total: number;
  avg_monthly: number;
  monthly_totals: AccountMonthlyTotal[];
}

export interface AccountBreakdownResponse {
  accounts: AccountBreakdown[];
  months: string[];
  month_labels: Record<string, string>;
}

export async function getAccountBreakdown(): Promise<AccountBreakdownResponse> {
  const res = await fetch(`${API}/account-breakdown`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function recategorizeAll(): Promise<{ recategorized: number }> {
  const res = await fetch(`${API}/recategorize`, { method: "POST" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updateCategory(def: CategoryDefinition): Promise<CategoryDefinition> {
  const res = await fetch(`${API}/categories`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(def),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function exportCsv(month?: string, category?: string): Promise<void> {
  const qs = new URLSearchParams();
  if (month) qs.set("month", month);
  if (category) qs.set("category", category);
  const res = await fetch(`${API}/export?${qs}`);
  if (!res.ok) throw new Error(await res.text());
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "expenses.csv";
  a.click();
  URL.revokeObjectURL(url);
}
