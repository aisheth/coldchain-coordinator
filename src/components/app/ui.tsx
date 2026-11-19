import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { STATUS_LABEL, statusTone, PROJECT_LABEL, projectTone, type Tone } from "@/lib/status";
import type { ProjectStatus, TaskStatus } from "@/lib/types";

const toneCls: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground",
  info: "bg-info-soft text-info",
  warning: "bg-warning-soft text-warning",
  success: "bg-success-soft text-success",
  danger: "bg-danger-soft text-danger",
};
const dotCls: Record<Tone, string> = { neutral: "bg-muted-foreground", info: "bg-info", warning: "bg-warning", success: "bg-success", danger: "bg-danger" };

export function Pill({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string | undefined }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold", toneCls[tone], className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", dotCls[tone])} />{children}
    </span>
  );
}
export const TaskStatusPill = ({ status, className }: { status: TaskStatus; className?: string | undefined }) => <Pill tone={statusTone(status)} className={className}>{STATUS_LABEL[status]}</Pill>;
export const ProjectStatusPill = ({ status }: { status: ProjectStatus }) => <Pill tone={projectTone(status)}>{PROJECT_LABEL[status]}</Pill>;
export const toneDot = dotCls;

export function Card({ children, className }: { children: ReactNode; className?: string | undefined }) {
  return <div className={cn("rounded-xl border bg-card text-card-foreground shadow-[var(--shadow-card)]", className)}>{children}</div>;
}
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}
export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string | undefined }) {
  return <label className={cn("block space-y-1.5", className)}><span className="text-sm font-medium text-foreground">{label}</span>{children}</label>;
}
export const selectCls = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
export function Initials({ name, className }: { name: string; className?: string | undefined }) {
  const i = name.split(" ").map((p) => p[0]).slice(0, 2).join("");
  return <span className={cn("inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-info-soft text-xs font-bold text-info", className)}>{i}</span>;
}
