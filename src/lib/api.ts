export const API_BASE_URL = (
  import.meta.env["VITE_API_BASE_URL"] || "http://localhost:8000"
).replace(/\/+$/, "");
const API_ROOT = `${API_BASE_URL}/api/v1`;
const ACCESS_KEY = "coldtrack-access-token";
const REFRESH_KEY = "coldtrack-refresh-token";

export interface TokenOut {
  access_token: string;
  refresh_token: string;
  token_type?: string;
  must_change_password?: boolean;
}
export interface ApiErrorBody {
  error?: { code?: string; message?: string; details?: unknown };
  detail?: unknown;
}

export class ApiError extends Error {
  status: number;
  code: string;
  details: unknown;
  constructor(message: string, status = 0, code = "request_failed", details: unknown = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function validationMessage(detail: unknown): string | null {
  if (!Array.isArray(detail)) return null;
  const messages = detail.map((entry) => {
    if (!entry || typeof entry !== "object") return String(entry);
    const item = entry as { msg?: unknown; loc?: unknown[] };
    const field = Array.isArray(item.loc) ? item.loc.filter((x) => x !== "body").join(".") : "";
    return `${field ? `${field}: ` : ""}${String(item.msg ?? "Invalid value")}`;
  });
  return messages.length ? messages.join("; ") : null;
}

function storage(): Storage | null {
  return typeof window === "undefined" ? null : window.sessionStorage;
}
export function getAccessToken() {
  return storage()?.getItem(ACCESS_KEY) ?? null;
}
export function getRefreshToken() {
  return storage()?.getItem(REFRESH_KEY) ?? null;
}
export function hasSession() {
  return Boolean(getAccessToken() || getRefreshToken());
}
export function saveSession(tokens: TokenOut) {
  storage()?.setItem(ACCESS_KEY, tokens.access_token);
  storage()?.setItem(REFRESH_KEY, tokens.refresh_token);
}
export function clearSession() {
  storage()?.removeItem(ACCESS_KEY);
  storage()?.removeItem(REFRESH_KEY);
}
function announceExpiredSession() {
  clearSession();
  if (typeof window !== "undefined") window.dispatchEvent(new Event("coldtrack:auth-expired"));
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  auth?: boolean;
  response?: "json" | "blob";
}

async function rawRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, auth = true, response = "json" } = options;
  const headers = new Headers({ Accept: response === "blob" ? "*/*" : "application/json" });
  const token = auth ? getAccessToken() : null;
  if (token) headers.set("Authorization", `Bearer ${token}`);
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers.set("Content-Type", "application/json");
    payload = JSON.stringify(body);
  }

  let res: Response;
  try {
    res = await fetch(`${API_ROOT}${path}`, { method, headers, body: payload ?? null });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      "Could not reach the ColdTrack API. Check your connection and the API's CORS configuration.",
      0,
      "network_error",
      error,
    );
  }

  if (!res.ok) {
    let data: ApiErrorBody | null = null;
    try {
      data = (await res.json()) as ApiErrorBody;
    } catch {
      /* Non-JSON error response. */
    }
    const validation = validationMessage(data?.detail);
    const message =
      data?.error?.message || validation || `The API returned ${res.status} ${res.statusText}.`;
    throw new ApiError(
      message,
      res.status,
      data?.error?.code || (validation ? "validation_error" : "http_error"),
      data?.error?.details ?? data?.detail ?? null,
    );
  }
  if (res.status === 204) return undefined as T;
  if (response === "blob") return (await res.blob()) as T;
  return (await res.json()) as T;
}

let refreshing: Promise<TokenOut> | null = null;
async function refreshSession(): Promise<TokenOut> {
  const refresh_token = getRefreshToken();
  if (!refresh_token)
    throw new ApiError("Your session has expired. Please sign in again.", 401, "session_expired");
  if (!refreshing) {
    refreshing = rawRequest<TokenOut>("/auth/refresh", {
      method: "POST",
      body: { refresh_token },
      auth: false,
    })
      .then((tokens) => {
        saveSession(tokens);
        return tokens;
      })
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const auth = options.auth ?? true;
  try {
    return await rawRequest<T>(path, options);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401 || !auth || path === "/auth/refresh")
      throw error;
    try {
      await refreshSession();
      return await rawRequest<T>(path, options);
    } catch (refreshError) {
      announceExpiredSession();
      if (refreshError instanceof ApiError && refreshError.code === "network_error")
        throw refreshError;
      throw new ApiError(
        "Your session has expired. Please sign in again.",
        401,
        "session_expired",
        refreshError,
      );
    }
  }
}

export async function loginRequest(identifier: string, password: string): Promise<TokenOut> {
  const tokens = await rawRequest<TokenOut>("/auth/login", {
    method: "POST",
    body: { identifier, password },
    auth: false,
  });
  saveSession(tokens);
  return tokens;
}

export async function logoutRequest() {
  const refresh_token = getRefreshToken();
  try {
    if (refresh_token)
      await rawRequest<void>("/auth/logout", { method: "POST", body: { refresh_token } });
  } finally {
    clearSession();
  }
}

export async function changePasswordRequest(current_password: string, new_password: string) {
  const tokens = await apiRequest<TokenOut>("/auth/change-password", {
    method: "POST",
    body: { current_password, new_password },
  });
  // The API rotates credentials after a password change; never keep using revoked tokens.
  saveSession(tokens);
  return tokens;
}

export async function uploadAttachment(file: File) {
  const form = new FormData();
  form.append("file", file);
  return apiRequest<{ id: string; filename: string; mime: string; size: number }>("/attachments", {
    method: "POST",
    body: form,
  });
}

export function downloadAttachment(id: string) {
  return apiRequest<Blob>(`/attachments/${encodeURIComponent(id)}/download`, { response: "blob" });
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}
