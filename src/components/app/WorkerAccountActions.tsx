import { useState, type FormEvent } from "react";
import { Copy, KeyRound, LoaderCircle, Pencil } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDraft, draftField } from "@/lib/drafts";
import { errorMessage } from "@/lib/api";
import { useStore } from "@/lib/store";
import type { Worker } from "@/lib/types";
import { DraftNotice } from "./DraftNotice";
import { Field } from "./ui";

export function WorkerAccountActions({ worker }: { worker: Worker }) {
  const { user, updateWorker, resetWorkerPassword } = useStore();
  const [editOpen, setEditOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [editError, setEditError] = useState("");
  const [resetError, setResetError] = useState("");
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const draft = useDraft(user, `worker:${worker.id}:edit`, {
    name: worker.name,
    email: worker.email,
    phone: worker.phone,
    isActive: worker.isActive,
  });
  const [name, setName] = draftField(draft, "name");
  const [email, setEmail] = draftField(draft, "email");
  const [phone, setPhone] = draftField(draft, "phone");
  const [isActive, setIsActive] = draftField(draft, "isActive");

  if (!user || user.role === "worker") return null;

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setEditError("Name is required.");
      return;
    }
    setSaving(true);
    setEditError("");
    const changes = {
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      isActive,
    };
    try {
      await updateWorker(worker.id, changes);
      draft.clear(changes);
      setEditOpen(false);
      toast.success("Worker account updated");
    } catch (error) {
      setEditError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function reset() {
    setResetting(true);
    setResetError("");
    try {
      const password = await resetWorkerPassword(worker.id);
      setConfirmReset(false);
      setCopied(false);
      setCopyError("");
      setTemporaryPassword(password);
    } catch (error) {
      setResetError(errorMessage(error));
    } finally {
      setResetting(false);
    }
  }

  async function copyPassword() {
    if (!temporaryPassword) return;
    setCopyError("");
    try {
      await navigator.clipboard.writeText(temporaryPassword);
      setCopied(true);
    } catch {
      setCopyError("Copy is unavailable. Select the temporary password and copy it manually.");
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          setEditError("");
          setEditOpen(true);
        }}
      >
        <Pencil className="h-4 w-4" />
        Edit
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          setResetError("");
          setConfirmReset(true);
        }}
      >
        <KeyRound className="h-4 w-4" />
        Reset password
      </Button>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit {worker.name}</DialogTitle>
            <DialogDescription>
              Update contact details or deactivate this worker. Their username and role stay
              unchanged.
            </DialogDescription>
          </DialogHeader>
          <DraftNotice draft={draft} />
          <form className="space-y-4" onSubmit={(event) => void save(event)}>
            <fieldset disabled={draft.pending || saving} className="space-y-4">
              <Field label="Name">
                <Input
                  aria-label="Name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                  maxLength={200}
                />
              </Field>
              <Field label="Email">
                <Input
                  aria-label="Email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="worker@example.com"
                />
              </Field>
              <Field label="Phone">
                <Input
                  aria-label="Phone"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                />
              </Field>
              <label className="flex items-start gap-3 rounded-md border p-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 accent-primary"
                  checked={isActive}
                  onChange={(event) => setIsActive(event.target.checked)}
                />
                <span>
                  <span className="block font-medium">Active worker account</span>
                  <span className="text-muted-foreground">
                    Inactive workers cannot be selected for new procurement assignments. Existing
                    task history is unchanged.
                  </span>
                </span>
              </label>
              {editError && (
                <p role="alert" className="rounded-md bg-danger-soft p-3 text-sm text-danger">
                  {editError}
                </p>
              )}
            </fieldset>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => setEditOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving || draft.pending || !name.trim()}>
                {saving && <LoaderCircle className="h-4 w-4 animate-spin" />}
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmReset} onOpenChange={(open) => !resetting && setConfirmReset(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset {worker.name}’s password?</AlertDialogTitle>
            <AlertDialogDescription>
              This creates a new temporary password. The worker’s existing sessions will be revoked,
              and they must change the temporary password at their next login. Their current
              password is never retrieved or shown.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {resetError && (
            <p role="alert" className="rounded-md bg-danger-soft p-3 text-sm text-danger">
              {resetError}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={resetting}
              onClick={(event) => {
                event.preventDefault();
                void reset();
              }}
            >
              {resetting && <LoaderCircle className="h-4 w-4 animate-spin" />}
              {resetting ? "Resetting…" : "Confirm reset"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={temporaryPassword !== null}
        onOpenChange={(open) => {
          if (!open) setTemporaryPassword(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Temporary password for {worker.name}</DialogTitle>
            <DialogDescription>
              Shown only once. Share it through a secure channel, not in a group chat or email
              thread. The worker must change it at next login.
            </DialogDescription>
          </DialogHeader>
          <Field label="Temporary password">
            <Input
              aria-label="Temporary password"
              type="text"
              readOnly
              autoComplete="off"
              value={temporaryPassword ?? ""}
              onFocus={(event) => event.target.select()}
              className="font-mono text-base"
            />
          </Field>
          <p className="text-xs text-muted-foreground">
            Closing this dialog clears the temporary password from this page. It is not saved in
            drafts or browser storage.
          </p>
          {copyError && (
            <p role="alert" className="rounded-md bg-danger-soft p-3 text-sm text-danger">
              {copyError}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => void copyPassword()}>
              <Copy className="h-4 w-4" />
              {copied ? "Copied" : "Copy password"}
            </Button>
            <Button type="button" onClick={() => setTemporaryPassword(null)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
