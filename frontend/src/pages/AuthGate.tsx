import { useState } from "react";
import { register, login, type UserInfo } from "../api/authApi";

type Props = {
  onAuthenticated: (user: UserInfo) => void;
  onGuest: () => void;
};

type Tab = "register" | "login";

const AuthGate = ({ onAuthenticated, onGuest }: Props) => {
  const [tab, setTab] = useState<Tab>("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email || !password) {
      setError("Email and password are required");
      return;
    }

    if (tab === "register" && password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    try {
      const resp = tab === "register"
        ? await register(email, password)
        : await login(email, password);
      onAuthenticated(resp.user);
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="step-card fade-in auth-gate">
      <div className="step-icon">&#128274;</div>
      <h2>Save Your Progress</h2>

      <div className="auth-benefits">
        <div className="auth-benefits__item">
          <span className="auth-benefits__icon">&#128190;</span>
          <span>Your income & expense data persists across sessions</span>
        </div>
        <div className="auth-benefits__item">
          <span className="auth-benefits__icon">&#128202;</span>
          <span>Access your insights dashboard anytime</span>
        </div>
        <div className="auth-benefits__item">
          <span className="auth-benefits__icon">&#128274;</span>
          <span>Data encrypted at rest with AES-256</span>
        </div>
      </div>

      <div className="auth-tabs">
        <button
          className={`auth-tabs__btn ${tab === "register" ? "auth-tabs__btn--active" : ""}`}
          onClick={() => { setTab("register"); setError(""); }}
          type="button"
        >
          Register
        </button>
        <button
          className={`auth-tabs__btn ${tab === "login" ? "auth-tabs__btn--active" : ""}`}
          onClick={() => { setTab("login"); setError(""); }}
          type="button"
        >
          Sign In
        </button>
      </div>

      <form className="auth-form" onSubmit={handleSubmit}>
        <label className="auth-form__label">
          Email
          <input
            type="email"
            className="auth-form__input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
          />
        </label>
        <label className="auth-form__label">
          Password
          <input
            type="password"
            className="auth-form__input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 6 characters"
            autoComplete={tab === "register" ? "new-password" : "current-password"}
          />
        </label>
        {tab === "register" && (
          <label className="auth-form__label">
            Confirm Password
            <input
              type="password"
              className="auth-form__input"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter password"
              autoComplete="new-password"
            />
          </label>
        )}

        {error && <div className="error-msg">{error}</div>}

        <button
          type="submit"
          className="btn btn--primary btn--lg auth-form__submit"
          disabled={loading}
        >
          {loading ? "Please wait..." : tab === "register" ? "Create Account" : "Sign In"}
        </button>
      </form>

      <div className="auth-divider">
        <span>or</span>
      </div>

      <button
        className="btn btn--outline btn--lg auth-guest-btn"
        onClick={onGuest}
        type="button"
      >
        Continue as Guest &rarr;
      </button>
      <p className="auth-guest-hint">
        You can register later, but guest data won't persist across sessions.
      </p>
    </div>
  );
};

export default AuthGate;
