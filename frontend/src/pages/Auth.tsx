import { useMemo, useState } from "react";
import { toast } from "sonner";
import { api, probeAdmin, setTokens } from "../api/client";
import { useNavigate } from "react-router-dom";

type Mode = "login" | "signup" | "forgot";

export function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const title = useMemo(
    () =>
      ({
        login: "Sign in to your account",
        signup: "Create your account",
        forgot: "Reset your password"
      }[mode]),
    [mode]
  );

  const submitLabel = mode === "signup" ? "Sign up" : mode === "login" ? "Sign in" : "Send reset link";

  async function handleSubmit() {
    if (!email) {
      toast.error("Enter your email");
      return;
    }
    if (mode !== "forgot" && !password) {
      toast.error("Enter your password");
      return;
    }

    setBusy(true);

    try {
      if (mode === "forgot") {
        await api("/api/v1/auth/forgot-password", {
          method: "POST",
          body: JSON.stringify({ email })
        });
        toast.success("If that email exists, a reset link has been sent.");
        return;
      }

      const res = await api<{ accessToken: string; refreshToken: string }>(
        `/api/v1/auth/${mode}`,
        {
          method: "POST",
          body: JSON.stringify({ email, password })
        }
      );
      setTokens(res);
      // Probe admin status in background; don't block navigation
      probeAdmin().catch(() => {});
      toast.success(mode === "signup" ? "Account created. Welcome." : "Signed in.");
      navigate("/library");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">OTT Platform</div>
        <p className="auth-subtitle">{title}</p>

        <div className="auth-fields">
          <div className="field">
            <label className="field-label" htmlFor="auth-email">
              Email
            </label>
            <input
              id="auth-email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              type="email"
              autoComplete="email"
              onKeyDown={(e) => e.key === "Enter" && !busy && handleSubmit()}
            />
          </div>

          {mode !== "forgot" && (
            <div className="field">
              <label className="field-label" htmlFor="auth-password">
                Password
              </label>
              <input
                id="auth-password"
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                onKeyDown={(e) => e.key === "Enter" && !busy && handleSubmit()}
              />
            </div>
          )}
        </div>

        <div className="auth-actions">
          <button className="btn btn-primary btn-lg" disabled={busy} onClick={handleSubmit}>
            {busy ? "Please wait..." : submitLabel}
          </button>
          {mode !== "forgot" && (
            <button
              type="button"
              className="auth-link"
              disabled={busy}
              onClick={() => setMode("forgot")}
            >
              Forgot password?
            </button>
          )}
        </div>

        <div className="auth-switch">
          {mode === "signup" ? (
            <>
              Already have an account?
              <button className="auth-link" onClick={() => setMode("login")}>
                Sign in
              </button>
            </>
          ) : mode === "login" ? (
            <>
              Don't have an account?
              <button className="auth-link" onClick={() => setMode("signup")}>
                Sign up
              </button>
            </>
          ) : (
            <button className="auth-link" onClick={() => setMode("login")}>
              Back to sign in
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
