import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkerAccountActions } from "./WorkerAccountActions";
import type { ApiUser } from "@/lib/api-types";
import type { Worker } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  store: vi.fn(),
  update: vi.fn(),
  reset: vi.fn(),
}));
vi.mock("@/lib/store", () => ({ useStore: mocks.store }));

const owner: ApiUser = {
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
const worker: Worker = {
  id: "worker-1",
  username: "field.user",
  name: "Field Worker",
  email: "old@example.com",
  phone: "123",
  area: "",
  role: "worker",
  isActive: true,
  mustChangePassword: false,
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  mocks.update.mockReset().mockResolvedValue(undefined);
  mocks.reset.mockReset();
  mocks.store.mockReturnValue({
    user: owner,
    updateWorker: mocks.update,
    resetWorkerPassword: mocks.reset,
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("owner worker account actions", () => {
  it("edits contact details and active status only after confirmation by the save action", async () => {
    render(<WorkerAccountActions worker={worker} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
      target: { value: "Updated Worker" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Email" }), {
      target: { value: "new@example.com" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Phone" }), {
      target: { value: "987" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /Active worker account/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(mocks.update).toHaveBeenCalledWith("worker-1", {
        name: "Updated Worker",
        email: "new@example.com",
        phone: "987",
        isActive: false,
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("requires reset confirmation, shows loading, then displays a copyable temporary password once", async () => {
    const temporaryPassword = "temporary-test-only";
    let finish: ((value: string) => void) | undefined;
    mocks.reset.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    );
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const logSpies = [
      vi.spyOn(console, "log").mockImplementation(() => {}),
      vi.spyOn(console, "info").mockImplementation(() => {}),
      vi.spyOn(console, "debug").mockImplementation(() => {}),
    ];
    render(<WorkerAccountActions worker={worker} />);
    fireEvent.click(screen.getByRole("button", { name: "Reset password" }));
    expect(mocks.reset).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm reset" }));
    expect(screen.getByRole("button", { name: "Resetting…" })).toBeDisabled();
    finish?.(temporaryPassword);
    const input = await screen.findByRole("textbox", { name: "Temporary password" });
    expect(input).toHaveValue(temporaryPassword);
    expect(screen.getByText(/Share it through a secure channel/)).toBeInTheDocument();
    expect(screen.getByText(/must change it at next login/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Copy password" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(temporaryPassword));
    for (const storage of [localStorage, sessionStorage]) {
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        expect(storage.getItem(key ?? "") ?? "").not.toContain(temporaryPassword);
      }
    }
    for (const spy of logSpies) {
      expect(spy.mock.calls.flat().join(" ")).not.toContain(temporaryPassword);
    }
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() =>
      expect(screen.queryByRole("textbox", { name: "Temporary password" })).not.toBeInTheDocument(),
    );
    expect(screen.queryByRole("button", { name: /show.*password/i })).not.toBeInTheDocument();
  });

  it("keeps the reset confirmation open and shows API errors without a success dialog", async () => {
    mocks.reset.mockRejectedValue(new Error("Reset denied by API"));
    render(<WorkerAccountActions worker={worker} />);
    fireEvent.click(screen.getByRole("button", { name: "Reset password" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm reset" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Reset denied by API");
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Temporary password" })).not.toBeInTheDocument();
  });

  it("renders no management actions for a worker-only account", () => {
    mocks.store.mockReturnValue({ ...mocks.store(), user: { ...owner, role: "worker" } });
    const { container } = render(<WorkerAccountActions worker={worker} />);
    expect(container).toBeEmptyDOMElement();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.reset).not.toHaveBeenCalled();
  });
});
