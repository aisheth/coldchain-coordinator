import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StoreProvider, useStore } from "./store";
import { workerState } from "./api-adapters";
import { isWorkerPath, signInDestination } from "./navigation";
import type { ApiAssignment, ApiUser } from "./api-types";
const mocks = vi.hoisted(() => ({ request: vi.fn(), login: vi.fn() }));
vi.mock("./api", async (original) => ({
  ...(await original<typeof import("./api")>()),
  apiRequest: mocks.request,
  loginRequest: mocks.login,
  hasSession: () => false,
  clearSession: vi.fn(),
}));
const worker: ApiUser = {
  id: "w1",
  org_id: "o1",
  username: "worker",
  name: "Field worker",
  role: "worker",
  email: null,
  phone: null,
  is_active: true,
  must_change_password: false,
};
const assignment: ApiAssignment = {
  id: "a1",
  request_id: "r1",
  request_code: "PR-1",
  project_id: "p1",
  project_name: "Own site",
  worker_id: "w1",
  worker_name: "Field worker",
  vendor_id: "v1",
  vendor_name: "Vendor",
  status: "assigned",
  is_on_hold: false,
  is_overdue: false,
  due_date: null,
  assigned_at: "2026-11-25T06:00:00Z",
  delivery_location: "Site",
  instructions: "Check stock",
  requires_approval: false,
  replaced_by_id: null,
  cancel_reason: null,
  items: [],
  history: [],
  issues: [],
  delivery: null,
  allowed_transitions: ["accepted"],
  can_cancel: false,
  can_reassign: false,
};
function wrapper({ children }: { children: ReactNode }) {
  return <StoreProvider>{children}</StoreProvider>;
}
beforeEach(() => {
  mocks.login.mockReset();
  mocks.request.mockReset();
  mocks.request.mockImplementation(async (path: string, options?: { method?: string }) => {
    if (path === "/auth/me") return worker;
    if (path.startsWith("/me/assignments?"))
      return { items: [assignment, { ...assignment, id: "a2", worker_id: "w2" }], total: 2 };
    if (path.startsWith("/vendors?")) return { items: [], total: 0 };
    if (path === "/assignments/a1") return assignment;
    if (path === "/assignments/a1/transitions" && options?.method === "POST")
      return { ...assignment, status: "accepted", allowed_transitions: ["travelling"] };
    throw new Error(`Unexpected path ${path}`);
  });
});
describe("worker authentication and assignment isolation", () => {
  it("uses the worker's own sign-in and routes workers separately from owner/admin management", async () => {
    const { result } = renderHook(() => useStore(), { wrapper });
    await act(async () => {
      await result.current.login("field.user", "test-only-password");
    });
    expect(mocks.login).toHaveBeenCalledWith("field.user", "test-only-password");
    expect(signInDestination(result.current.user?.role ?? "owner")).toBe("/worker");
    expect(signInDestination("owner")).toBe("/");
    expect(signInDestination("admin")).toBe("/");
    expect(isWorkerPath("/workers")).toBe(false);
    expect(isWorkerPath("/worker/task/a1")).toBe(true);
  });
  it("reads only /me/assignments, excludes foreign summaries before detail fetches, and filters all derived state", async () => {
    const { result } = renderHook(() => useStore(), { wrapper });
    await act(async () => {
      await result.current.login("worker", "test-only-password");
    });
    expect(
      mocks.request.mock.calls.some(([path]) => String(path).startsWith("/me/assignments?")),
    ).toBe(true);
    expect(
      mocks.request.mock.calls.some(([path]) => String(path).startsWith("/assignments?")),
    ).toBe(false);
    expect(mocks.request).not.toHaveBeenCalledWith("/assignments/a2");
    expect(result.current.state.tasks.map((task) => task.id)).toEqual(["a1"]);
    const state = workerState(
      worker,
      [assignment, { ...assignment, id: "a2", project_id: "foreign-site", worker_id: "w2" }],
      [],
    );
    expect(state.tasks.map((task) => task.id)).toEqual(["a1"]);
    expect(state.projects.map((project) => project.id)).toEqual(["p1"]);
  });
  it("sends only allowed own-task status actions and updates their readback state", async () => {
    const { result } = renderHook(() => useStore(), { wrapper });
    await act(async () => {
      await result.current.login("worker", "test-only-password");
    });
    await act(async () => {
      await result.current.transitionTask("a1", "accepted", "Collected assignment");
    });
    expect(mocks.request).toHaveBeenCalledWith("/assignments/a1/transitions", {
      method: "POST",
      body: { to_status: "accepted", remarks: "Collected assignment", attachment_ids: [] },
    });
    expect(result.current.state.tasks[0]?.rawStatus).toBe("accepted");
    await expect(result.current.transitionTask("a2", "accepted")).rejects.toThrow("not allowed");
    await expect(result.current.transitionTask("a1", "completed")).rejects.toThrow("not allowed");
  });
  it("rejects master imports for workers without making write requests", async () => {
    const { result } = renderHook(() => useStore(), { wrapper });
    await act(async () => {
      await result.current.login("worker", "test-only-password");
    });
    await expect(result.current.loadImportContext()).rejects.toThrow("owner/admin");
    await expect(
      result.current.importMasterRow(
        "vendors",
        { record: 2, values: { name: "Not allowed" }, errors: [], status: "ready", message: "" },
        { items: [], vendors: [], customers: [], users: [], categories: [], sizes: [], uoms: [] },
        "",
      ),
    ).rejects.toThrow("cannot import");
    expect(mocks.request.mock.calls.some(([, options]) => options?.method === "POST")).toBe(false);
  });
});
