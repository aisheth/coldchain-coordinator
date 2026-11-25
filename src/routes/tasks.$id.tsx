import { useDraft, draftField } from "@/lib/drafts";
import { DraftNotice } from "@/components/app/DraftNotice";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, MapPin, Phone, Store, Calendar, User, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Card, TaskStatusPill, selectCls } from "@/components/app/ui";
import { Timeline } from "@/components/app/Timeline";
import { AttachmentImage } from "@/components/app/AttachmentImage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useStore, fmtDate } from "@/lib/store";
import { describeLine } from "@/lib/procurement";
import { FLOW, STATUS_LABEL, progressPct } from "@/lib/status";
import { errorMessage } from "@/lib/api";
import { meta } from "@/lib/seo";

export const Route = createFileRoute("/tasks/$id")({
  head: () =>
    meta("Task details", "Live procurement materials, vendor, worker and activity timeline."),
  component: TaskPage,
});

function TaskPage() {
  const { id } = Route.useParams();
  const { state, user, transitionTask, resolveIssue } = useStore();
  const draft = useDraft(user, `owner-task:${id}:status`, { note: "", st: "" });
  const issueDraft = useDraft(user, `owner-task:${id}:resolution`, { resolution: "" });
  const [note, setNote] = draftField(draft, "note");
  const [st, setSt] = draftField(draft, "st");
  const [resolution, setResolution] = draftField(issueDraft, "resolution");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const t = state.tasks.find((x) => x.id === id);
  if (!t)
    return (
      <p className="text-muted-foreground">
        Task not found.{" "}
        <Link to="/procurement" className="text-primary">
          Back
        </Link>
      </p>
    );
  const p = state.projects.find((x) => x.id === t.projectId);
  const w = state.workers.find((x) => x.id === t.workerId);
  const v = state.vendors.find((x) => x.id === t.vendorId);
  const photos = t.events.flatMap((e) => e.photoIds ?? []);
  const step = FLOW.indexOf(t.rawStatus);
  const openIssues = t.issues.filter(
    (issue) => issue.status !== "resolved" && issue.status !== "closed",
  );

  async function run(action: () => Promise<void>, success: string, clear: () => void) {
    setBusy(true);
    setError("");
    try {
      await action();
      clear();
      toast.success(success);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Link
        to="/procurement"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Procurement
      </Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-muted-foreground">{t.ref}</p>
          <h1 className="text-2xl font-semibold">{p?.name ?? t.projectName}</h1>
          <p className="text-sm text-muted-foreground">{p?.customer}</p>
        </div>
        <TaskStatusPill status={t.status} className="text-sm" />
      </div>

      <Card className="mb-6 p-5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Progress</span>
          <span>{progressPct(t.rawStatus)}%</span>
        </div>
        <div className="mt-3 grid grid-cols-9 gap-1">
          {FLOW.map((s, i) => (
            <div
              key={s}
              title={STATUS_LABEL[s]}
              className={`h-2 rounded-full ${step >= i ? (t.rawStatus === "completed" ? "bg-success" : "bg-primary") : "bg-muted"}`}
            />
          ))}
        </div>
        <div className="mt-2 hidden grid-cols-9 gap-1 text-[10px] leading-tight text-muted-foreground lg:grid">
          {FLOW.map((s) => (
            <span key={s}>{STATUS_LABEL[s]}</span>
          ))}
        </div>
      </Card>

      {error && (
        <p role="alert" className="mb-4 rounded-lg bg-danger-soft p-3 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <div className="border-b px-5 py-4">
              <h2 className="font-semibold">Materials ({t.materials.length})</h2>
            </div>
            <table className="w-full text-sm">
              <tbody className="divide-y">
                {t.materials.map((m) => {
                  const d = describeLine(state.catalogue, m);
                  return (
                    <tr key={m.itemId + m.variantId}>
                      <td className="px-5 py-2.5 font-medium">{d.name}</td>
                      <td className="px-5 py-2.5">{d.spec}</td>
                      <td className="px-5 py-2.5">
                        {m.qty} {d.unit}
                      </td>
                      <td className="px-5 py-2.5 text-muted-foreground">{m.remarks}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
          {openIssues.length > 0 && (
            <Card className="space-y-4 border-danger/30 p-5">
              <h2 className="font-semibold text-danger">Open issues</h2>
              <DraftNotice draft={issueDraft} />
              {openIssues.map((issue) => (
                <div key={issue.id} className="rounded-lg bg-danger-soft p-3 text-sm">
                  <p>{issue.description}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Reported by {issue.raisedBy}</p>
                  <div className="mt-3 flex gap-2">
                    <Input
                      placeholder="Resolution"
                      value={resolution}
                      disabled={issueDraft.pending || busy}
                      onChange={(e) => setResolution(e.target.value)}
                    />
                    <Button
                      disabled={!resolution || busy || issueDraft.pending}
                      onClick={() =>
                        void run(
                          () => resolveIssue(t.id, issue.id, resolution),
                          "Issue resolved",
                          issueDraft.clear,
                        )
                      }
                    >
                      Resolve
                    </Button>
                  </div>
                </div>
              ))}
            </Card>
          )}
          <Card className="p-5">
            <h2 className="mb-5 font-semibold">Activity timeline</h2>
            <Timeline events={t.events} />
          </Card>
        </div>
        <div className="space-y-6">
          <Card className="space-y-2.5 p-5 text-sm">
            <h2 className="font-semibold">Worker</h2>
            <p className="flex gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              {w?.name ?? t.workerName}
            </p>
            {w?.phone && (
              <a href={`tel:${w.phone}`} className="flex gap-2 text-primary">
                <Phone className="h-4 w-4" />
                {w.phone}
              </a>
            )}
            <h2 className="pt-3 font-semibold">Vendor</h2>
            <p className="flex gap-2">
              <Store className="h-4 w-4 text-muted-foreground" />
              {v?.name ?? t.vendorName ?? "—"}
            </p>
            {v && (
              <p className="flex gap-2 text-muted-foreground">
                <MapPin className="h-4 w-4 shrink-0" />
                {v.address || "Address not provided"}
                {v.phone ? ` · ${v.phone}` : ""}
              </p>
            )}
            <h2 className="pt-3 font-semibold">Delivery</h2>
            <p className="flex gap-2">
              <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
              {t.deliverySite || "Not set"}
            </p>
            <p className="flex gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              Due {fmtDate(t.dueDate)}
            </p>
            {t.instructions && (
              <p className="rounded-md bg-muted p-3 text-muted-foreground">{t.instructions}</p>
            )}
          </Card>
          {photos.length > 0 && (
            <Card className="p-5">
              <h2 className="mb-3 font-semibold">Proof photos</h2>
              <div className="grid grid-cols-2 gap-2">
                {photos.map((photoId) => (
                  <AttachmentImage key={photoId} id={photoId} />
                ))}
              </div>
            </Card>
          )}
          <Card className="space-y-3 p-5">
            <h2 className="font-semibold">Owner action</h2>
            <DraftNotice draft={draft} />
            <select
              disabled={draft.pending || busy}
              className={selectCls}
              value={st}
              onChange={(e) => setSt(e.target.value)}
            >
              <option value="">Choose an allowed status update</option>
              {t.allowedTransitions.map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABEL[status as keyof typeof STATUS_LABEL] ?? status}
                </option>
              ))}
            </select>
            <Textarea
              rows={2}
              disabled={draft.pending || busy}
              placeholder="Note with this status update"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              The live API does not support note-only owner updates.
            </p>
            <Button
              className="w-full"
              disabled={!st || busy || draft.pending || !t.allowedTransitions.includes(st)}
              onClick={() =>
                void run(() => transitionTask(t.id, st, note), "Task updated", draft.clear)
              }
            >
              {busy && <LoaderCircle className="h-4 w-4 animate-spin" />}Post status update
            </Button>
            {!t.allowedTransitions.length && (
              <p className="text-xs text-muted-foreground">
                No owner transitions are currently available.
              </p>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
