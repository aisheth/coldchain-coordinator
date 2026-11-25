import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectForm } from "./ProjectForm";
import { draftKey } from "@/lib/drafts";
import type { ApiUser } from "@/lib/api-types";
const mocks = vi.hoisted(() => ({ store: vi.fn() }));
vi.mock("@/lib/store", () => ({ useStore: mocks.store }));
const user: ApiUser = {
  id: "o1",
  org_id: "org1",
  username: "owner",
  name: "Owner",
  role: "owner",
  email: null,
  phone: null,
  is_active: true,
  must_change_password: false,
};
beforeEach(() => {
  localStorage.clear();
  mocks.store.mockReturnValue({ user, state: { customers: [] } });
});
afterEach(cleanup);
function fill() {
  fireEvent.change(screen.getByRole("textbox", { name: "Project name" }), {
    target: { value: "New cold room" },
  });
  fireEvent.change(screen.getByLabelText(/^Customer/), {
    target: { value: "Customer A" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "Site address" }), {
    target: { value: "Site A" },
  });
  fireEvent.change(screen.getByLabelText("Expected deployment"), {
    target: { value: "2026-11-30" },
  });
}
describe("project form draft/save boundaries", () => {
  it("never submits on close/navigation and restores the draft after remount", () => {
    const save = vi.fn();
    const open = vi.fn();
    const first = render(<ProjectForm open onOpenChange={open} onSave={save} />);
    fill();
    const close = screen.getAllByRole("button", { name: /^Close$/ })[0];
    if (!close) throw new Error("Close control missing");
    fireEvent.click(close);
    expect(open).toHaveBeenCalledWith(false);
    expect(save).not.toHaveBeenCalled();
    first.unmount();
    render(<ProjectForm open onOpenChange={open} onSave={save} />);
    fireEvent.click(screen.getByRole("button", { name: /^Resume$/ }));
    expect(screen.getByRole("textbox", { name: "Project name" })).toHaveValue("New cold room");
    expect(save).not.toHaveBeenCalled();
  });
  it("keeps the draft and displays a save failure", async () => {
    const save = vi.fn().mockRejectedValue(new Error("API denied this project"));
    render(<ProjectForm open onOpenChange={vi.fn()} onSave={save} />);
    fill();
    fireEvent.click(screen.getByRole("button", { name: /^Save project$/ }));
    await screen.findByRole("alert");
    expect(screen.getByRole("alert")).toHaveTextContent("API denied this project");
    expect(localStorage.getItem(draftKey(user, "project:new"))).not.toBeNull();
  });
  it("clears the draft only after save resolves successfully", async () => {
    let finish: (() => void) | undefined;
    const save = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    render(<ProjectForm open onOpenChange={vi.fn()} onSave={save} />);
    fill();
    fireEvent.click(screen.getByRole("button", { name: /^Save project$/ }));
    expect(localStorage.getItem(draftKey(user, "project:new"))).not.toBeNull();
    finish?.();
    await waitFor(() => expect(localStorage.getItem(draftKey(user, "project:new"))).toBeNull());
  });
});
