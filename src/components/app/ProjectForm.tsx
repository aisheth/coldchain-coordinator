import { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, selectCls } from "./ui";
import { PROJECT_LABEL } from "@/lib/status";
import type { Project, ProjectStatus } from "@/lib/types";

type Draft = Omit<Project, "id" | "createdAt">;
const empty: Draft = { ref: "", name: "", customer: "", contact: "", phone: "", address: "", description: "", deploymentDate: "", status: "planning" };

export function ProjectForm({ open, onOpenChange, initial, onSave }: { open: boolean; onOpenChange: (o: boolean) => void; initial?: Draft; onSave: (d: Draft) => void }) {
  const [d, setD] = useState<Draft>(initial ?? { ...empty, ref: `CS-2026-${String(Math.floor(Math.random() * 900) + 100)}` });
  const set = (k: keyof Draft) => (e: { target: { value: string } }) => setD({ ...d, [k]: e.target.value });
  const valid = d.ref && d.name && d.customer && d.address && d.deploymentDate;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{initial ? "Edit project" : "New project"}</DialogTitle></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Reference no."><Input value={d.ref} onChange={set("ref")} /></Field>
          <Field label="Project name"><Input value={d.name} onChange={set("name")} placeholder="e.g. Dairy chiller room" /></Field>
          <Field label="Customer"><Input value={d.customer} onChange={set("customer")} /></Field>
          <Field label="Contact person"><Input value={d.contact} onChange={set("contact")} /></Field>
          <Field label="Contact phone"><Input value={d.phone} onChange={set("phone")} /></Field>
          <Field label="Expected deployment"><Input type="date" value={d.deploymentDate.slice(0, 10)} onChange={(e) => setD({ ...d, deploymentDate: e.target.value ? new Date(e.target.value).toISOString() : "" })} /></Field>
          <Field label="Site address" className="sm:col-span-2"><Input value={d.address} onChange={set("address")} /></Field>
          <Field label="Description" className="sm:col-span-2"><Textarea value={d.description} onChange={set("description")} rows={3} /></Field>
          <Field label="Status"><select className={selectCls} value={d.status} onChange={(e) => setD({ ...d, status: e.target.value as ProjectStatus })}>
            {Object.entries(PROJECT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={!valid} onClick={() => onSave(d)}>Save project</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
