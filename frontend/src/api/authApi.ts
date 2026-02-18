const BASE = "http://localhost:8000/auth";

export type UserInfo = {
  id: string;
  email: string;
};

export type AuthResponse = {
  token: string;
  user: UserInfo;
};

const TOKEN_KEY = "bsa_token";

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function storeToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export async function register(email: string, password: string): Promise<AuthResponse> {
  const res = await fetch(`${BASE}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail || "Registration failed");
  }
  const data: AuthResponse = await res.json();
  storeToken(data.token);
  return data;
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const res = await fetch(`${BASE}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail || "Login failed");
  }
  const data: AuthResponse = await res.json();
  storeToken(data.token);
  return data;
}

export async function getMe(): Promise<UserInfo> {
  const token = getStoredToken();
  if (!token) throw new Error("No token");
  const res = await fetch(`${BASE}/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Not authenticated");
  return res.json();
}
