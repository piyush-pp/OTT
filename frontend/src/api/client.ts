const baseUrl = import.meta.env.VITE_API_BASE_URL as string;

const ACCESS_KEY = "access_token";
const REFRESH_KEY = "refresh_token";
const ADMIN_KEY = "is_admin";

export function getAccessToken() {
  return localStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken() {
  return localStorage.getItem(REFRESH_KEY);
}

export function setTokens(tokens: { accessToken: string; refreshToken: string } | null) {
  if (!tokens) {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(ADMIN_KEY);
  } else {
    localStorage.setItem(ACCESS_KEY, tokens.accessToken);
    localStorage.setItem(REFRESH_KEY, tokens.refreshToken);
  }
}

/** @deprecated kept for compat */
export function setToken(token: string | null) {
  if (!token) setTokens(null);
}

export function isLoggedIn() {
  return Boolean(getAccessToken());
}

/** Cached admin flag; refresh via probeAdmin(). */
export function isAdminCached(): boolean {
  return localStorage.getItem(ADMIN_KEY) === "1";
}

export function setAdmin(flag: boolean) {
  if (flag) localStorage.setItem(ADMIN_KEY, "1");
  else localStorage.removeItem(ADMIN_KEY);
}

/** Probe whether the current user is an admin by hitting /admin/stats. */
export async function probeAdmin(): Promise<boolean> {
  const token = getAccessToken();
  if (!token) {
    setAdmin(false);
    return false;
  }
  try {
    const res = await fetch(`${baseUrl}/api/v1/admin/stats`, {
      headers: { authorization: `Bearer ${token}` }
    });
    const ok = res.ok;
    setAdmin(ok);
    return ok;
  } catch {
    setAdmin(false);
    return false;
  }
}

let isRefreshing = false;
let refreshSubscribers: Array<(token: string) => void> = [];

function onRefreshed(newToken: string) {
  refreshSubscribers.forEach((cb) => cb(newToken));
  refreshSubscribers = [];
}

async function attemptRefresh(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  const res = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refreshToken })
  });

  if (!res.ok) {
    setTokens(null);
    return null;
  }

  const data = (await res.json()) as { accessToken: string; refreshToken: string };
  setTokens(data);
  return data.accessToken;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAccessToken();

  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
      ...(token ? { authorization: `Bearer ${token}` } : {})
    }
  });

  // On 401, attempt a single token refresh then retry
  if (res.status === 401) {
    if (isRefreshing) {
      const newToken = await new Promise<string | null>((resolve) => {
        refreshSubscribers.push(resolve);
      });
      if (!newToken) throw new Error("Session expired. Please log in again.");

      const retryRes = await fetch(`${baseUrl}${path}`, {
        ...init,
        headers: {
          "content-type": "application/json",
          ...(init?.headers ?? {}),
          authorization: `Bearer ${newToken}`
        }
      });
      if (!retryRes.ok) {
        const data = (await retryRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Request failed: ${retryRes.status}`);
      }
      return (await retryRes.json()) as T;
    }

    isRefreshing = true;
    try {
      const newToken = await attemptRefresh();
      onRefreshed(newToken ?? "");
      if (!newToken) throw new Error("Session expired. Please log in again.");

      const retryRes = await fetch(`${baseUrl}${path}`, {
        ...init,
        headers: {
          "content-type": "application/json",
          ...(init?.headers ?? {}),
          authorization: `Bearer ${newToken}`
        }
      });
      if (!retryRes.ok) {
        const data = (await retryRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Request failed: ${retryRes.status}`);
      }
      return (await retryRes.json()) as T;
    } finally {
      isRefreshing = false;
    }
  }

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Request failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

/** Returns the full URL for a backend-relative path (e.g. /videos/ID/thumbnail) */
export function apiUrl(path: string) {
  return `${baseUrl}${path}`;
}

export function getApiBaseUrl() {
  return baseUrl;
}
