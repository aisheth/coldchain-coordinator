import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Card, Initials, Field, selectCls } from "@/components/app/ui";
import { useStore } from "@/lib/store";
import { meta } from "@/lib/seo";

export const Route = createFileRoute("/worker/profile")({ head: () => meta("Profile", "Your worker profile."), component: Profile });

function Profile() {
  const { state, setCurrentWorker } = useStore();
  const me = state.workers.find((w) => w.id === state.currentWorkerId);
  const done = state.tasks.filter((t) => t.workerId === me?.id && t.status === "completed").length;
  return (
    <div className="space-y-4">
      <Card className="flex flex-col items-center p-6 text-center">
        <Initials name={me?.name ?? "?"} className="h-16 w-16 text-lg" />
        <p className="mt-3 text-lg font-semibold">{me?.name}</p>
        <p className="text-sm text-muted-foreground">{me?.phone} · {me?.area}</p>
        <p className="mt-3 text-sm">{done} tasks completed</p>
      </Card>
      <Card className="p-4">
        <Field label="Preview as worker (prototype)">
          <select className={`${selectCls} h-12 text-base`} value={state.currentWorkerId} onChange={(e) => { setCurrentWorker(e.target.value); toast.success("Switched worker"); }}>
            {state.workers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </Field>
      </Card>
    </div>
  );
}
