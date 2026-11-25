import type { ProjectStatus, TaskStatus } from "./types";

export const FLOW: TaskStatus[] = [
  "assigned",
  "accepted",
  "travelling",
  "reached_vendor",
  "availability_confirmed",
  "procurement",
  "dispatched",
  "delivered",
  "completed",
];
export const EXCEPTIONS: TaskStatus[] = ["on_hold", "issue", "cancelled"];

export const STATUS_LABEL: Record<TaskStatus, string> = {
  assigned: "Assigned",
  accepted: "Accepted",
  travelling: "Travelling to Vendor",
  reached_vendor: "Reached Vendor",
  availability_confirmed: "Material Availability Confirmed",
  procurement: "Procurement in Progress",
  dispatched: "Materials Dispatched",
  delivered: "Delivered to Site",
  completed: "Completed",
  on_hold: "On Hold",
  issue: "Issue Reported",
  cancelled: "Cancelled",
  unknown: "Status unavailable",
};

export type Tone = "neutral" | "info" | "warning" | "success" | "danger";
export function statusTone(s: TaskStatus): Tone {
  if (s === "completed" || s === "delivered") return "success";
  if (s === "issue" || s === "cancelled") return "danger";
  if (s === "assigned") return "info";
  if (s === "on_hold" || s === "unknown") return "neutral";
  return "warning";
}
export const PROJECT_LABEL: Record<ProjectStatus, string> = {
  active: "Active",
  on_hold: "On Hold",
  closed: "Closed",
  unknown: "Status unavailable",
};
export function projectTone(s: ProjectStatus): Tone {
  return s === "closed" ? "success" : s === "on_hold" || s === "unknown" ? "neutral" : "info";
}
export const isActiveTask = (s: TaskStatus) => !["completed", "cancelled"].includes(s);
export const isInProgress = (s: TaskStatus) => FLOW.indexOf(s) >= 1 && FLOW.indexOf(s) <= 7;
export function nextStatus(s: TaskStatus): TaskStatus | null {
  const i = FLOW.indexOf(s);
  return i >= 0 && i < FLOW.length - 1 ? (FLOW[i + 1] ?? null) : null;
}
export function progressPct(s: TaskStatus) {
  const i = FLOW.indexOf(s);
  return i < 0 ? 0 : Math.round((i / (FLOW.length - 1)) * 100);
}
