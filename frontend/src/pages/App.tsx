import { useEffect, useRef, useState } from "react";
import {
  Link,
  Navigate,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate
} from "react-router-dom";
import { Toaster, toast } from "sonner";
import { LogOut } from "lucide-react";
import { api, isAdminCached, isLoggedIn, probeAdmin, setTokens } from "../api/client";
import { AuthPage } from "./Auth";
import { UploadPage } from "./Upload";
import { VideosPage } from "./Videos";
import { PlayerPage } from "./Player";
import { BrowsePage } from "./Browse";
import { SharePage } from "./Share";
import { StatsPage } from "./Stats";

function initialsFromEmail(email: string | null): string {
  if (!email) return "?";
  const local = email.split("@")[0] ?? email;
  const parts = local.split(/[._-]/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return local.slice(0, 2).toUpperCase();
}

/** Decode the JWT payload (no signature verification — purely for displaying the email locally). */
function decodeJwtEmail(token: string | null): string | null {
  if (!token) return null;
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const obj = JSON.parse(json) as { email?: string; sub?: string };
    return obj.email ?? obj.sub ?? null;
  } catch {
    return null;
  }
}

function TopNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const [authed, setAuthed] = useState(isLoggedIn());
  const [admin, setAdmin] = useState(isAdminCached());
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Reflect auth state when the route changes (handles login/logout transitions)
  useEffect(() => {
    setAuthed(isLoggedIn());
    setAdmin(isAdminCached());
  }, [location.pathname]);

  // Probe admin once after login
  useEffect(() => {
    if (authed && !admin) {
      probeAdmin().then(setAdmin).catch(() => setAdmin(false));
    }
  }, [authed, admin]);

  // Close menu on outside click
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const accessToken = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
  const email = decodeJwtEmail(accessToken);

  async function handleLogout() {
    const refreshToken = localStorage.getItem("refresh_token");
    if (refreshToken) {
      try {
        await api("/api/v1/auth/logout", {
          method: "POST",
          body: JSON.stringify({ refreshToken })
        });
      } catch {
        /* ignore */
      }
    }
    setTokens(null);
    setAuthed(false);
    setAdmin(false);
    setMenuOpen(false);
    toast.success("Signed out");
    navigate("/browse");
  }

  return (
    <header className="topnav">
      <div className="topnav-inner">
        <Link to="/browse" className="topnav-brand">
          <span className="topnav-logo">O</span>
          OTT
        </Link>

        <nav className="topnav-links">
          <NavLink
            to="/browse"
            className={({ isActive }) => `topnav-link ${isActive ? "active" : ""}`}
          >
            Browse
          </NavLink>
          {authed && (
            <NavLink
              to="/library"
              className={({ isActive }) => `topnav-link ${isActive ? "active" : ""}`}
            >
              My Library
            </NavLink>
          )}
          {authed && (
            <NavLink
              to="/upload"
              className={({ isActive }) => `topnav-link ${isActive ? "active" : ""}`}
            >
              Upload
            </NavLink>
          )}
          {authed && (
            <NavLink
              to="/stats"
              className={({ isActive }) => `topnav-link ${isActive ? "active" : ""}`}
            >
              Stats
            </NavLink>
          )}
        </nav>

        <div className="topnav-right">
          {!authed ? (
            <Link to="/auth" className="btn btn-primary btn-sm">
              Sign in
            </Link>
          ) : (
            <div className="avatar-wrap" ref={menuRef}>
              <button
                type="button"
                className="avatar-btn"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((v) => !v)}
              >
                {initialsFromEmail(email)}
              </button>
              {menuOpen && (
                <div className="dropdown" role="menu">
                  <div className="dropdown-label">{email ?? "Signed in"}</div>
                  <div className="dropdown-divider" />
                  <button
                    type="button"
                    className="dropdown-item"
                    onClick={handleLogout}
                    role="menuitem"
                  >
                    <LogOut size={14} />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function RequireAuth({ children }: { children: JSX.Element }) {
  const authed = isLoggedIn();
  if (!authed) return <Navigate to="/auth" replace />;
  return children;
}

export function App() {
  return (
    <div className="app-shell">
      <TopNav />
      <Toaster theme="dark" position="top-right" richColors />
      <Routes>
        <Route path="/" element={<Navigate to="/browse" replace />} />
        <Route path="/browse" element={<BrowsePage />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/videos/:id" element={<PlayerPage />} />
        <Route
          path="/library"
          element={
            <RequireAuth>
              <VideosPage />
            </RequireAuth>
          }
        />
        <Route
          path="/upload"
          element={
            <RequireAuth>
              <UploadPage />
            </RequireAuth>
          }
        />
        <Route
          path="/stats"
          element={
            <RequireAuth>
              <StatsPage />
            </RequireAuth>
          }
        />
        <Route path="/s/:token" element={<SharePage />} />
        {/* Legacy redirect — old route was /videos */}
        <Route path="/videos" element={<Navigate to="/library" replace />} />
        <Route path="*" element={<Navigate to="/browse" replace />} />
      </Routes>
    </div>
  );
}
