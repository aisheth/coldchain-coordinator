import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Card, PageHeader } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
import { meta } from "@/lib/seo";

export const Route = createFileRoute("/settings")({ head: () => meta("Settings", "Business and prototype settings."), component: Settings });

function Settings() {
  const { reset } = useStore();
  return (
    <>
      <PageHeader title="Settings" />
      <Card className="max-w-xl p-5">
        <h2 className="font-semibold">Sample data</h2>
        <p className="mt-1 text-sm text-muted-foreground">This prototype saves data in this browser. Reset to restore the original sample projects, workers and tasks.</p>
        <Button variant="destructive" className="mt-4" onClick={() => { reset(); toast.success("Sample data restored"); }}>Reset sample data</Button>
      </Card>
    </>
  );
}
