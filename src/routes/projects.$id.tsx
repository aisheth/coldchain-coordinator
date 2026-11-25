import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Pencil, Plus, Phone, MapPin, Calendar, User } from "lucide-react";
import { toast } from "sonner";
import { Card, ProjectStatusPill, TaskStatusPill } from "@/components/app/ui";
import { ProjectForm } from "@/components/app/ProjectForm";
import { Button } from "@/components/ui/button";
import { useStore, fmtDate } from "@/lib/store";
import { meta } from "@/lib/seo";

export const Route = createFileRoute("/projects/$id")({
  head: () => meta("Project details", "Project site, customer and procurement tasks."),
  component: ProjectPage,
});

function ProjectPage() {
  const { id } = Route.useParams();
  const { state, updateProject } = useStore();
  const [edit, setEdit] = useState(false);
  const p = state.projects.find((x) => x.id === id);
  if (!p)
    return (
      <p className="text-muted-foreground">
        Project not found.{" "}
        <Link to="/projects" className="text-primary">
          Back to projects
        </Link>
      </p>
    );
  const tasks = state.tasks.filter((t) => t.projectId === p.id);
  return (
    <>
      <Link
        to="/projects"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Projects
      </Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-muted-foreground">{p.ref}</p>
          <h1 className="text-2xl font-semibold">{p.name}</h1>
          <div className="mt-2">
            <ProjectStatusPill status={p.status} />
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setEdit(true)}>
            <Pencil className="h-4 w-4" />
            Edit
          </Button>
          <Button asChild>
            <Link to="/procurement/new" search={{ project: p.id }}>
              <Plus className="h-4 w-4" />
              Procurement task
            </Link>
          </Button>
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="space-y-3 p-5 text-sm">
          <h2 className="font-semibold">Customer & site</h2>
          <p className="flex gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            {p.customer} · {p.contact}
          </p>
          <p className="flex gap-2">
            <Phone className="h-4 w-4 text-muted-foreground" />
            {p.phone || "—"}
          </p>
          <p className="flex gap-2">
            <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
            {p.address}
          </p>
          <p className="flex gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            Deploy by {fmtDate(p.deploymentDate)}
          </p>
          {p.description && <p className="border-t pt-3 text-muted-foreground">{p.description}</p>}
        </Card>
        <Card className="lg:col-span-2">
          <div className="border-b px-5 py-4">
            <h2 className="font-semibold">Procurement tasks</h2>
          </div>
          {tasks.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">
              No procurement tasks yet. Create one to prepare the material list.
            </p>
          ) : (
            <div className="divide-y">
              {tasks.map((t) => (
                <Link
                  key={t.id}
                  to="/tasks/$id"
                  params={{ id: t.id }}
                  className="flex items-center justify-between gap-2 px-5 py-3 hover:bg-muted/50"
                >
                  <div>
                    <p className="text-sm font-semibold">{t.ref}</p>
                    <p className="text-xs text-muted-foreground">
                      {state.workers.find((w) => w.id === t.workerId)?.name} · {t.materials.length}{" "}
                      items · due {fmtDate(t.dueDate)}
                    </p>
                  </div>
                  <TaskStatusPill status={t.status} />
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>
      <ProjectForm
        open={edit}
        onOpenChange={setEdit}
        initial={p}
        entityId={p.id}
        onSave={async (d) => {
          await updateProject(p.id, d);
          setEdit(false);
          toast.success("Project updated");
        }}
      />
    </>
  );
}
