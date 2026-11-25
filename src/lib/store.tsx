import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  apiRequest,
  changePasswordRequest,
  clearSession,
  errorMessage,
  hasSession,
  loginRequest,
  logoutRequest,
  uploadAttachment,
} from "./api";
import {
  mapAssignment,
  mapCatalogue,
  mapProject,
  mapUser,
  mapVendor,
  mergeAssignmentVariants,
  variantLabel,
  workerState,
} from "./api-adapters";
import type {
  ApiAssignment,
  ApiAssignmentSummary,
  ApiCategory,
  ApiCustomer,
  ApiItem,
  ApiProject,
  ApiRequest,
  ApiSizeOption,
  ApiUom,
  ApiUser,
  ApiVariant,
  ApiVendor,
  Page,
} from "./api-types";
import { normalize, type ImportContext, type ImportKind, type ImportRow } from "./master-import";
import type { CatalogueItemDraft, CatalogueVariantDraft, UomDraft } from "./catalogue";
import type { AppState, CatalogueItem, MaterialLine, Project, Task, Vendor, Worker } from "./types";

export type AuthStatus = "loading" | "unauthenticated" | "authenticated";
export type ProjectDraft = Omit<Project, "id" | "createdAt" | "ref" | "customerId" | "description">;
export interface WorkerDraft {
  name: string;
  username: string;
  password: string;
  phone: string;
}
export interface WorkerUpdate {
  name: string;
  email: string;
  phone: string;
  isActive: boolean;
}
export interface OrgSettings {
  organization_name: string;
  require_owner_approval: boolean;
  require_delivery_photo: boolean;
}
export interface CatalogueOptions {
  categories: ApiCategory[];
  sizeOptions: ApiSizeOption[];
  uoms: ApiUom[];
}

