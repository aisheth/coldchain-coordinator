import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { draftKey, safeDraft, useDraft } from "./drafts";
import type { ApiUser } from "./api-types";
const user: ApiUser = {
  id: "owner-1",
  org_id: "org-1",
  username: "owner",
  name: "Owner",
  role: "owner",
  email: null,
  phone: null,
  is_active: true,
  must_change_password: false,
};
beforeEach(() => localStorage.clear());
describe("browser-local form drafts", () => {
  it("persists unsaved project input synchronously through module navigation and reload, then resumes explicitly", () => {
    const first = renderHook(() => useDraft(user, "project:new", { name: "", address: "" }));
    act(() => first.result.current.setData({ name: "Cold room", address: "Site A" }));
    expect(JSON.parse(localStorage.getItem(draftKey(user, "project:new")) ?? "{}").data).toEqual({
      name: "Cold room",
      address: "Site A",
    });
    first.unmount(); // leaving the module does not submit/discard
    const next = renderHook(() => useDraft(user, "project:new", { name: "", address: "" }));
    expect(next.result.current.pending).toBe(true);
    expect(next.result.current.data.name).toBe("");
    act(() => next.result.current.resume());
    expect(next.result.current.data).toEqual({ name: "Cold room", address: "Site A" });
  });
  it("isolates drafts by signed-in user, organization and entity", () => {
    const first = renderHook(() => useDraft(user, "project:p1", { name: "" }));
    act(() => first.result.current.setData({ name: "Private input" }));
    const other = renderHook(() =>
      useDraft({ ...user, id: "owner-2" }, "project:p1", { name: "" }),
    );
    const entity = renderHook(() => useDraft(user, "project:p2", { name: "" }));
    const org = renderHook(() =>
      useDraft({ ...user, org_id: "org-2" }, "project:p1", { name: "" }),
    );
    for (const hook of [other, entity, org]) expect(hook.result.current.status).toBe("empty");
  });
  it("keeps material lists, quantities, finalization and assignment fields but excludes secrets and photos", () => {
    const first = renderHook(() =>
      useDraft(user, "procurement:new:all", {
        list: [] as { variantId: string; qty: number }[],
        finalized: false,
        workerId: "",
        password: "",
        access_token: "",
        photo: "",
      }),
    );
    act(() =>
      first.result.current.setData({
        list: [{ variantId: "v1", qty: 5 }],
        finalized: true,
        workerId: "w1",
        password: "not-for-storage",
        access_token: "not-for-storage",
        photo: "not-for-storage",
      }),
    );
    const stored = localStorage.getItem(draftKey(user, "procurement:new:all")) ?? "";
    expect(stored).not.toContain("not-for-storage");
    expect(JSON.parse(stored).data).toEqual({
      list: [{ variantId: "v1", qty: 5 }],
      finalized: true,
      workerId: "w1",
    });
    expect(safeDraft({ vendor: { password: "hidden", name: "Vendor" } })).toEqual({
      vendor: { name: "Vendor" },
    });
  });
  it("removes only the selected draft after explicit discard or confirmed successful save", () => {
    const first = renderHook(() => useDraft(user, "project:new", { name: "" }));
    const second = renderHook(() => useDraft(user, "owner-task:t1:status", { note: "" }));
    act(() => {
      first.result.current.setData({ name: "Draft" });
      second.result.current.setData({ note: "Waiting" });
    });
    act(() => first.result.current.clear());
    expect(localStorage.getItem(draftKey(user, "project:new"))).toBeNull();
    expect(localStorage.getItem(draftKey(user, "owner-task:t1:status"))).not.toBeNull();
    expect(first.result.current.data.name).toBe("");
  });
  it("reports storage failure instead of claiming persistence", () => {
    const first = renderHook(() => useDraft(user, "project:new", { name: "" }));
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("full");
    });
    act(() => first.result.current.setData({ name: "Unsaved" }));
    expect(first.result.current.status).toBe("unavailable");
    expect(first.result.current.error).toContain("not saved");
    expect(first.result.current.data.name).toBe("Unsaved");
    spy.mockRestore();
  });
});
