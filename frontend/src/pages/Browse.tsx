import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, Play, Search } from "lucide-react";
import { toast } from "sonner";
import { api, apiUrl } from "../api/client";
import { CardVideo, VideoCard, VideoCardSkeleton } from "../components/VideoCard";

type ListResp = {
  data: CardVideo[];
  meta: { total: number; page: number; pageSize: number; hasMore: boolean };
};

type CategoriesResp = { data: string[] };

type FeaturedResp = {
  id: string;
  title: string;
  description?: string | null;
  category?: string | null;
  thumbnailUrl?: string | null;
  thumbnails?: { sm?: string; md?: string; lg?: string } | null;
};

const PAGE_SIZE = 12;

export function BrowsePage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [videos, setVideos] = useState<CardVideo[]>([]);
  const [meta, setMeta] = useState<ListResp["meta"]>({
    total: 0,
    page: 1,
    pageSize: PAGE_SIZE,
    hasMore: false
  });
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<string[]>([]);
  const [featured, setFeatured] = useState<FeaturedResp | null>(null);

  // Debounce the search input
  const debounceTimer = useRef<number | null>(null);
  useEffect(() => {
    if (debounceTimer.current) window.clearTimeout(debounceTimer.current);
    debounceTimer.current = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => {
      if (debounceTimer.current) window.clearTimeout(debounceTimer.current);
    };
  }, [search]);

  // Load categories + featured once on mount
  useEffect(() => {
    api<CategoriesResp>("/api/v1/categories")
      .then((res) => setCategories(res.data))
      .catch(() => {
        /* non-critical */
      });
    api<{ data: FeaturedResp }>("/api/v1/browse/featured")
      .then((res) => setFeatured(res.data))
      .catch(() => setFeatured(null));
  }, []);

  // Fetch list when filters/page change
  useEffect(() => {
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("q", debouncedSearch);
    if (category) params.set("category", category);
    params.set("page", String(page));
    params.set("pageSize", String(PAGE_SIZE));
    const qs = params.toString();

    setLoading(true);
    api<ListResp>(`/api/v1/browse?${qs}`)
      .then((res) => {
        setVideos(res.data);
        setMeta(res.meta);
      })
      .catch((e) => {
        toast.error(e instanceof Error ? e.message : "Failed to load videos");
      })
      .finally(() => setLoading(false));
  }, [debouncedSearch, category, page]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(meta.total / meta.pageSize)),
    [meta.total, meta.pageSize]
  );

  const featuredBg = featured
    ? apiUrl(`/api/v1/browse/${featured.id}/thumbnail`)
    : null;

  return (
    <div className="page">
      {featured && (
        <div
          className="hero-banner"
          role="button"
          tabIndex={0}
          onClick={() => navigate(`/videos/${featured.id}`)}
          onKeyDown={(e) => {
            if (e.key === "Enter") navigate(`/videos/${featured.id}`);
          }}
          style={{ cursor: "pointer" }}
        >
          {featuredBg && (
            <img className="hero-banner-bg" src={featuredBg} alt="" aria-hidden />
          )}
          <div className="hero-banner-gradient" />
          <div className="hero-banner-content">
            <span className="hero-banner-eyebrow">Featured</span>
            <h1 className="hero-banner-title">{featured.title}</h1>
            {featured.description && (
              <p className="hero-banner-desc">{featured.description}</p>
            )}
            <button
              type="button"
              className="btn btn-primary hero-banner-cta"
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/videos/${featured.id}`);
              }}
            >
              <Play size={14} fill="currentColor" />
              Watch Now
            </button>
          </div>
        </div>
      )}

      <div className="page-header">
        <div className="page-title-block">
          <h1>Browse</h1>
          <p className="page-title-sub">Discover public videos from the community.</p>
        </div>
      </div>

      <div className="search-row">
        <div className="search-input-wrap">
          <Search size={14} />
          <input
            className="search-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search videos..."
            type="search"
          />
        </div>
      </div>

      {categories.length > 0 && (
        <div className="category-row">
          {categories.map((c) => {
            const active = category === c;
            return (
              <button
                key={c}
                className={`category-chip ${active ? "active" : ""}`}
                onClick={() => {
                  setCategory(active ? null : c);
                  setPage(1);
                }}
              >
                {c}
              </button>
            );
          })}
        </div>
      )}

      {loading ? (
        <div className="video-grid">
          {Array.from({ length: 8 }).map((_, i) => (
            <VideoCardSkeleton key={i} />
          ))}
        </div>
      ) : videos.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <Search size={24} />
          </div>
          <div className="empty-state-title">No videos found</div>
          <p className="empty-state-sub">
            Try a different search or clear the category filter.
          </p>
        </div>
      ) : (
        <>
          <div className="video-grid">
            {videos.map((v) => (
              <VideoCard key={v.id} video={v} variant="browse" />
            ))}
          </div>

          <div className="pagination">
            <button
              type="button"
              className="btn btn-sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft size={14} />
              Previous
            </button>
            <span className="pagination-text">
              Page {meta.page} of {totalPages}
            </span>
            <button
              type="button"
              className="btn btn-sm"
              disabled={!meta.hasMore}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
              <ChevronRight size={14} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
