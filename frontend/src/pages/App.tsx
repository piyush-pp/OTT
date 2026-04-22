import { Link, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { getToken, setToken } from "../api/client";
import { AuthPage } from "./Auth";
import { UploadPage } from "./Upload";
import { VideosPage } from "./Videos";
import { PlayerPage } from "./Player";

export function App() {
  const navigate = useNavigate();
  const authed = Boolean(getToken());

  return (
    <div className="container">
      <div className="nav">
        <div className="brand">
          <strong>OTT Streaming MVP</strong>
          <span>HLS (360p/720p/1080p) via queue worker</span>
        </div>
        <div className="navlinks">
          <Link className="btn" to="/videos">
            Videos
          </Link>
          <Link className="btn" to="/upload">
            Upload
          </Link>
          {authed ? (
            <button
              className="btn"
              onClick={() => {
                setToken(null);
                navigate("/auth");
              }}
            >
              Logout
            </button>
          ) : (
            <Link className="btn primary" to="/auth">
              Login
            </Link>
          )}
        </div>
      </div>

      <Routes>
        <Route path="/" element={<Navigate to={authed ? "/videos" : "/auth"} replace />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/upload" element={authed ? <UploadPage /> : <Navigate to="/auth" replace />} />
        <Route path="/videos" element={authed ? <VideosPage /> : <Navigate to="/auth" replace />} />
        <Route path="/videos/:id" element={authed ? <PlayerPage /> : <Navigate to="/auth" replace />} />
      </Routes>
    </div>
  );
}
