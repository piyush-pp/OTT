import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { api } from "../api/client";

type ShareResolveResp = {
  id?: string;
  video?: { id: string };
};

export function SharePage() {
  const navigate = useNavigate();
  const { token } = useParams();

  useEffect(() => {
    if (!token) {
      toast.error("Missing share token");
      navigate("/browse");
      return;
    }

    api<ShareResolveResp>(`/api/v1/share/${token}`)
      .then((res) => {
        const videoId = res.id ?? res.video?.id;
        if (!videoId) {
          toast.error("Invalid share link");
          navigate("/browse");
          return;
        }
        navigate(`/videos/${videoId}`, { replace: true });
      })
      .catch((e) => {
        toast.error(e instanceof Error ? e.message : "Share link expired or invalid");
        navigate("/browse");
      });
  }, [token, navigate]);

  return (
    <div className="page">
      <div className="empty-state">
        <div className="empty-state-title">Resolving share link...</div>
        <p className="empty-state-sub">One moment while we look up that video.</p>
      </div>
    </div>
  );
}
