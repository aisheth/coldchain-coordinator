export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}
export interface ApiUser {
  id: string;
  org_id: string;
  username: string;
  email: string | null;
  name: string;
  phone: string | null;
  role: "owner" | "admin" | "worker";
  is_active: boolean;
  must_change_password: boolean;
}
export interface ApiCustomer {
  id: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  is_active: boolean;
}
export interface ApiVendor {
  id: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  address: string | null;
  is_active: boolean;
}
export interface ApiProject {
  id: string;
  customer_id: string;
  name: string;
  site_address: string | null;
  contact_person: string | null;
  contact_phone: string | null;
  order_date: string | null;
  expected_deployment_date: string | null;
  status: string;
}
export interface ApiVariant {
  id: string;
  item_id: string;
  item_name: string;
  category_name: string | null;
  display_name: string;
  sku: string | null;
  description: string | null;
  size_option_id: string | null;
  size_label: string | null;
  uom_id: string;
  uom_code: string;
  uom_symbol: string;
  allows_decimal: boolean;
  attributes: Record<string, unknown>;
  is_active: boolean;
}
export interface ApiItem {
  id: string;
  name: string;
  category_id: string | null;
  category_name: string | null;
  description: string | null;
  is_active: boolean;
  variants: ApiVariant[];
}
export interface ApiCategory {
  id: string;
  name: string;
  is_active: boolean;
}
export interface ApiSizeOption {
  id: string;
  label: string;
  value: number | null;
  uom_id: string | null;
  is_active: boolean;
}
export interface ApiUom {
  id: string;
  code: string;
  name: string;
  symbol: string;
  allows_decimal: boolean;
}
export interface ApiAttachment {
  id: string;
  filename: string;
  mime: string;
  size: number;
}
export interface ApiHistory {
  id: string;
  from_status: string | null;
  to_status: string;
  changed_by: string;
  changed_by_name: string;
  changed_at: string;
  remarks: string | null;
  attachments: ApiAttachment[];
}
export interface ApiIssue {
  id: string;
  assignment_id: string;
  assignment_item_id: string | null;
  type: string;
  description: string;
  blocks_progress: boolean;
  status: string;
  raised_by: string;
  raised_by_name: string;
  raised_at: string;
  resolved_at: string | null;
  resolution: string | null;
  attachments: ApiAttachment[];
}
export interface ApiAssignmentItem {
  id: string;
  request_item_id: string;
  variant: ApiVariant;
  allocated_qty: number;
  fulfilment_status: string;
  qty_procured: number;
  qty_delivered: number;
  remarks: string | null;
  substitute_variant: ApiVariant | null;
}
export interface ApiDelivery {
  delivered_at: string;
  recipient_name: string | null;
  remarks: string | null;
  confirmed_at: string | null;
  attachments: ApiAttachment[];
}
export interface ApiAssignmentSummary {
  id: string;
  request_id: string;
  request_code: string;
  project_id: string;
  project_name: string;
  worker_id: string;
  worker_name: string;
  vendor_id: string;
  vendor_name: string;
  status: string;
  is_on_hold: boolean;
  is_overdue: boolean;
  due_date: string | null;
  assigned_at: string;
}
export interface ApiAssignment extends ApiAssignmentSummary {
  delivery_location: string | null;
  instructions: string | null;
  requires_approval: boolean;
  replaced_by_id: string | null;
  cancel_reason: string | null;
  items: ApiAssignmentItem[];
  history: ApiHistory[];
  issues: ApiIssue[];
  delivery: ApiDelivery | null;
  allowed_transitions: string[];
  can_cancel: boolean;
  can_reassign: boolean;
}
export interface ApiRequest {
  id: string;
  code: string;
  project_id: string;
  status: string;
  progress: string;
  notes: string | null;
  created_at: string;
  lines: unknown[];
}
export interface ApiOrgSettings {
  id?: string;
  name?: string;
  [key: string]: unknown;
}
