import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Lock } from "lucide-react";
import { Card, Field, PageHeader, selectCls } from "@/components/app/ui";
import { MaterialPicker } from "@/components/app/MaterialPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useStore } from "@/lib/store";
import type { MaterialLine } from "@/lib/types";
import { meta } from "@/lib/seo";

export const Route = createFileRoute("/procurement/new")({
  validateSearch: (s: Record<string, unknown>): { project?: string } => (typeof s["project"] === "string" ? { project: s["project"] } : {}),
  head: () => meta("New procurement task", "Build a material list and assign it to a worker."),
  component: NewTask,
});

function NewTask() {
  const { project: initialProject } = Route.useSearch();
  const { state, createTask, addVendor } = useStore();
  const nav = useNavigate();
  const [projectId, setProjectId] = useState(initialProject ?? "");
  const [list, setList] = useState<MaterialLine[]>([]);
  const [finalized, setFinalized] = useState(false);
  const [workerId, setWorkerId] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [newVendor, setNewVendor] = useState({ name: "", phone: "", address: "" });
  const [instructions, setInstructions] = useState("");
  const project = state.projects.find((p) => p.id === projectId);
  const [site, setSite] = useState(project?.address ?? "");
  const [due, setDue] = useState("");

  const canAssign = finalized && projectId && workerId && site && due && (vendorId && (vendorId !== "new" || newVendor.name));
  const submit = () => {
    let vId = vendorId;
    if (vendorId === "new") vId = addVendor({ name: newVendor.name, phone: newVendor.phone, address: newVendor.address, contact: "", specialty: "" }).id;
    const t = createTask({ projectId, workerId, vendorId: vId, materials: list, instructions, deliverySite: site, dueDate: new Date(due).toISOString() });
    toast.success(`${t.ref} assigned to ${state.workers.find((w) => w.id === workerId)?.name}`);
    nav({ to: "/tasks/$id", params: { id: t.id } });
  };

  return (
    <>
      <PageHeader title="New procurement task" subtitle="1. Choose project · 2. Build material list · 3. Assign worker" />
      <div className="space-y-6">
        <Card className="p-5">
          <h2 className="mb-4 font-semibold">1. Project</h2>
          <Field label="Project" className="max-w-md">
            <select className={selectCls} value={projectId} onChange={(e) => { setProjectId(e.target.value); setSite(state.projects.find((p) => p.id === e.target.value)?.address ?? ""); }}>
              <option value="">Select project</option>
              {state.projects.filter((p) => p.status !== "completed").map((p) => <option key={p.id} value={p.id}>{p.ref} — {p.name} ({p.customer})</option>)}
            </select>
          </Field>
        </Card>

        <Card className="p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">2. Material list <span className="ml-1 text-sm font-normal text-muted-foreground">({list.length} items)</span></h2>
            {finalized ? <Button variant="outline" size="sm" onClick={() => setFinalized(false)}>Edit list</Button>
              : <Button size="sm" disabled={!list.length} onClick={() => setFinalized(true)}><Lock className="h-4 w-4" />Finalize list</Button>}
          </div>
          {finalized ? (
            <div className="flex items-center gap-2 rounded-lg bg-success-soft p-4 text-sm font-medium text-success"><CheckCircle2 className="h-4 w-4" />Material list finalized with {list.length} items. Continue to assign a worker.</div>
          ) : <MaterialPicker catalogue={state.catalogue} list={list} onChange={setList} />}
        </Card>

        <Card className={`p-5 ${finalized ? "" : "pointer-events-none opacity-50"}`}>
          <h2 className="mb-4 font-semibold">3. Assign worker</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Worker"><select className={selectCls} value={workerId} onChange={(e) => setWorkerId(e.target.value)}>
              <option value="">Select worker</option>
              {state.workers.map((w) => { const n = state.tasks.filter((t) => t.workerId === w.id && !["completed", "cancelled"].includes(t.status)).length; return <option key={w.id} value={w.id}>{w.name} · {w.area} · {n} active</option>; })}
            </select></Field>
            <Field label="Vendor"><select className={selectCls} value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
              <option value="">Select vendor</option>
              {state.vendors.map((v) => <option key={v.id} value={v.id}>{v.name} — {v.address}</option>)}
              <option value="new">+ Enter new vendor</option>
            </select></Field>
            {vendorId === "new" && <div className="grid gap-3 rounded-lg border p-3 md:col-span-2 md:grid-cols-3">
              <Field label="Vendor name"><Input value={newVendor.name} onChange={(e) => setNewVendor({ ...newVendor, name: e.target.value })} /></Field>
              <Field label="Phone"><Input value={newVendor.phone} onChange={(e) => setNewVendor({ ...newVendor, phone: e.target.value })} /></Field>
              <Field label="Address"><Input value={newVendor.address} onChange={(e) => setNewVendor({ ...newVendor, address: e.target.value })} /></Field>
            </div>}
            <Field label="Delivery site (confirm)"><Input value={site} onChange={(e) => setSite(e.target.value)} /></Field>
            <Field label="Required completion date"><Input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
            <Field label="Instructions" className="md:col-span-2"><Textarea rows={3} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Anything the worker should check or collect" /></Field>
          </div>
          <div className="mt-5 flex justify-end"><Button size="lg" disabled={!canAssign} onClick={submit}>Assign task</Button></div>
        </Card>
      </div>
    </>
  );
}
