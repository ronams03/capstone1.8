import "@/styles/globals.css";
import "sweetalert2/dist/sweetalert2.min.css";
import type { AppProps } from "next/app";
import { useEffect, useLayoutEffect, useState } from "react";
import { AuthProvider } from "@/components/AuthProvider";
import { ToastProvider } from "@/components/Toast";
import { installNotificationGlobals } from "@/utils/notify";
import { getApiBaseUrl, normalizeLegacyBackendUrl } from "@/utils/network";

const BROWSER_ID_KEY = "intruder_browser_id";
const AUTH_CACHE_TTL_MS = 45_000;
const JSON_RESPONSE_CACHE_TTL_MS = 30_000;

const CACHEABLE_JSON_API_SUFFIXES = [
  "/api/branches.php",
  "/api/clients.php",
  "/api/employees.php",
  "/api/notifications.php",
  "/api/payroll.php",
  "/api/payroll_analytics.php",
  "/api/projects.php",
  "/api/roles.php",
  "/api/services.php",
  "/api/users.php",
];

type AuthCacheEntry = {
  payload: unknown;
  status: number;
  timestamp: number;
};

type JsonResponseCacheEntry = {
  payload: unknown;
  status: number;
  timestamp: number;
};

let authCache: AuthCacheEntry | null = null;
let authInFlight: Promise<AuthCacheEntry | null> | null = null;
const jsonResponseCache = new Map<string, JsonResponseCacheEntry>();

function clearAuthCache() {
  authCache = null;
  authInFlight = null;
}

function clearJsonResponseCache() {
  jsonResponseCache.clear();
}

function buildCachedJsonResponse(entry: JsonResponseCacheEntry) {
  return new Response(JSON.stringify(entry.payload ?? null), {
    status: entry.status,
    headers: { "Content-Type": "application/json" },
  });
}

