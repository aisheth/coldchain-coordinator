import { createFileRoute } from "@tanstack/react-router";
import { Card, PageHeader } from "@/components/app/ui";
import { useStore } from "@/lib/store";
import { meta } from "@/lib/seo";

export const Route = createFileRoute("/catalogue")({ head: () => meta("Item catalogue", "Master list of cold storage installation materials and sizes."), component: Catalogue });

function Catalogue() {
  const { state } = useStore();
  const cats = [...new Set(state.catalogue.map((c) => c.category))];
  return (
    <>
      <PageHeader title="Item catalogue" subtitle={`${state.catalogue.length} items across ${cats.length} categories`} />
      <div className="space-y-6">
        {cats.map((c) => (
          <Card key={c}>
            <div className="border-b px-5 py-3"><h2 className="font-semibold">{c}</h2></div>
            <div className="divide-y">
              {state.catalogue.filter((i) => i.category === c).map((i) => (
                <div key={i.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                  <div><p className="text-sm font-medium">{i.name}</p><p className="text-xs text-muted-foreground">Unit: {i.unit}</p></div>
                  <div className="flex flex-wrap gap-1.5">{i.variants.map((v) => <span key={v.id} className="rounded-md bg-secondary px-2 py-0.5 text-xs">{v.label}</span>)}</div>
                </div>))}
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
