import { useDraft, draftField } from "@/lib/drafts";
import { DraftNotice } from "@/components/app/DraftNotice";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, LoaderCircle, Lock } from "lucide-react";
import { Card, Field, PageHeader, selectCls } from "@/components/app/ui";
import { MaterialPicker } from "@/components/app/MaterialPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useStore } from "@/lib/store";
import { errorMessage } from "@/lib/api";
import type { MaterialLine } from "@/lib/types";
import { meta } from "@/lib/seo";

export const Route = createFileRoute("/procurement/new")({
  validateSearch: (s: Record<string, unknown>): { project?: string } =>
    typeof s["project"] === "string" ? { project: s["project"] } : {},
  head: () =>
    meta("New procurement task", "Build a live material request and assign it to a worker."),
  component: NewTask,
});

function NewTask() {
  const { project: initialProject } = Route.useSearch();
  const { state, user, createTask, addVendor } = useStore();
  const nav = useNavigate();
  const draft = useDraft(user, `procurement:new:${initialProject ?? "all"}`, {
    projectId: initialProject ?? "",
    list: [] as MaterialLine[],
    finalized: false,
    workerId: "",
    vendorId: "",
    newVendor: { name: "", phone: "", address: "", contact: "" },
    instructions: "",
    site: state.projects.find((p) => p.id === initialProject)?.address ?? "",
    due: "",
    createdRequest: null as { id: string; code: string } | null,
    picker: {
      category: "",
      q: "",
      itemId: "",
      variantId: "",
      qty: "1",
      remarks: "",
      editing: null as string | null,
    },
  });
  const [projectId, setProjectId] = draftField(draft, "projectId");
  const [list, setList] = draftField(draft, "list");
  const [finalized, setFinalized] = draftField(draft, "finalized");
  const [workerId, setWorkerId] = draftField(draft, "workerId");
  const [vendorId, setVendorId] = draftField(draft, "vendorId");
  const [newVendor, setNewVendor] = draftField(draft, "newVendor");
  const [instructions, setInstructions] = draftField(draft, "instructions");
  const [site, setSite] = draftField(draft, "site");
  const [due, setDue] = draftField(draft, "due");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const canAssign = Boolean(
    !draft.data.createdRequest &&
    finalized &&
    projectId &&
    workerId &&
    site &&
    due &&
    vendorId &&
    (vendorId !== "new" || newVendor.name),
  );
  async function submit() {
    setBusy(true);
    setError("");
    try {
      let vId = vendorId;
      if (vendorId === "new") {
        vId = (await addVendor(newVendor)).id;
        setVendorId(vId);
      }
      const task = await createTask({
        projectId,
        workerId,
        vendorId: vId,
        materials: list,
        instructions,
        deliverySite: site,
        dueDate: due,
        onRequestCreated: (request) =>
          draft.setData((data) => ({ ...data, createdRequest: request })),
      });
      toast.success(
        `${task.ref} assigned to ${state.workers.find((w) => w.id === workerId)?.name ?? task.workerName}`,
      );
      draft.clear();
      await nav({ to: "/tasks/$id", params: { id: task.id } });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="New procurement task"
        subtitle="1. Choose project · 2. Build material list · 3. Assign worker"
      />
      <DraftNotice draft={draft} />
      {draft.data.createdRequest && (
        <p role="alert" className="mb-4 rounded-md bg-warning-soft p-3 text-sm text-warning">
          Request {draft.data.createdRequest.code} already exists, but this form has not confirmed a
          complete assignment. Your draft is retained; another submission is blocked to avoid
          duplicating the request. Check the saved request with the owner before starting over.
          Discarding this local draft does not delete the saved request.
        </p>
      )}
      <fieldset disabled={draft.pending || busy} className="space-y-6">
        <Card className="p-5">
          <h2 className="mb-4 font-semibold">1. Project</h2>
          <Field label="Project" className="max-w-md">
            <select
              className={selectCls}
              value={projectId}
              onChange={(e) => {
                setProjectId(e.target.value);
                setSite(state.projects.find((p) => p.id === e.target.value)?.address ?? "");
              }}
            >
              <option value="">Select project</option>
              {state.projects
                .filter((p) => p.status !== "closed")
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.ref} — {p.name} ({p.customer})
                  </option>
                ))}
            </select>
          </Field>
        </Card>

        <Card className="p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">
              2. Material list{" "}
              <span className="ml-1 text-sm font-normal text-muted-foreground">
                ({list.length} items)
              </span>
            </h2>
            {finalized ? (
              <Button variant="outline" size="sm" onClick={() => setFinalized(false)}>
                Edit list
              </Button>
            ) : (
              <Button size="sm" disabled={!list.length} onClick={() => setFinalized(true)}>
                <Lock className="h-4 w-4" />
                Finalize list
              </Button>
            )}
          </div>
          {finalized ? (
            <div className="flex items-center gap-2 rounded-lg bg-success-soft p-4 text-sm font-medium text-success">
              <CheckCircle2 className="h-4 w-4" />
              Material list finalized with {list.length} items. Continue to assign a worker.
            </div>
          ) : (
            <MaterialPicker
              catalogue={state.catalogue}
              list={list}
              onChange={setList}
              input={draft.data.picker}
              onInputChange={(picker) => draft.setData((d) => ({ ...d, picker }))}
            />
          )}
        </Card>

        <Card className={`p-5 ${finalized ? "" : "pointer-events-none opacity-50"}`}>
          <h2 className="mb-4 font-semibold">3. Assign worker</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Worker">
              <select
                className={selectCls}
                value={workerId}
                onChange={(e) => setWorkerId(e.target.value)}
              >
                <option value="">Select worker</option>
                {state.workers.map((w) => {
                  const n = state.tasks.filter(
                    (t) => t.workerId === w.id && !["completed", "cancelled"].includes(t.status),
                  ).length;
                  return (
                    <option key={w.id} value={w.id}>
                      {w.name} · {n} active
                    </option>
                  );
                })}
              </select>
            </Field>
            <Field label="Vendor">
              <select
                className={selectCls}
                value={vendorId}
                onChange={(e) => setVendorId(e.target.value)}
              >
                <option value="">Select vendor</option>
                {state.vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                    {v.address ? ` — ${v.address}` : ""}
                  </option>
                ))}
                <option value="new">+ Enter new vendor</option>
              </select>
            </Field>
            {vendorId === "new" && (
              <div className="grid gap-3 rounded-lg border p-3 md:col-span-2 md:grid-cols-3">
                <Field label="Vendor name">
                  <Input
                    value={newVendor.name}
                    onChange={(e) => setNewVendor({ ...newVendor, name: e.target.value })}
                  />
                </Field>
                <Field label="Phone">
                  <Input
                    value={newVendor.phone}
                    onChange={(e) => setNewVendor({ ...newVendor, phone: e.target.value })}
                  />
                </Field>
                <Field label="Address">
                  <Input
                    value={newVendor.address}
                    onChange={(e) => setNewVendor({ ...newVendor, address: e.target.value })}
                  />
                </Field>
              </div>
            )}
            <Field label="Delivery site (confirm)">
              <Input value={site} onChange={(e) => setSite(e.target.value)} />
            </Field>
            <Field label="Required completion date">
              <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            </Field>
            <Field label="Instructions" className="md:col-span-2">
              <Textarea
                rows={3}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="Anything the worker should check or collect"
              />
            </Field>
          </div>
          {error && (
            <p role="alert" className="mt-4 rounded-lg bg-danger-soft p-3 text-sm text-danger">
              {error}
            </p>
          )}
          <div className="mt-5 flex justify-end">
            <Button size="lg" disabled={!canAssign || busy} onClick={() => void submit()}>
              {busy && <LoaderCircle className="h-4 w-4 animate-spin" />}
              {busy ? "Creating request…" : "Assign task"}
            </Button>
          </div>
        </Card>
      </fieldset>
    </>
  );
}
