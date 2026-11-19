export type TaskStatus =
  | "assigned" | "accepted" | "travelling" | "reached_vendor" | "availability_confirmed"
  | "procurement" | "dispatched" | "delivered" | "completed"
  | "on_hold" | "issue" | "cancelled";

export type ProjectStatus = "planning" | "procurement" | "installation" | "completed" | "on_hold";

export interface ItemVariant { id: string; label: string }
export interface CatalogueItem { id: string; name: string; category: string; unit: string; variants: ItemVariant[] }
export interface Project {
  id: string; ref: string; name: string; customer: string; contact: string; phone: string;
  address: string; description: string; deploymentDate: string; status: ProjectStatus; createdAt: string;
}
export interface Worker { id: string; name: string; phone: string; area: string }
export interface Vendor { id: string; name: string; contact: string; phone: string; address: string; specialty: string }
export interface MaterialLine { itemId: string; variantId: string; qty: number; remarks?: string | undefined }
export interface TaskEvent { id: string; at: string; by: string; status?: TaskStatus | undefined; note?: string | undefined; photo?: string | undefined }
export interface Task {
  id: string; ref: string; projectId: string; workerId: string; vendorId?: string | undefined; vendorName?: string | undefined;
  materials: MaterialLine[]; instructions: string; deliverySite: string; dueDate: string;
  status: TaskStatus; createdAt: string; events: TaskEvent[];
}
export interface AppState {
  projects: Project[]; workers: Worker[]; vendors: Vendor[]; catalogue: CatalogueItem[]; tasks: Task[];
  currentWorkerId: string;
}
