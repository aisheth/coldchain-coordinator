import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  apiRequest,
  ApiError,
  changePasswordRequest,
  getAccessToken,
  getRefreshToken,
  loginRequest,
  saveSession,
} from "./api";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("live API client", () => {
  it("logs in at the documented path and attaches the bearer token", async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce(json({ access_token: "access-1", refresh_token: "refresh-1" }));
    fetchMock.mockResolvedValueOnce(json({ items: [], total: 0, limit: 200, offset: 0 }));
    vi.stubGlobal("fetch", fetchMock);

    await loginRequest("owner", "password");
    await apiRequest("/projects?limit=200");

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "http://localhost:8000/api/v1/auth/login",
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      identifier: "owner",
      password: "password",
    });
    const headers = new Headers(fetchMock.mock.calls[1]?.[1]?.headers);
    expect(headers.get("Authorization")).toBe("Bearer access-1");
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "http://localhost:8000/api/v1/projects?limit=200",
    );
  });

  it("surfaces the backend error code, message and details", async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValue(
      json(
        {
          error: {
            code: "invalid_transition",
            message: "That step is not allowed",
            details: { allowed: ["accepted"] },
          },
        },
        409,
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const request = apiRequest("/assignments/a1/transitions", {
      method: "POST",
      body: { to_status: "completed" },
    });
    await expect(request).rejects.toMatchObject({
      code: "invalid_transition",
      message: "That step is not allowed",
      status: 409,
      details: { allowed: ["accepted"] },
    });
  });

  it("refreshes an expired access token and retries once", async () => {
    saveSession({ access_token: "expired", refresh_token: "refresh-old" });
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce(
      json({ error: { code: "unauthorized", message: "Expired", details: null } }, 401),
    );
    fetchMock.mockResolvedValueOnce(
      json({ access_token: "access-new", refresh_token: "refresh-new" }),
    );
    fetchMock.mockResolvedValueOnce(json({ id: "user-1" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiRequest("/auth/me")).resolves.toEqual({ id: "user-1" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "http://localhost:8000/api/v1/auth/refresh",
    );
    const retryHeaders = new Headers(fetchMock.mock.calls[2]?.[1]?.headers);
    expect(retryHeaders.get("Authorization")).toBe("Bearer access-new");
  });

  it("replaces both session tokens after a forced or voluntary password change", async () => {
    saveSession({ access_token: "old-access", refresh_token: "old-refresh" });
    const fetchMock = vi.fn().mockResolvedValue(
      json({
        access_token: "new-access",
        refresh_token: "new-refresh",
        must_change_password: false,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await changePasswordRequest("current-test-only", "new-test-only");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      current_password: "current-test-only",
      new_password: "new-test-only",
    });
    expect(getAccessToken()).toBe("new-access");
    expect(getRefreshToken()).toBe("new-refresh");
  });

  it("turns network/CORS failures into a readable error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(apiRequest("/projects")).rejects.toEqual(
      expect.objectContaining<Partial<ApiError>>({ code: "network_error", status: 0 }),
    );
  });
});
