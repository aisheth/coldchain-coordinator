import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StoreProvider, useStore } from "./store";
import type { ApiUser } from "./api-types";

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  login: vi.fn(),
  changePassword: vi.fn(),
}));

vi.mock("./api", async (original) => ({
  ...(await original<typeof import("./api")>()),
  apiRequest: mocks.request,
  loginRequest: mocks.login,
  changePasswordRequest: mocks.changePassword,
  hasSession: () => false,
  clearSession: vi.fn(),
}));

const owner: ApiUser = {
  id: "owner-1",
  org_id: "org-1",
  username: "owner",
  email: null,
  name: "Owner",
  phone: null,
  role: "owner",
  is_active: true,
  must_change_password: false,
};
const worker: ApiUser = {
  id: "worker-1",
  org_id: "org-1",
  username: "field.user",
  email: "old@example.com",
  name: "Field Worker",
  phone: "123",
  role: "worker",
  is_active: true,
  must_change_password: false,
};
const page = <T,>(items: T[]) => ({ items, total: items.length, limit: 200, offset: 0 });

function wrapper({ children }: { children: ReactNode }) {
  return <StoreProvider>{children}</StoreProvider>;
}

beforeEach(() => {
  mocks.request.mockReset();
  mocks.login.mockReset();
  mocks.changePassword.mockReset();
  mocks.login.mockResolvedValue({ access_token: "access", refresh_token: "refresh" });
  mocks.request.mockImplementation(async (path: string) => {
    if (path === "/auth/me") return owner;
    if (path === "/organization/settings") return {};
    if (path.startsWith("/users?")) return page([worker]);
    return page([]);
  });
});

describe("worker account management", () => {
  it("updates name, email, phone and active status at the documented endpoint and reads back the saved user", async () => {
    const updated: ApiUser = {
      ...worker,
      name: "Updated Worker",
      email: "new@example.com",
      phone: "987",
      is_active: false,
    };
    mocks.request.mockImplementation(async (path: string, options?: { method?: string }) => {
      if (path === "/users/worker-1" && options?.method === "PATCH") return updated;
      if (path === "/auth/me") return owner;
      if (path === "/organization/settings") return {};
      if (path.startsWith("/users?")) return page([worker]);
      return page([]);
    });
    const { result } = renderHook(() => useStore(), { wrapper });
    await act(async () => {
      await result.current.login("owner", "test-only-password");
    });
    await act(async () => {
      await result.current.updateWorker(worker.id, {
        name: " Updated Worker ",
        email: " new@example.com ",
        phone: " 987 ",
        isActive: false,
      });
    });
    expect(mocks.request).toHaveBeenCalledWith("/users/worker-1", {
      method: "PATCH",
      body: {
        name: "Updated Worker",
        email: "new@example.com",
        phone: "987",
        is_active: false,
      },
    });
    expect(result.current.state.workers[0]).toMatchObject({
      name: "Updated Worker",
      email: "new@example.com",
      phone: "987",
      isActive: false,
      role: "worker",
    });
  });

  it("returns the reset temporary password only after the API confirms", async () => {
    let finish: ((value: { temporary_password: string }) => void) | undefined;
    mocks.request.mockImplementation(async (path: string, options?: { method?: string }) => {
      if (path === "/users/worker-1/reset-password" && options?.method === "POST")
        return new Promise<{ temporary_password: string }>((resolve) => {
          finish = resolve;
        });
      if (path === "/auth/me") return owner;
      if (path === "/organization/settings") return {};
      if (path.startsWith("/users?")) return page([worker]);
      return page([]);
    });
    const { result } = renderHook(() => useStore(), { wrapper });
    await act(async () => {
      await result.current.login("owner", "test-only-password");
    });
    let reset: Promise<string>;
    act(() => {
      reset = result.current.resetWorkerPassword(worker.id);
    });
    expect(mocks.request).toHaveBeenCalledWith("/users/worker-1/reset-password", {
      method: "POST",
    });
    await act(async () => {
      finish?.({ temporary_password: "temporary-test-only" });
      await expect(reset).resolves.toBe("temporary-test-only");
    });
  });

  it("denies worker self-service access to management and reset endpoints", async () => {
    mocks.request.mockImplementation(async (path: string) => {
      if (path === "/auth/me") return worker;
      if (path.startsWith("/me/assignments?") || path.startsWith("/vendors?")) return page([]);
      throw new Error(`Unexpected request ${path}`);
    });
    const { result } = renderHook(() => useStore(), { wrapper });
    await act(async () => {
      await result.current.login("field.user", "test-only-password");
    });
    await expect(
      result.current.updateWorker(worker.id, {
        name: "Changed",
        email: "",
        phone: "",
        isActive: true,
      }),
    ).rejects.toThrow("cannot manage");
    await expect(result.current.resetWorkerPassword(worker.id)).rejects.toThrow("cannot reset");
    expect(
      mocks.request.mock.calls.some(
        ([path, options]) =>
          path === "/users/worker-1" ||
          (path === "/users/worker-1/reset-password" && options?.method === "POST"),
      ),
    ).toBe(false);
  });

  it("uses the password-change helper that replaces rotated session tokens", async () => {
    mocks.changePassword.mockResolvedValue({
      access_token: "new-access",
      refresh_token: "new-refresh",
      must_change_password: false,
    });
    const { result } = renderHook(() => useStore(), { wrapper });
    await act(async () => {
      await result.current.login("owner", "test-only-password");
    });
    await act(async () => {
      await result.current.changePassword("old-test-only", "new-test-only");
    });
    expect(mocks.changePassword).toHaveBeenCalledWith("old-test-only", "new-test-only");
    expect(result.current.user?.must_change_password).toBe(false);
  });
});