interface Store {
  state: AppState;
  user: ApiUser | null;
  authStatus: AuthStatus;
  dataLoading: boolean;
  error: string | null;
  orgSettings: OrgSettings | null;
  catalogueOptions: CatalogueOptions;
  catalogueOptionsLoading: boolean;
  catalogueOptionsError: string | null;
  loadCatalogueOptions: () => Promise<void>;
  addCatalogueItem: (draft: CatalogueItemDraft) => Promise<CatalogueItem>;
  addCatalogueVariant: (itemId: string, draft: CatalogueVariantDraft) => Promise<void>;
  addCatalogueCategory: (name: string) => Promise<ApiCategory>;
  addCatalogueSizeOption: (label: string) => Promise<ApiSizeOption>;
  addCatalogueUom: (draft: UomDraft) => Promise<ApiUom>;
  loadImportContext: () => Promise<ImportContext>;
  importMasterRow: (
    kind: ImportKind,
    row: ImportRow,
    context: ImportContext,
    temporaryPassword: string,
  ) => Promise<void>;
  login: (identifier: string, password: string) => Promise<ApiUser>;
  logout: () => Promise<void>;
  refresh: (background?: boolean) => Promise<void>;
  addProject: (p: ProjectDraft) => Promise<Project>;
  updateProject: (id: string, patch: Partial<ProjectDraft>) => Promise<void>;
  createTask: (t: {
    projectId: string;
    workerId: string;
    vendorId: string;
    materials: MaterialLine[];
    instructions: string;
    deliverySite: string;
    dueDate: string;
    onRequestCreated?: (request: { id: string; code: string }) => void;
  }) => Promise<Task>;
  addWorker: (w: WorkerDraft) => Promise<void>;
  updateWorker: (id: string, patch: WorkerUpdate) => Promise<void>;
  resetWorkerPassword: (id: string) => Promise<string>;
  addVendor: (v: Omit<Vendor, "id" | "specialty">) => Promise<Vendor>;
  transitionTask: (id: string, status: string, note?: string, photo?: File) => Promise<void>;
  holdTask: (id: string, reason: string) => Promise<void>;
  reportIssue: (id: string, description: string, photo?: File) => Promise<void>;
  recordDelivery: (id: string, recipient: string, remarks: string, photo?: File) => Promise<void>;
  resolveIssue: (taskId: string, issueId: string, resolution: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  updateOrgSettings: (patch: Partial<OrgSettings>) => Promise<void>;
}

const Ctx = createContext<Store | null>(null);
const emptyState: AppState = {
  projects: [],
  customers: [],
  workers: [],
  vendors: [],
  catalogue: [],
  tasks: [],
  currentWorkerId: "",
};

async function listAll<T>(
  path: string,
  params: Record<string, string | boolean> = {},
): Promise<T[]> {
  const all: T[] = [];
  let offset = 0;
  let total = 0;
  do {
    const query = new URLSearchParams({
      ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
      limit: "200",
      offset: String(offset),
    });
    const page = await apiRequest<Page<T>>(`${path}?${query.toString()}`);
    all.push(...page.items);
    total = page.total;
    offset += page.items.length;
    if (page.items.length === 0) break;
  } while (offset < total);
  return all;
}

async function assignmentDetails(summaries: ApiAssignmentSummary[]) {
  return Promise.all(
    summaries.map((summary) =>
      apiRequest<ApiAssignment>(`/assignments/${encodeURIComponent(summary.id)}`),
    ),
  );
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(emptyState);
  const [user, setUser] = useState<ApiUser | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus>("loading");
  const [dataLoading, setDataLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orgSettings, setOrgSettings] = useState<OrgSettings | null>(null);
  const [catalogueOptions, setCatalogueOptions] = useState<CatalogueOptions>({
    categories: [],
    sizeOptions: [],
    uoms: [],
  });
  const [catalogueOptionsLoading, setCatalogueOptionsLoading] = useState(false);
  const [catalogueOptionsError, setCatalogueOptionsError] = useState<string | null>(null);

  const loadData = useCallback(async (account: ApiUser, background = false) => {
    if (!background) {
      setDataLoading(true);
      setError(null);
    }
    try {
      if (account.role === "worker") {
        const [summaries, vendors] = await Promise.all([
          listAll<ApiAssignmentSummary>("/me/assignments", { active: false }),
          listAll<ApiVendor>("/vendors").catch((err: unknown) => {
            if (err && typeof err === "object" && "status" in err && err.status === 403) return [];
            throw err;
          }),
        ]);
        const assignments = await assignmentDetails(
          summaries.filter((row) => row.worker_id === account.id),
        );
        setState((current) => ({
          ...current,
          ...workerState(account, assignments, vendors),
          customers: [],
        }));
      } else {
        const [summaries, users, vendorRows, projectRows, customers, items, settings] =
          await Promise.all([
            listAll<ApiAssignmentSummary>("/assignments"),
            listAll<ApiUser>("/users", { role: "worker" }),
            listAll<ApiVendor>("/vendors"),
            listAll<ApiProject>("/projects"),
            listAll<ApiCustomer>("/customers"),
            listAll<ApiItem>("/items"),
            apiRequest<OrgSettings>("/organization/settings"),
          ]);
        const assignments = await assignmentDetails(summaries);
        const catalogue = mergeAssignmentVariants(mapCatalogue(items), assignments);
        setState({
          projects: projectRows.map((p) => mapProject(p, customers)),
          customers: customers.map((c) => ({
            id: c.id,
            name: c.name,
            contact: c.contact_person ?? "",
            phone: c.phone ?? "",
            email: c.email ?? "",
            address: c.address ?? "",
          })),
          workers: users.map(mapUser),
          vendors: vendorRows.map(mapVendor),
          catalogue,
          tasks: assignments.map(mapAssignment),
          currentWorkerId: account.id,
        });
        setOrgSettings(settings);
      }
    } catch (err) {
      if (background) throw err;
      setError(errorMessage(err));
    } finally {
      if (!background) setDataLoading(false);
    }
  }, []);

  const loadCatalogueOptions = useCallback(async () => {
    setCatalogueOptionsLoading(true);
    setCatalogueOptionsError(null);
    try {
      const [categories, sizeOptions, uoms] = await Promise.all([
        apiRequest<ApiCategory[]>("/item-categories"),
        apiRequest<ApiSizeOption[]>("/size-options?active=true"),
        apiRequest<ApiUom[]>("/uom"),
      ]);
      setCatalogueOptions({
        categories: categories.filter((category) => category.is_active),
        sizeOptions: sizeOptions.filter((size) => size.is_active),
        uoms,
      });
    } catch (err) {
      setCatalogueOptionsError(errorMessage(err));
    } finally {
      setCatalogueOptionsLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    async function restore() {
      if (!hasSession()) {
        if (active) setAuthStatus("unauthenticated");
        return;
      }
      try {
        const me = await apiRequest<ApiUser>("/auth/me");
        if (!active) return;
        setUser(me);
        setAuthStatus("authenticated");
        if (!me.must_change_password) await loadData(me);
      } catch {
        if (!active) return;
        clearSession();
        setUser(null);
        setAuthStatus("unauthenticated");
      }
    }
    void restore();
    const expired = () => {
      setUser(null);
      setState(emptyState);
      setOrgSettings(null);
      setCatalogueOptions({ categories: [], sizeOptions: [], uoms: [] });
      setCatalogueOptionsError(null);
      setAuthStatus("unauthenticated");
    };
    window.addEventListener("coldtrack:auth-expired", expired);
    return () => {
      active = false;
      window.removeEventListener("coldtrack:auth-expired", expired);
    };
  }, [loadData]);

  const refresh = useCallback(
    async (background = false) => {
      if (user) await loadData(user, background);
    },
    [user, loadData],
  );
  const replaceTask = useCallback(
    (task: Task) =>
      setState((current) => ({
        ...current,
        tasks: current.tasks.some((t) => t.id === task.id)
          ? current.tasks.map((t) => (t.id === task.id ? task : t))
          : [task, ...current.tasks],
      })),
    [],
  );
  const reloadTask = useCallback(
    async (id: string) =>
      replaceTask(
        mapAssignment(await apiRequest<ApiAssignment>(`/assignments/${encodeURIComponent(id)}`)),
      ),
    [replaceTask],
  );
  const withOptionalPhoto = useCallback(
    async (photo: File | undefined) => (photo ? (await uploadAttachment(photo)).id : undefined),
    [],
  );

  const value = useMemo<Store>(
    () => ({
      state,
      user,
      authStatus,
      dataLoading,
      error,
      orgSettings,
      catalogueOptions,
      catalogueOptionsLoading,
      catalogueOptionsError,
      loadCatalogueOptions,
      loadImportContext: async () => {
        if (!user || user.role === "worker")
          throw new Error("Master data requires an owner/admin account.");
        const [items, vendors, customers, users, categories, sizes, uoms] = await Promise.all([
          listAll<ApiItem>("/items"),
          listAll<ApiVendor>("/vendors"),
          listAll<ApiCustomer>("/customers"),
          user.role === "owner" ? listAll<ApiUser>("/users") : Promise.resolve([]),
          apiRequest<ApiCategory[]>("/item-categories"),
          apiRequest<ApiSizeOption[]>("/size-options"),
          apiRequest<ApiUom[]>("/uom"),
        ]);
        return { items, vendors, customers, users, categories, sizes, uoms };
      },
      importMasterRow: async (kind, row, context, temporaryPassword) => {
        if (!user || user.role === "worker" || (kind === "workers" && user.role !== "owner"))
          throw new Error("Your role cannot import these records.");
        if (row.errors.length || row.status !== "ready")
          throw new Error("Review and validate this row before saving.");
        const v = (key: string) => row.values[key] ?? "";
        const find = <T,>(entries: T[], label: (entry: T) => string, value: string) =>
          entries.find((entry) => normalize(label(entry)) === normalize(value));
        let path: string;
        let body: object;
        switch (kind) {
          case "items": {
            const category = find(context.categories, (x) => x.name, v("category"));
            if (v("category") && !category) throw new Error("Category no longer available.");
            path = "/items";
            body = {
              name: v("name"),
              category_id: category?.id ?? null,
              description: v("description") || null,
            };
            break;
          }
          case "variants": {
            const item = find(context.items, (x) => x.name, v("item"));
            const size = find(context.sizes, (x) => x.label, v("size"));
            const uom = find(context.uoms, (x) => x.code, v("uom"));
            if (!item || !uom || (v("size") && !size))
              throw new Error("Item, size or unit no longer available.");
            path = `/items/${encodeURIComponent(item.id)}/variants`;
            body = {
              size_option_id: size?.id ?? null,
              uom_id: uom.id,
              sku: v("sku") || null,
              description: v("description") || null,
              attributes: {},
            };
            break;
          }
          case "vendors":
          case "customers":
            path = kind === "vendors" ? "/vendors" : "/customers";
            body = {
              name: v("name"),
              contact_person: v("contact_person") || null,
              phone: v("phone") || null,
              address: v("address") || null,
              ...(kind === "customers" ? { email: v("email") || null } : {}),
            };
            break;
          case "workers":
            if (temporaryPassword.length < 8 || temporaryPassword.length > 128)
              throw new Error("Temporary password must contain 8–128 characters.");
            path = "/users";
            body = {
              username: v("username"),
              name: v("name"),
              role: "worker",
              password: temporaryPassword,
              phone: v("phone") || null,
              email: v("email") || null,
            };
            break;
          case "categories":
            path = "/item-categories";
            body = { name: v("name") };
            break;
          case "sizes":
            path = "/size-options";
            body = { label: v("label") };
            break;
          case "uoms":
            path = "/uom";
            body = {
              code: v("code"),
              name: v("name"),
              symbol: v("symbol"),
              allows_decimal: v("allows_decimal") === "true",
            };
            break;
        }
        await apiRequest(path, { method: "POST", body });
      },
      login: async (identifier, password) => {
        await loginRequest(identifier, password);
        const me = await apiRequest<ApiUser>("/auth/me");
        setUser(me);
        setAuthStatus("authenticated");
        if (!me.must_change_password) await loadData(me);
        return me;
      },
      logout: async () => {
        try {
          await logoutRequest();
        } finally {
          clearSession();
          setUser(null);
          setState(emptyState);
          setOrgSettings(null);
          setCatalogueOptions({ categories: [], sizeOptions: [], uoms: [] });
          setCatalogueOptionsError(null);
          setError(null);
          setAuthStatus("unauthenticated");
        }
      },
      refresh,
      addProject: async (draft) => {
        let customer = state.customers.find(
          (c) => c.name.toLowerCase() === draft.customer.trim().toLowerCase(),
        );
        if (!customer) {
          const created = await apiRequest<ApiCustomer>("/customers", {
            method: "POST",
            body: {
              name: draft.customer.trim(),
              contact_person: draft.contact || null,
              phone: draft.phone || null,
              address: draft.address || null,
            },
          });
          customer = {
            id: created.id,
            name: created.name,
            contact: created.contact_person ?? "",
            phone: created.phone ?? "",
            email: created.email ?? "",
            address: created.address ?? "",
          };
        }
        const created = await apiRequest<ApiProject>("/projects", {
          method: "POST",
          body: {
            customer_id: customer.id,
            name: draft.name,
            site_address: draft.address || null,
            contact_person: draft.contact || null,
            contact_phone: draft.phone || null,
            expected_deployment_date: draft.deploymentDate || null,
            order_date: new Date().toISOString().slice(0, 10),
          },
        });
        const project = mapProject(created, [
          {
            id: customer.id,
            name: customer.name,
            contact_person: customer.contact,
            phone: customer.phone,
            email: customer.email,
            address: customer.address,
            is_active: true,
          },
        ]);
        setState((current) => ({
          ...current,
          projects: [project, ...current.projects],
          customers: current.customers.some((c) => c.id === customer.id)
            ? current.customers
            : [...current.customers, customer],
        }));
        return project;
      },
      updateProject: async (id, patch) => {
        const updated = await apiRequest<ApiProject>(`/projects/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: {
            ...(patch.name !== undefined ? { name: patch.name } : {}),
            ...(patch.address !== undefined ? { site_address: patch.address || null } : {}),
            ...(patch.contact !== undefined ? { contact_person: patch.contact || null } : {}),
            ...(patch.phone !== undefined ? { contact_phone: patch.phone || null } : {}),
            ...(patch.deploymentDate !== undefined
              ? { expected_deployment_date: patch.deploymentDate || null }
              : {}),
            ...(patch.status !== undefined ? { status: patch.status } : {}),
          },
        });
        setState((current) => ({
          ...current,
          projects: current.projects.map((p) =>
            p.id === id
              ? mapProject(
                  updated,
                  current.customers.map((c) => ({
                    id: c.id,
                    name: c.name,
                    contact_person: c.contact,
                    phone: c.phone,
                    email: c.email,
                    address: c.address,
                    is_active: true,
                  })),
                )
              : p,
          ),
        }));
      },
      createTask: async (draft) => {
        const request = await apiRequest<ApiRequest>("/requests", {
          method: "POST",
          body: { project_id: draft.projectId, notes: draft.instructions || null },
        });
        draft.onRequestCreated?.({ id: request.id, code: request.code });
        try {
          await apiRequest<ApiRequest>(`/requests/${encodeURIComponent(request.id)}/items:bulk`, {
            method: "POST",
            body: {
              lines: draft.materials.map((line) => ({
                variant_id: line.variantId,
                required_qty: line.qty,
                remarks: line.remarks || null,
              })),
            },
          });
          await apiRequest<ApiRequest>(`/requests/${encodeURIComponent(request.id)}/finalize`, {
            method: "POST",
          });
          const assignment = await apiRequest<ApiAssignment>(
            `/requests/${encodeURIComponent(request.id)}/assignments`,
            {
              method: "POST",
              body: {
                worker_id: draft.workerId,
                vendor_id: draft.vendorId,
                delivery_location: draft.deliverySite || null,
                instructions: draft.instructions || null,
                due_date: draft.dueDate || null,
              },
            },
          );
          const task = mapAssignment(assignment);
          replaceTask(task);
          return task;
        } catch (err) {
          throw new Error(
            `${request.code} was created, but setup did not finish. ${errorMessage(err)}`,
          );
        }
      },
      addWorker: async (draft) => {
        const created = await apiRequest<ApiUser>("/users", {
          method: "POST",
          body: {
            username: draft.username,
            name: draft.name,
            role: "worker",
            password: draft.password,
            phone: draft.phone || null,
          },
        });
        setState((current) => ({ ...current, workers: [...current.workers, mapUser(created)] }));
      },
      updateWorker: async (id, patch) => {
        const target = state.workers.find((worker) => worker.id === id && worker.role === "worker");
        if (!user || user.role === "worker" || !target)
          throw new Error("Your role cannot manage this worker account.");
        const updated = await apiRequest<ApiUser>(`/users/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: {
            name: patch.name.trim(),
            email: patch.email.trim() || null,
            phone: patch.phone.trim() || null,
            is_active: patch.isActive,
          },
        });
        setState((current) => ({
          ...current,
          workers: current.workers.map((worker) => (worker.id === id ? mapUser(updated) : worker)),
        }));
      },
      resetWorkerPassword: async (id) => {
        const target = state.workers.find((worker) => worker.id === id && worker.role === "worker");
        if (!user || user.role === "worker" || !target)
          throw new Error("Your role cannot reset this worker's password.");
        const result = await apiRequest<{ temporary_password: string }>(
          `/users/${encodeURIComponent(id)}/reset-password`,
          { method: "POST" },
        );
        if (!result.temporary_password)
          throw new Error("The API confirmed the request but returned no temporary password.");
        return result.temporary_password;
      },
      addVendor: async (draft) => {
        const created = await apiRequest<ApiVendor>("/vendors", {
          method: "POST",
          body: {
            name: draft.name,
            contact_person: draft.contact || null,
            phone: draft.phone || null,
            address: draft.address || null,
          },
        });
        const vendor = mapVendor(created);
        setState((current) => ({ ...current, vendors: [...current.vendors, vendor] }));
        return vendor;
      },
      addCatalogueItem: async (draft) => {
        const created = await apiRequest<ApiItem>("/items", {
          method: "POST",
          body: {
            name: draft.name.trim(),
            category_id: draft.categoryId || null,
            description: draft.description.trim() || null,
          },
        });
        const item = mapCatalogue([created])[0];
        if (!item) throw new Error("The API returned an invalid catalogue item.");
        setState((current) => ({
          ...current,
          catalogue: current.catalogue.some((entry) => entry.id === item.id)
            ? current.catalogue.map((entry) => (entry.id === item.id ? item : entry))
            : [...current.catalogue, item],
        }));
        return item;
      },
      addCatalogueVariant: async (itemId, draft) => {
        const created = await apiRequest<ApiVariant>(
          `/items/${encodeURIComponent(itemId)}/variants`,
          {
            method: "POST",
            body: {
              size_option_id: draft.sizeOptionId || null,
              uom_id: draft.uomId,
              sku: draft.sku.trim() || null,
              description: draft.description.trim() || null,
              attributes: {},
            },
          },
        );
        setState((current) => ({
          ...current,
          catalogue: current.catalogue.map((item) =>
            item.id === itemId
              ? {
                  ...item,
                  unit: item.variants.length ? item.unit : created.uom_symbol || created.uom_code,
                  variants: item.variants.some((variant) => variant.id === created.id)
                    ? item.variants
                    : [...item.variants, { id: created.id, label: variantLabel(created) }],
                }
              : item,
          ),
        }));
      },
      addCatalogueCategory: async (name) => {
        const created = await apiRequest<ApiCategory>("/item-categories", {
          method: "POST",
          body: { name: name.trim() },
        });
        setCatalogueOptions((current) => ({
          ...current,
          categories: current.categories.some((category) => category.id === created.id)
            ? current.categories
            : [...current.categories, created],
        }));
        return created;
      },
      addCatalogueSizeOption: async (label) => {
        const created = await apiRequest<ApiSizeOption>("/size-options", {
          method: "POST",
          body: { label: label.trim() },
        });
        setCatalogueOptions((current) => ({
          ...current,
          sizeOptions: current.sizeOptions.some((size) => size.id === created.id)
            ? current.sizeOptions
            : [...current.sizeOptions, created],
        }));
        return created;
      },
      addCatalogueUom: async (draft) => {
        const created = await apiRequest<ApiUom>("/uom", {
          method: "POST",
          body: {
            code: draft.code.trim(),
            name: draft.name.trim(),
            symbol: draft.symbol.trim(),
            allows_decimal: draft.allowsDecimal,
          },
        });
        setCatalogueOptions((current) => ({
          ...current,
          uoms: current.uoms.some((uom) => uom.id === created.id)
            ? current.uoms
            : [...current.uoms, created],
        }));
        return created;
      },
      transitionTask: async (id, status, note, photo) => {
        const task = state.tasks.find((entry) => entry.id === id);
        if (
          !task ||
          !user ||
          (user.role === "worker" && task.workerId !== user.id) ||
          !task.allowedTransitions.includes(status)
        )
          throw new Error("This status update is not allowed for your task.");
        const attachmentId = await withOptionalPhoto(photo);
        try {
          if (status === "completed" && user.role !== "worker") {
            const result = await apiRequest<{ assignment: ApiAssignment }>(
              `/assignments/${encodeURIComponent(id)}/confirm-completion`,
              { method: "POST", body: {} },
            );
            replaceTask(mapAssignment(result.assignment));
          } else {
            const updated = await apiRequest<ApiAssignment>(
              `/assignments/${encodeURIComponent(id)}/transitions`,
              {
                method: "POST",
                body: {
                  to_status: status,
                  remarks: note || null,
                  attachment_ids: attachmentId ? [attachmentId] : [],
                },
              },
            );
            replaceTask(mapAssignment(updated));
          }
        } catch (err) {
          throw new Error(
            `${attachmentId ? "The photo uploaded, but the task update failed. " : ""}${errorMessage(err)}`,
          );
        }
      },
      holdTask: async (id, reason) => {
        const updated = await apiRequest<ApiAssignment>(
          `/assignments/${encodeURIComponent(id)}/hold`,
          { method: "POST", body: { reason } },
        );
        replaceTask(mapAssignment(updated));
      },
      reportIssue: async (id, description, photo) => {
        const attachmentId = await withOptionalPhoto(photo);
        try {
          await apiRequest(`/assignments/${encodeURIComponent(id)}/issues`, {
            method: "POST",
            body: {
              type: "other",
              description,
              blocks_progress: true,
              attachment_ids: attachmentId ? [attachmentId] : [],
            },
          });
          await reloadTask(id);
        } catch (err) {
          throw new Error(
            `${attachmentId ? "The photo uploaded, but the issue report failed. " : ""}${errorMessage(err)}`,
          );
        }
      },
      recordDelivery: async (id, recipient, remarks, photo) => {
        const attachmentId = await withOptionalPhoto(photo);
        try {
          const updated = await apiRequest<ApiAssignment>(
            `/assignments/${encodeURIComponent(id)}/delivery`,
            {
              method: "POST",
              body: {
                delivered_at: new Date().toISOString(),
                recipient_name: recipient || null,
                remarks: remarks || null,
                attachment_ids: attachmentId ? [attachmentId] : [],
                items: [],
              },
            },
          );
          replaceTask(mapAssignment(updated));
        } catch (err) {
          throw new Error(
            `${attachmentId ? "The photo uploaded, but delivery was not recorded. " : ""}${errorMessage(err)}`,
          );
        }
      },
      resolveIssue: async (taskId, issueId, resolution) => {
        await apiRequest(`/issues/${encodeURIComponent(issueId)}/resolve`, {
          method: "POST",
          body: { resolution },
        });
        await reloadTask(taskId);
      },
      changePassword: async (current_password, new_password) => {
        await changePasswordRequest(current_password, new_password);
        if (user) setUser({ ...user, must_change_password: false });
      },
      updateOrgSettings: async (patch) => {
        const updated = await apiRequest<OrgSettings>("/organization/settings", {
          method: "PATCH",
          body: {
            require_owner_approval: patch.require_owner_approval ?? null,
            require_delivery_photo: patch.require_delivery_photo ?? null,
          },
        });
        setOrgSettings(updated);
      },
    }),
    [
      state,
      user,
      authStatus,
      dataLoading,
      error,
      orgSettings,
      catalogueOptions,
      catalogueOptionsLoading,
      catalogueOptionsError,
      loadCatalogueOptions,
      loadData,
      refresh,
      replaceTask,
      reloadTask,
      withOptionalPhoto,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const store = useContext(Ctx);
  if (!store) throw new Error("useStore outside provider");
  return store;
}

export function fmtDate(iso: string) {
  if (!iso) return "Not set";
  const date = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return Number.isNaN(date.getTime())
    ? "Not set"
    : date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
export function fmtDateTime(iso: string) {
  if (!iso) return "Not set";
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? "Not set"
    : date.toLocaleString("en-IN", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
}
export function timeAgo(iso: string) {
  if (!iso) return "—";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (!Number.isFinite(m)) return "—";
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
