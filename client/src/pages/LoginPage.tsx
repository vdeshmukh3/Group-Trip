import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

const APP_PASSWORD = import.meta.env.VITE_APP_PASSWORD || "grouptrip2026";
const AUTH_KEY = "group-trip-authenticated";

export function isAuthenticated() {
  return sessionStorage.getItem(AUTH_KEY) === "true";
}

export default function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const location = useLocation();
  const navigate = useNavigate();
  const returnTo =
    (location.state as { from?: string } | null)?.from ||
    `${location.pathname}${location.search}`;

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== APP_PASSWORD) {
      setError("That password doesn’t match. Please try again.");
      return;
    }

    sessionStorage.setItem(AUTH_KEY, "true");
    onLogin();
    navigate(returnTo, { replace: true });
  }

  return (
    <main className="page login-page">
      <section className="card login-card">
        <p className="eyebrow">Split fairly · Travel together</p>
        <h1>Welcome to Group Trip</h1>
        <p className="hint">Enter the group password to continue.</p>
        <form onSubmit={submit}>
          <label htmlFor="app-password">Password</label>
          <input
            autoFocus
            autoComplete="current-password"
            id="app-password"
            type="password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              setError("");
            }}
            required
          />
          {error && <p className="error" role="alert">{error}</p>}
          <button type="submit">Continue</button>
        </form>
      </section>
    </main>
  );
}
