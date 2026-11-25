export type TaskStatus =
  | "assigned"
  | "accepted"
  | "travelling"
  | "reached_vendor"
  | "availability_confirmed"
  | "procurement"
  | "dispatched"
  | "delivered"
  | "completed"
  | "on_hold"
  | "issue"
  | "cancelled"
  | "unknown";

export type ProjectStatus = "active" | "on_hold" | "closed" | "unknown";

export interface ItemVariant {
  id: string;
  label: string;
}
export interface CatalogueItem {
  id: string;
  name: string;
  category: string;
  unit: string;
  variants: ItemVariant[];
}
export interface Customer {
  id: string;
  name: string;
  contact: string;
  phone: string;
  email: string;
  address: string;
}
export interface Project {
  id: string;
  customerId: string;
  ref: string;
  name: string;
  customer: string;
  contact: string;
  phone: string;
  address: string;
  description: string;
  deploymentDate: string;
  status: ProjectStatus;
  createdAt: string;
}
export interface Worker {
  id: string;
  username: string;
  name: string;
  phone: string;
  area: string;
  role: "owner" | "admin" | "worker";
}
export interface Vendor {
  id: string;
  name: string;
  contact: string;
  phone: string;
  address: string;
  specialty: string;
}
export interface MaterialLine {
  itemId: string;
  variantId: string;
  qty: number;
  remarks?: string | undefined;
}
export interface TaskEvent {
  id: string;
  at: string;
  by: string;
  status?: TaskStatus | undefined;
  note?: string | undefined;
  photoIds?: string[] | undefined;
}
export interface TaskIssue {
  id: string;
  description: string;
  status: string;
  raisedBy: string;
  raisedAt: string;
  resolution: string;
}
export interface Task {
  id: string;
  requestId: string;
  ref: string;
  projectId: string;
  projectName: string;
  workerId: string;
  workerName: string;
  vendorId?: string | undefined;
  vendorName?: string | undefined;
  materials: MaterialLine[];
  instructions: string;
  deliverySite: string;
  dueDate: string;
  status: TaskStatus;
  rawStatus: TaskStatus;
  allowedTransitions: string[];
  requiresApproval: boolean;
  isOverdue: boolean;
  createdAt: string;
  events: TaskEvent[];
  issues: TaskIssue[];
}
export interface AppState {
  projects: Project[];
  customers: Customer[];
  workers: Worker[];
  vendors: Vendor[];
  catalogue: CatalogueItem[];
  tasks: Task[];
  currentWorkerId: string;
}
