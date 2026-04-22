import { useMemo, useState } from "react";
import { api, setToken } from "../api/client";
import { useNavigate } from "react-router-dom";

export function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = useMemo(() => (mode === "signup" ? "Create account" : "Login"), [mode]);

  return (
    <div className="grid">
      <div className="card">
        <h2>{title}</h2>
        <p className="muted">JWT auth for uploads and video access.</p>

        <div className="row">
          <div>
            <label>Email</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </div>
          <div>
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="min 8 characters"
            />
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 12, alignItems: "center" }}>
          <button
            className="btn primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                const res = await api<{ token: string }>(`/auth/${mode}`, {
                  method: "POST",
                  body: JSON.stringify({ email, password })
                });
                setToken(res.token);
                navigate("/videos");
              } catch (e) {
                setError(e instanceof Error ? e.message : "Unknown error");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Working..." : mode === "signup" ? "Sign up" : "Login"}
          </button>

          <button className="btn" disabled={busy} onClick={() => setMode(mode === "signup" ? "login" : "signup")}>
            Switch to {mode === "signup" ? "login" : "signup"}
          </button>
        </div>

        {error ? <p className="error">{error}</p> : null}
      </div>
    </div>
  );
}
