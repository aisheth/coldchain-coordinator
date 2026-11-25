import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { LoaderCircle, Phone, Plus } from "lucide-react";
import { toast } from "sonner";
import { Card, PageHeader, TaskStatusPill, Initials, Field } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStore, timeAgo } from "@/lib/store";
import { isActiveTask } from "@/lib/status";
import { errorMessage } from "@/lib/api";
import { meta } from "@/lib/seo";

export const Route = createFileRoute("/workers")({
  head: () => meta("Workers", "Live field workers and their current assignments."),
  component: Workers,
});

function Workers() {
  const { state, addWorker } = useStore();
  const blank = { name: "", username: "", password: "", phone: "" };
  const [d, setD] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function add() {
    setBusy(true);
    setError("");
    try {
      await addWorker(d);
      setD(blank);
      toast.success("Worker account created");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader title="Workers" subtitle="Live worker accounts and assignments." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {state.workers.map((w) => {
          const tasks = state.tasks.filter((t) => t.workerId === w.id);
          const active = tasks.filter((t) => isActiveTask(t.status));
          const last = tasks
            .flatMap((t) => t.events)
            .filter((e) => e.by === w.name)
            .sort((a, b) => b.at.localeCompare(a.at))[0];
          return (
            <Card key={w.id} className="p-5">
              <div className="flex items-center gap-3">
                <Initials name={w.name} className="h-10 w-10" />
                <div>
                  <p className="font-semibold">{w.name}</p>
                  <p className="text-xs text-muted-foreground">@{w.username}</p>
                </div>
              </div>
              {w.phone && (
                <a
                  href={`tel:${w.phone}`}
                  className="mt-3 flex items-center gap-2 text-sm text-primary"
                >
                  <Phone className="h-3.5 w-3.5" />
                  {w.phone}
                </a>
              )}
              <div className="mt-4 space-y-2 border-t pt-3">
                {active.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Available — no active task</p>
                ) : (
                  active.map((t) => (
                    <div key={t.id} className="flex items-center justify-between text-sm">
                      <span className="font-medium">{t.ref}</span>
                      <TaskStatusPill status={t.status} />
                    </div>
                  ))
                )}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Last update: {last ? timeAgo(last.at) : "—"} ·{" "}
                {tasks.filter((t) => t.status === "completed").length} completed
              </p>
            </Card>
          );
        })}
        <Card className="space-y-3 border-dashed p-5">
          <p className="font-semibold">Add worker</p>
          <Field label="Name">
            <Input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
          </Field>
          <Field label="Username">
            <Input
              autoComplete="off"
              value={d.username}
              onChange={(e) => setD({ ...d, username: e.target.value })}
            />
          </Field>
          <Field label="Temporary password (at least 8 characters)">
            <Input
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={d.password}
              onChange={(e) => setD({ ...d, password: e.target.value })}
            />
          </Field>
          <Field label="Phone">
            <Input value={d.phone} onChange={(e) => setD({ ...d, phone: e.target.value })} />
          </Field>
          <p className="text-xs text-muted-foreground">
            Worker area is not supported by the live API.
          </p>
          {error && (
            <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">
              {error}
            </p>
          )}
          <Button
            disabled={!d.name || d.username.length < 3 || d.password.length < 8 || busy}
            onClick={() => void add()}
          >
            {busy ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Add worker
          </Button>
        </Card>
      </div>
    </>
  );
}
