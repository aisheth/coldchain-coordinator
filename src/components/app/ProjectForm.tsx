import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, selectCls } from "./ui";
import { PROJECT_LABEL } from "@/lib/status";
import type { ProjectStatus } from "@/lib/types";
import { errorMessage } from "@/lib/api";
import { useStore, type ProjectDraft } from "@/lib/store";

const empty: ProjectDraft = {
  name: "",
  customer: "",
  contact: "",
  phone: "",
  address: "",
  deploymentDate: "",
  status: "active",
};

export function ProjectForm({
  open,
  onOpenChange,
  initial,
  onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial?: ProjectDraft;
  onSave: (d: ProjectDraft) => Promise<void>;
}) {
  const { state } = useStore();
  const [d, setD] = useState<ProjectDraft>(initial ?? empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof ProjectDraft) => (e: { target: { value: string } }) =>
    setD({ ...d, [k]: e.target.value });
  const valid = d.name && d.customer && d.address && d.deploymentDate;
  async function save() {
    setBusy(true);
    setError("");
    try {
      await onSave(d);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit project" : "New project"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Project name">
            <Input value={d.name} onChange={set("name")} placeholder="e.g. Dairy chiller room" />
          </Field>
          <Field label="Customer">
            <Input
              value={d.customer}
              onChange={set("customer")}
              list="customer-options"
              disabled={Boolean(initial)}
            />
            <datalist id="customer-options">
              {state.customers.map((c) => (
                <option key={c.id} value={c.name} />
              ))}
            </datalist>
            {initial ? (
              <span className="text-xs text-muted-foreground">
                The API does not support moving a project to another customer.
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">
                Choose an existing customer or enter a name to create one.
              </span>
            )}
          </Field>
          <Field label="Contact person">
            <Input value={d.contact} onChange={set("contact")} />
          </Field>
          <Field label="Contact phone">
            <Input value={d.phone} onChange={set("phone")} />
          </Field>
          <Field label="Expected deployment">
            <Input
              type="date"
              value={d.deploymentDate.slice(0, 10)}
              onChange={set("deploymentDate")}
            />
          </Field>
          <Field label="Site address" className="sm:col-span-2">
            <Input value={d.address} onChange={set("address")} />
          </Field>
          <Field label="Status">
            <select
              className={selectCls}
              value={d.status}
              onChange={(e) => setD({ ...d, status: e.target.value as ProjectStatus })}
            >
              {(["active", "on_hold", "closed"] as const).map((k) => (
                <option key={k} value={k}>
                  {PROJECT_LABEL[k]}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Project references are generated from the live project ID. Custom references and
          descriptions are not supported by this API.
        </p>
        {error && (
          <p role="alert" className="mt-3 rounded-lg bg-danger-soft p-3 text-sm text-danger">
            {error}
          </p>
        )}
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button disabled={!valid || busy} onClick={() => void save()}>
            {busy && <LoaderCircle className="h-4 w-4 animate-spin" />}
            {busy ? "Saving…" : "Save project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
