import { fmtDateTime } from "@/lib/store";
import { STATUS_LABEL, statusTone } from "@/lib/status";
import type { TaskEvent } from "@/lib/types";
import { toneDot } from "./ui";
import { cn } from "@/lib/utils";
import { AttachmentImage } from "./AttachmentImage";

export function Timeline({ events }: { events: TaskEvent[] }) {
  const sorted = [...events].sort((a, b) => a.at.localeCompare(b.at));
  if (!sorted.length)
    return <p className="text-sm text-muted-foreground">No updates recorded yet.</p>;
  return (
    <ol className="relative space-y-5 border-l border-border pl-6">
      {sorted.map((e) => (
        <li key={e.id} className="relative">
          <span
            className={cn(
              "absolute -left-[31px] top-1 h-3 w-3 rounded-full ring-4 ring-card",
              e.status ? toneDot[statusTone(e.status)] : "bg-muted-foreground",
            )}
          />
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-semibold text-foreground">
              {e.status ? STATUS_LABEL[e.status] : e.photoIds?.length ? "Photo uploaded" : "Update"}
            </p>
            <time className="text-xs text-muted-foreground">{fmtDateTime(e.at)}</time>
          </div>
          <p className="text-xs text-muted-foreground">by {e.by}</p>
          {e.note && (
            <p className="mt-1.5 rounded-md bg-muted px-3 py-2 text-sm text-foreground">{e.note}</p>
          )}
          {e.photoIds?.map((id) => (
            <AttachmentImage
              key={id}
              id={id}
              className="mt-2 h-32 rounded-md border object-cover"
            />
          ))}
        </li>
      ))}
    </ol>
  );
}