function shouldCacheJsonApiResponse(parsedUrl: URL | null, method: string, cacheMode?: string) {
  if (!parsedUrl || method !== "GET" || cacheMode === "no-store") return false;

  const pathname = parsedUrl.pathname.toLowerCase();
  if (!/\/api\/[^?#]+\.php$/i.test(pathname)) return false;
  if (pathname.endsWith("/api/auth.php") || pathname.endsWith("/api/security-control.php")) {
    return false;
  }

  if (pathname.endsWith("/api/settings_api.php")) {
    const keys = String(parsedUrl.searchParams.get("keys") || "");
    return keys
      .split(",")
      .map((key) => key.trim())
      .includes("pagination_items_per_page");
  }

  return CACHEABLE_JSON_API_SUFFIXES.some((suffix) => pathname.endsWith(suffix));
}

function getClientBrowserId() {
  if (typeof window === "undefined") return "server_browser";
  try {
    const existing = localStorage.getItem(BROWSER_ID_KEY);
    if (existing && /^[A-Za-z0-9_-]{8,45}$/.test(existing)) return existing;

    const generated = (window.crypto && typeof window.crypto.randomUUID === "function")
      ? window.crypto.randomUUID().replace(/-/g, "")
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 18)}`;

    const browserId = generated.slice(0, 45);
    localStorage.setItem(BROWSER_ID_KEY, browserId);
    return browserId;
  } catch {
    return `anon_${Date.now().toString(36)}`;
  }
}

function shouldAttachBrowserId(input: RequestInfo | URL) {
  let rawUrl = "";
  if (typeof input === "string") rawUrl = input;
  else if (input instanceof URL) rawUrl = input.toString();
  else rawUrl = input.url;

  if (!rawUrl) return false;

  try {
    const parsed = new URL(rawUrl, window.location.origin);
    return /\/capstone1\/api\/[^?#]+\.php$/i.test(parsed.pathname);
  } catch {
    return /\/capstone1\/api\/[^?#]+\.php/i.test(rawUrl);
  }
}

const useClientLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export default function App({ Component, pageProps }: AppProps) {
  useClientLayoutEffect(() => {
    if (typeof window === "undefined") return;

    try {
      // Remove stale client-side browser lock records from previous builds.
      // The login page should never be hidden permanently by localStorage.
      window.localStorage.removeItem("intruder_browser_block_state");
    } catch {
      // Ignore storage errors.
    }
  }, []);

  useClientLayoutEffect(() => {
    if (typeof window !== "undefined") {
      // Self-heal stale wrapper chains left by dev hot-reload cycles.
      if (typeof window.__nativeFetch === "function") {
        window.fetch = window.__nativeFetch.bind(window);
      }
      if (typeof window.__nativeAlert === "function") {
        window.alert = window.__nativeAlert.bind(window);
      }
      window.__notifyInstalled = false;
    }

    const cleanup = installNotificationGlobals();
    return cleanup;
  }, []);

  useClientLayoutEffect(() => {
    if (typeof window === "undefined" || typeof window.fetch !== "function") return;

    const originalFetch = window.fetch.bind(window);

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const rawUrl = typeof input === "string"
        ? input
        : (input instanceof URL ? input.toString() : input.url);
      // Rewrite legacy localhost API calls so LAN/public clients hit the actual server host.
      const normalizedUrl = normalizeLegacyBackendUrl(rawUrl);
      const normalizedInput: RequestInfo = input instanceof Request
        ? (normalizedUrl !== rawUrl ? new Request(normalizedUrl, input) : input)
        : normalizedUrl;

      const method = (normalizedInput instanceof Request ? normalizedInput.method : init?.method || "GET").toUpperCase();
      const cacheMode = normalizedInput instanceof Request ? normalizedInput.cache : init?.cache;
      let parsedUrl: URL | null = null;
      try {
        parsedUrl = new URL(normalizedUrl, window.location.origin);
      } catch {
        parsedUrl = null;
      }

      const isAuthEndpoint = parsedUrl ? /\/api\/auth\.php$/i.test(parsedUrl.pathname) : false;
      const isAuthSessionRequest = Boolean(
        parsedUrl
        && isAuthEndpoint
        && method === "GET"
        && !parsedUrl.searchParams.has("action")
      );
      const isIntruderStatusRequest = Boolean(
        parsedUrl
        && isAuthEndpoint
        && parsedUrl.searchParams.get("action") === "intruder_status"
      );
      const isLogoutRequest = Boolean(
        parsedUrl
        && isAuthEndpoint
        && method === "POST"
        && parsedUrl.searchParams.get("action") === "logout"
      );
      const shouldUseJsonResponseCache = shouldCacheJsonApiResponse(parsedUrl, method, cacheMode);
      const jsonResponseCacheKey = shouldUseJsonResponseCache && parsedUrl ? parsedUrl.toString() : "";
      const isApiPhp = shouldAttachBrowserId(normalizedUrl);

      if (parsedUrl && isAuthEndpoint && parsedUrl.searchParams.has("action")) {
        clearAuthCache();
        clearJsonResponseCache();
      }

      if (parsedUrl && isApiPhp && method !== "GET") {
        clearJsonResponseCache();
      }

      const browserId = isApiPhp ? getClientBrowserId() : "";
      const mergedHeaders = new Headers();

      if (normalizedInput instanceof Request) {
        normalizedInput.headers.forEach((value, key) => mergedHeaders.set(key, value));
      }

      const initHeaders = new Headers(init?.headers || undefined);
      initHeaders.forEach((value, key) => mergedHeaders.set(key, value));

      if (isApiPhp && !mergedHeaders.has("X-Client-Browser-ID")) {
        mergedHeaders.set("X-Client-Browser-ID", browserId);
      }

      const hasMergedHeaders = Array.from(mergedHeaders.keys()).length > 0;
      const nextInit: RequestInit = hasMergedHeaders
        ? { ...(init || {}), headers: mergedHeaders }
        : (init || {});

      const performFetch = () => {
        if (normalizedInput instanceof Request) {
          return originalFetch(new Request(normalizedInput, nextInit));
        }
        return originalFetch(normalizedInput, nextInit);
      };

      if (isLogoutRequest) {
        void performFetch();
        return new Response(JSON.stringify({ success: true, message: 'Logout successful' }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (isAuthSessionRequest) {
        const now = Date.now();
        if (authCache && now - authCache.timestamp < AUTH_CACHE_TTL_MS) {
          return new Response(JSON.stringify(authCache.payload ?? null), {
            status: authCache.status,
            headers: { "Content-Type": "application/json" },
          });
        }

        if (!authInFlight) {
          authInFlight = (async () => {
            const res = await performFetch();
            let payload: unknown = null;
            try {
              payload = await res.clone().json();
            } catch {
              payload = null;
            }

            const entry: AuthCacheEntry = {
              payload,
              status: res.status,
              timestamp: Date.now(),
            };
            authCache = entry;
            return entry;
          })().catch(() => null).finally(() => {
            authInFlight = null;
          });
        }

        const entry = await authInFlight;
        if (entry) {
          return new Response(JSON.stringify(entry.payload ?? null), {
            status: entry.status,
            headers: { "Content-Type": "application/json" },
          });
        }
      }

      if (shouldUseJsonResponseCache && jsonResponseCacheKey) {
        const now = Date.now();
        const cachedEntry = jsonResponseCache.get(jsonResponseCacheKey);
        if (cachedEntry && now - cachedEntry.timestamp < JSON_RESPONSE_CACHE_TTL_MS) {
          return buildCachedJsonResponse(cachedEntry);
        }
      }

      const res = await performFetch();

      if (shouldUseJsonResponseCache) {
        let payload: unknown = null;
        try {
          payload = await res.clone().json();
        } catch {
          payload = null;
        }

        if (shouldUseJsonResponseCache && jsonResponseCacheKey && payload !== null) {
          const cacheEntry: JsonResponseCacheEntry = {
            payload,
            status: res.status,
            timestamp: Date.now(),
          };
          jsonResponseCache.set(jsonResponseCacheKey, cacheEntry);
          return buildCachedJsonResponse(cacheEntry);
        }
      }

      return res;
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  return (
    <ToastProvider>
      <AuthProvider>
        <Component {...pageProps} />
      </AuthProvider>
    </ToastProvider>
  );
}
