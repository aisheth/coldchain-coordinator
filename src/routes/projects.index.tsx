import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, MapPin, Calendar, Search } from "lucide-react";
import { toast } from "sonner";
import { Card, PageHeader, ProjectStatusPill } from "@/components/app/ui";
import { ProjectForm } from "@/components/app/ProjectForm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStore, fmtDate } from "@/lib/store";
import { meta } from "@/lib/seo";

export const Route = createFileRoute("/projects/")({
  head: () => meta("Projects", "Customer cold storage orders, sites and deployment dates."),
  component: Projects,
});

function Projects() {
  const { state, addProject } = useStore();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const nav = useNavigate();
  const list = state.projects.filter((p) =>
    `${p.ref} ${p.name} ${p.customer}`.toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <>
      <PageHeader
        title="Projects"
        subtitle="Customer orders and installation sites."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" />
            New project
          </Button>
        }
      />
      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search projects or customers"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {list.map((p) => {
          const n = state.tasks.filter((t) => t.projectId === p.id).length;
          return (
            <Link key={p.id} to="/projects/$id" params={{ id: p.id }}>
              <Card className="h-full p-5 transition-shadow hover:shadow-lg">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs font-semibold text-muted-foreground">{p.ref}</span>
                  <ProjectStatusPill status={p.status} />
                </div>
                <h3 className="mt-2 text-lg font-semibold">{p.name}</h3>
                <p className="text-sm text-muted-foreground">{p.customer}</p>
                <div className="mt-4 space-y-1.5 text-xs text-muted-foreground">
                  <p className="flex items-center gap-2">
                    <MapPin className="h-3.5 w-3.5" />
                    {p.address}
                  </p>
                  <p className="flex items-center gap-2">
                    <Calendar className="h-3.5 w-3.5" />
                    Deploy by {fmtDate(p.deploymentDate)}
                  </p>
                </div>
                <p className="mt-4 border-t pt-3 text-xs font-medium">
                  {n} procurement task{n === 1 ? "" : "s"}
                </p>
              </Card>
            </Link>
          );
        })}
      </div>
      {open && (
        <ProjectForm
          open={open}
          onOpenChange={setOpen}
          onSave={async (d) => {
            const p = await addProject(d);
            setOpen(false);
            toast.success("Project created");
            await nav({ to: "/projects/$id", params: { id: p.id } });
          }}
        />
      )}
    </>
  );
}
