import type {
  ApiAssignment,
  ApiCustomer,
  ApiItem,
  ApiProject,
  ApiUser,
  ApiVariant,
  ApiVendor,
} from "./api-types";
import type {
  AppState,
  CatalogueItem,
  Project,
  ProjectStatus,
  Task,
  TaskStatus,
  Vendor,
  Worker,
} from "./types";

const TASK_STATUSES = new Set<TaskStatus>([
  "assigned",
  "accepted",
  "travelling",
  "reached_vendor",
  "availability_confirmed",
  "procurement",
  "dispatched",
  "delivered",
  "completed",
  "on_hold",
  "issue",
  "cancelled",
  "unknown",
]);

export function taskStatus(value: string): TaskStatus {
  return TASK_STATUSES.has(value as TaskStatus) ? (value as TaskStatus) : "unknown";
}

export function projectStatus(value: string): ProjectStatus {
  return value === "active" || value === "on_hold" || value === "closed" ? value : "unknown";
}

export function mapUser(user: ApiUser): Worker {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    phone: user.phone ?? "",
    area: "",
    role: user.role,
  };
}

export function mapVendor(vendor: ApiVendor): Vendor {
  return {
    id: vendor.id,
    name: vendor.name,
    contact: vendor.contact_person ?? "",
    phone: vendor.phone ?? "",
    address: vendor.address ?? "",
    specialty: "",
  };
}

export function mapProject(project: ApiProject, customers: ApiCustomer[]): Project {
  const customer = customers.find((c) => c.id === project.customer_id);
  return {
    id: project.id,
    customerId: project.customer_id,
    ref: `PRJ-${project.id.slice(0, 8).toUpperCase()}`,
    name: project.name,
    customer: customer?.name ?? "Customer unavailable",
    contact: project.contact_person ?? customer?.contact_person ?? "",
    phone: project.contact_phone ?? customer?.phone ?? "",
    address: project.site_address ?? "",
    description: "",
    deploymentDate: project.expected_deployment_date ?? "",
    status: projectStatus(project.status),
    createdAt: project.order_date ?? "",
  };
}

export function variantLabel(variant: ApiVariant) {
  return variant.size_label || variant.display_name || variant.sku || "Standard";
}

export function mapCatalogue(items: ApiItem[]): CatalogueItem[] {
  return items.map((item) => ({
    id: item.id,
    name: item.name,
    category: item.category_name ?? "Uncategorised",
    unit: item.variants[0]?.uom_symbol || item.variants[0]?.uom_code || "unit",
    variants: item.variants
      .filter((v) => v.is_active)
      .map((v) => ({ id: v.id, label: variantLabel(v) })),
  }));
}

export function mergeAssignmentVariants(
  catalogue: CatalogueItem[],
  assignments: ApiAssignment[],
): CatalogueItem[] {
  const result = catalogue.map((item) => ({ ...item, variants: [...item.variants] }));
  for (const assignment of assignments) {
    for (const line of assignment.items) {
      const variant = line.substitute_variant ?? line.variant;
      let item = result.find((entry) => entry.id === variant.item_id);
      if (!item) {
        item = {
          id: variant.item_id,
          name: variant.item_name,
          category: variant.category_name ?? "Uncategorised",
          unit: variant.uom_symbol || variant.uom_code,
          variants: [],
        };
        result.push(item);
      }
      if (!item.variants.some((entry) => entry.id === variant.id))
        item.variants.push({ id: variant.id, label: variantLabel(variant) });
    }
  }
  return result;
}

export function mapAssignment(assignment: ApiAssignment): Task {
  const openIssues = assignment.issues.filter(
    (issue) => issue.status !== "resolved" && issue.status !== "closed",
  );
  const rawStatus = taskStatus(assignment.status);
  const status = assignment.is_on_hold ? "on_hold" : openIssues.length ? "issue" : rawStatus;
  const historyEvents = assignment.history.map((event) => ({
    id: event.id,
    at: event.changed_at,
    by: event.changed_by_name,
    status: taskStatus(event.to_status),
    note: event.remarks ?? undefined,
    photoIds: event.attachments.map((a) => a.id),
  }));
  const issueEvents = assignment.issues.map((issue) => ({
    id: `issue-${issue.id}`,
    at: issue.raised_at,
    by: issue.raised_by_name,
    status: "issue" as const,
    note: issue.description,
    photoIds: issue.attachments.map((a) => a.id),
  }));
  return {
    id: assignment.id,
    requestId: assignment.request_id,
    ref: assignment.request_code,
    projectId: assignment.project_id,
    projectName: assignment.project_name,
    workerId: assignment.worker_id,
    workerName: assignment.worker_name,
    vendorId: assignment.vendor_id,
    vendorName: assignment.vendor_name,
    materials: assignment.items.map((line) => {
      const variant = line.substitute_variant ?? line.variant;
      return {
        itemId: variant.item_id,
        variantId: variant.id,
        qty: line.allocated_qty,
        remarks: line.remarks ?? undefined,
      };
    }),
    instructions: assignment.instructions ?? "",
    deliverySite: assignment.delivery_location ?? "",
    dueDate: assignment.due_date ?? "",
    status,
    rawStatus,
    allowedTransitions: assignment.allowed_transitions,
    requiresApproval: assignment.requires_approval,
    isOverdue: assignment.is_overdue,
    createdAt: assignment.assigned_at,
    events: [...historyEvents, ...issueEvents].sort((a, b) => a.at.localeCompare(b.at)),
    issues: assignment.issues.map((issue) => ({
      id: issue.id,
      description: issue.description,
      status: issue.status,
      raisedBy: issue.raised_by_name,
      raisedAt: issue.raised_at,
      resolution: issue.resolution ?? "",
    })),
  };
}

export function workerState(
  user: ApiUser,
  assignments: ApiAssignment[],
  vendors: ApiVendor[],
): Pick<AppState, "projects" | "workers" | "vendors" | "catalogue" | "tasks" | "currentWorkerId"> {
  const tasks = assignments.map(mapAssignment);
  const projects: Project[] = [...new Map(assignments.map((a) => [a.project_id, a])).values()].map(
    (a) => ({
      id: a.project_id,
      customerId: "",
      ref: `PRJ-${a.project_id.slice(0, 8).toUpperCase()}`,
      name: a.project_name,
      customer: "",
      contact: "",
      phone: "",
      address: a.delivery_location ?? "",
      description: "",
      deploymentDate: a.due_date ?? "",
      status: "active",
      createdAt: a.assigned_at,
    }),
  );
  const knownVendors = vendors.map(mapVendor);
  for (const assignment of assignments) {
    if (!knownVendors.some((v) => v.id === assignment.vendor_id))
      knownVendors.push({
        id: assignment.vendor_id,
        name: assignment.vendor_name,
        contact: "",
        phone: "",
        address: "",
        specialty: "",
      });
  }
  return {
    projects,
    workers: [mapUser(user)],
    vendors: knownVendors,
    catalogue: mergeAssignmentVariants([], assignments),
    tasks,
    currentWorkerId: user.id,
  };
}
