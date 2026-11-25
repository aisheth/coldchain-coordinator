import { describe, expect, it } from "vitest";
import { mapAssignment, projectStatus, taskStatus } from "./api-adapters";
import type { ApiAssignment } from "./api-types";

const assignment: ApiAssignment = {
  id: "a1",
  request_id: "r1",
  request_code: "PR-1001",
  project_id: "p1",
  project_name: "Cold room",
  worker_id: "w1",
  worker_name: "Ravi",
  vendor_id: "v1",
  vendor_name: "Vendor",
  status: "procurement",
  is_on_hold: false,
  is_overdue: false,
  due_date: "2026-11-30",
  assigned_at: "2026-11-25T06:00:00Z",
  delivery_location: "Site",
  instructions: null,
  requires_approval: false,
  replaced_by_id: null,
  cancel_reason: null,
  items: [],
  history: [],
  issues: [],
  delivery: null,
  allowed_transitions: ["dispatched"],
  can_cancel: true,
  can_reassign: true,
};

describe("API status mapping", () => {
  it("does not invent a label for an unknown backend status", () => {
    expect(taskStatus("waiting_for_customs")).toBe("unknown");
    expect(projectStatus("archived")).toBe("unknown");
  });

  it("shows a backend hold without losing the underlying progress status", () => {
    const task = mapAssignment({ ...assignment, is_on_hold: true });
    expect(task.status).toBe("on_hold");
    expect(task.rawStatus).toBe("procurement");
    expect(task.allowedTransitions).toEqual(["dispatched"]);
  });

  it("shows an unresolved issue and keeps its real issue ID for resolution", () => {
    const task = mapAssignment({
      ...assignment,
      issues: [
        {
          id: "issue-1",
          assignment_id: "a1",
          assignment_item_id: null,
          type: "other",
          description: "Out of stock",
          blocks_progress: true,
          status: "open",
          raised_by: "w1",
          raised_by_name: "Ravi",
          raised_at: "2026-11-25T06:10:00Z",
          resolved_at: null,
          resolution: null,
          attachments: [],
        },
      ],
    });
    expect(task.status).toBe("issue");
    expect(task.issues[0]).toMatchObject({
      id: "issue-1",
      description: "Out of stock",
      status: "open",
    });
    expect(task.events.at(-1)).toMatchObject({
      id: "issue-issue-1",
      status: "issue",
      note: "Out of stock",
    });
  });
});
