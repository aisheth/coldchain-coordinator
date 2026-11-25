import { useDraft, draftField } from "@/lib/drafts";
import { DraftNotice } from "@/components/app/DraftNotice";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import {
  ArrowLeft,
  Camera,
  MapPin,
  Phone,
  Store,
  AlertTriangle,
  PauseCircle,
  CheckCircle2,
  LoaderCircle,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Card, TaskStatusPill } from "@/components/app/ui";
import { Timeline } from "@/components/app/Timeline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useStore, fmtDate } from "@/lib/store";
import { describeLine } from "@/lib/procurement";
import { FLOW, STATUS_LABEL, nextStatus, progressPct } from "@/lib/status";
import { errorMessage } from "@/lib/api";
import type { TaskStatus } from "@/lib/types";
import { meta } from "@/lib/seo";

export const Route = createFileRoute("/worker/task/$id")({
  head: () => meta("Task", "Update progress on your live procurement task."),
  component: WorkerTask,
});

type Mode = null | "issue" | "on_hold" | "delivery";

function WorkerTask() {
  const { id } = Route.useParams();
  const { state, user, transitionTask, holdTask, reportIssue, recordDelivery } = useStore();
  const draft = useDraft(user, `worker-task:${id}`, {
    note: "",
    mode: null as Mode,
    recipient: "",
  });
  const [note, setNote] = draftField(draft, "note");
  const [mode, setMode] = draftField(draft, "mode");
  const [photo, setPhoto] = useState<File>();
  const [recipient, setRecipient] = draftField(draft, "recipient");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const t = state.tasks.find((x) => x.id === id && x.workerId === state.currentWorkerId);
  if (!t) return <p>Task not found.</p>;
  const p = state.projects.find((x) => x.id === t.projectId);
  const v = state.vendors.find((x) => x.id === t.vendorId);
  const preferred = nextStatus(t.rawStatus);
  const next = t.allowedTransitions.includes(preferred ?? "")
    ? preferred
    : (t.allowedTransitions.find((status) => FLOW.includes(status as TaskStatus)) as
        TaskStatus | undefined);

  async function run(action: () => Promise<void>, success: string) {
    setBusy(true);
    setError("");
    try {
      await action();
      draft.clear();
      setPhoto(undefined);

      if (fileRef.current) fileRef.current.value = "";
      toast.success(success);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  function advance() {
    if (!next) return;
    if (next === "delivered") {
      setMode("delivery");
      return;
    }
    void run(() => transitionTask(id, next, note, photo), `Updated: ${STATUS_LABEL[next]}`);
  }

  return (
    <div className="space-y-4">
      <DraftNotice draft={draft} />
      <fieldset disabled={draft.pending || busy} className="space-y-4">
        <Link to="/worker" className="inline-flex items-center gap-1 text-sm text-muted-foreground">
          <ArrowLeft className="h-4 w-4" />
          My tasks
        </Link>
        <div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">{t.ref}</span>
            <TaskStatusPill status={t.status} />
          </div>
          <h1 className="mt-1 text-xl font-semibold">{p?.name ?? t.projectName}</h1>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${progressPct(t.rawStatus)}%` }}
            />
          </div>
        </div>

        {error && (
          <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">
            {error}
          </p>
        )}
        {next && mode !== "delivery" && (
          <Button size="lg" className="h-16 w-full text-base" disabled={busy} onClick={advance}>
            {busy ? (
              <LoaderCircle className="h-5 w-5 animate-spin" />
            ) : (
              <CheckCircle2 className="h-5 w-5" />
            )}
            {t.rawStatus === "assigned" && next === "accepted"
              ? "Accept task"
              : next === "delivered"
                ? "Record delivery"
                : `Mark: ${STATUS_LABEL[next]}`}
          </Button>
        )}
        {t.status === "on_hold" && (
          <p className="rounded-lg bg-warning-soft p-3 text-sm text-warning">
            This task is on hold. Use an allowed update above to resume.
          </p>
        )}
        {!next && (
          <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
            No progress updates are currently allowed. The owner may need to resolve an issue or
            confirm completion.
          </p>
        )}

        {mode === "delivery" ? (
          <Card className="space-y-3 p-4">
            <h2 className="font-semibold">Delivery details</h2>
            <Input
              placeholder="Recipient name (optional)"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
            />
            <Textarea
              rows={3}
              placeholder="Delivery remarks"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            {photo && (
              <p className="flex items-center justify-between rounded-lg bg-muted p-2 text-sm">
                <span className="truncate">{photo.name}</span>
                <button aria-label="Remove photo" onClick={() => setPhoto(undefined)}>
                  <X className="h-4 w-4" />
                </button>
              </p>
            )}
            <Button
              className="h-12 w-full"
              disabled={busy}
              onClick={() =>
                void run(() => recordDelivery(t.id, recipient, note, photo), "Delivery recorded")
              }
            >
              {busy && <LoaderCircle className="h-4 w-4 animate-spin" />}Confirm delivery
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              disabled={busy}
              onClick={() => setMode(null)}
            >
              Back
            </Button>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              <Button
                variant="outline"
                className="h-14 flex-col gap-1 text-xs"
                disabled={busy}
                onClick={() => setMode(mode === "issue" ? null : "issue")}
              >
                <AlertTriangle className="h-5 w-5 text-danger" />
                Report issue
              </Button>
              <Button
                variant="outline"
                className="h-14 flex-col gap-1 text-xs"
                disabled={busy}
                onClick={() => setMode(mode === "on_hold" ? null : "on_hold")}
              >
                <PauseCircle className="h-5 w-5" />
                On hold
              </Button>
              <Button
                variant="outline"
                className="h-14 flex-col gap-1 text-xs"
                disabled={busy}
                onClick={() => fileRef.current?.click()}
              >
                <Camera className="h-5 w-5 text-primary" />
                Add photo
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  setPhoto(e.target.files?.[0]);
                }}
              />
            </div>
            {photo && (
              <p className="flex items-center justify-between rounded-lg bg-muted p-3 text-sm">
                <span className="truncate">Ready to attach: {photo.name}</span>
                <button
                  aria-label="Remove photo"
                  onClick={() => {
                    setPhoto(undefined);
                    if (fileRef.current) fileRef.current.value = "";
                  }}
                >
                  <X className="h-4 w-4" />
                </button>
              </p>
            )}
            <Card className="space-y-2 p-4">
              <Textarea
                rows={3}
                className="text-base"
                placeholder={
                  mode === "issue"
                    ? "Describe the issue (required)"
                    : mode === "on_hold"
                      ? "Reason for holding (required)"
                      : "Remark to include with your next update"
                }
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              {mode === "issue" && (
                <Button
                  className="h-12 w-full"
                  variant="destructive"
                  disabled={!note || busy}
                  onClick={() =>
                    void run(() => reportIssue(t.id, note, photo), "Issue reported to owner")
                  }
                >
                  {busy && <LoaderCircle className="h-4 w-4 animate-spin" />}Send issue report
                </Button>
              )}
              {mode === "on_hold" && (
                <Button
                  className="h-12 w-full"
                  variant="secondary"
                  disabled={!note || busy}
                  onClick={() => void run(() => holdTask(t.id, note), "Task put on hold")}
                >
                  {busy && <LoaderCircle className="h-4 w-4 animate-spin" />}Put task on hold
                </Button>
              )}
              {!mode && (
                <p className="text-xs text-muted-foreground">
                  Remarks and photos are uploaded with your next status update or issue report.
                  Standalone remarks are not supported by the live API.
                </p>
              )}
            </Card>
          </>
        )}
      </fieldset>
      <Card className="p-4">
        <h2 className="mb-2 font-semibold">Materials to collect</h2>
        <ul className="divide-y">
          {t.materials.map((m) => {
            const d = describeLine(state.catalogue, m);
            return (
              <li
                key={m.itemId + m.variantId}
                className="flex justify-between gap-2 py-2.5 text-sm"
              >
                <div>
                  <p className="font-medium">{d.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {d.spec}
                    {m.remarks ? ` · ${m.remarks}` : ""}
                  </p>
                </div>
                <span className="font-semibold">
                  {m.qty} {d.unit}
                </span>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card className="space-y-3 p-4 text-sm">
        <div>
          <p className="flex items-center gap-2 font-semibold">
            <Store className="h-4 w-4" />
            Vendor
          </p>
          <p className="mt-1">{v?.name ?? t.vendorName}</p>
          <p className="text-muted-foreground">{v?.address || "Vendor address not available"}</p>
          {v?.phone && (
            <a
              href={`tel:${v.phone}`}
              className="mt-2 inline-flex items-center gap-1 font-medium text-primary"
            >
              <Phone className="h-4 w-4" />
              Call vendor
            </a>
          )}
        </div>
        <div className="border-t pt-3">
          <p className="flex items-center gap-2 font-semibold">
            <MapPin className="h-4 w-4" />
            Deliver to
          </p>
          <p className="mt-1">{t.deliverySite || "Delivery site not set"}</p>
          <p className="text-muted-foreground">By {fmtDate(t.dueDate)}</p>
          {t.deliverySite && (
            <a
              target="_blank"
              rel="noreferrer"
              href={`https://maps.google.com/?q=${encodeURIComponent(t.deliverySite)}`}
              className="mt-2 inline-flex font-medium text-primary"
            >
              Open in Maps
            </a>
          )}
        </div>
        {t.instructions && <p className="rounded-md bg-muted p-3">{t.instructions}</p>}
      </Card>

      <Card className="p-4">
        <h2 className="mb-4 font-semibold">Timeline</h2>
        <Timeline events={t.events} />
      </Card>
    </div>
  );
}
