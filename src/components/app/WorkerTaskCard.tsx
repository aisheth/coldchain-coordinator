import { Link } from "@tanstack/react-router";
import { MapPin, Calendar, ChevronRight } from "lucide-react";
import { TaskStatusPill, Card } from "./ui";
import { useStore, fmtDate } from "@/lib/store";
import type { Task } from "@/lib/types";

export function WorkerTaskCard({ t }: { t: Task }) {
  const { state } = useStore();
  const p = state.projects.find((x) => x.id === t.projectId);
  const v = state.vendors.find((x) => x.id === t.vendorId);
  return (
    <Link to="/worker/task/$id" params={{ id: t.id }}>
      <Card className="p-4 active:scale-[0.99]">
        <div className="flex items-center justify-between"><span className="text-xs font-semibold text-muted-foreground">{t.ref}</span><TaskStatusPill status={t.status} /></div>
        <p className="mt-2 text-base font-semibold">{p?.name}</p>
        <p className="text-sm text-muted-foreground">Collect from {v?.name ?? "vendor"}</p>
        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{t.materials.length} items</span>
          <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />Due {fmtDate(t.dueDate)}</span>
          <ChevronRight className="h-4 w-4" />
        </div>
      </Card>
    </Link>
  );
}
