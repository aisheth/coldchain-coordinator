import { ImportLink } from "@/components/app/ImportLink";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Boxes, LoaderCircle, Plus, RefreshCw } from "lucide-react";
import { AddItemDialog, AddVariantDialog } from "@/components/app/CatalogueForms";
import { Card, PageHeader } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
import { meta } from "@/lib/seo";

export const Route = createFileRoute("/catalogue")({
  head: () =>
    meta("Item catalogue", "Master list of cold storage installation materials and sizes."),
  component: Catalogue,
});

function Catalogue() {
  const { state, catalogueOptionsLoading, catalogueOptionsError, loadCatalogueOptions } =
    useStore();
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [variantItemId, setVariantItemId] = useState<string | null>(null);
  const variantItem = state.catalogue.find((item) => item.id === variantItemId) ?? null;
  const cats = [...new Set(state.catalogue.map((item) => item.category))];

  useEffect(() => {
    void loadCatalogueOptions();
  }, [loadCatalogueOptions]);

  return (
    <>
      <PageHeader
        title="Item catalogue"
        subtitle={`${state.catalogue.length} items across ${cats.length} categories`}
        actions={
          <div className="flex gap-2">
            <ImportLink area="items" />
            <Button onClick={() => setAddItemOpen(true)}>
              <Plus className="h-4 w-4" />
              Add item
            </Button>
          </div>
        }
      />

      {catalogueOptionsLoading && (
        <Card className="mb-4 flex items-center gap-2 p-3 text-sm text-muted-foreground">
          <LoaderCircle className="h-4 w-4 animate-spin text-primary" />
          Loading categories, sizes and units…
        </Card>
      )}
      {catalogueOptionsError && (
        <Card className="mb-4 flex flex-wrap items-center justify-between gap-3 border-danger/30 bg-danger-soft p-4">
          <p role="alert" className="text-sm text-danger">
            Catalogue options could not be loaded: {catalogueOptionsError}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadCatalogueOptions()}
            disabled={catalogueOptionsLoading}
          >
            <RefreshCw className="h-4 w-4" />
            Try again
          </Button>
        </Card>
      )}

      {state.catalogue.length === 0 ? (
        <Card className="flex flex-col items-center px-6 py-16 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-info-soft text-info">
            <Boxes className="h-6 w-6" />
          </span>
          <h2 className="mt-4 text-lg font-semibold">No catalogue items yet</h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Add your first material, then create variants for its sizes and units. It will then be
            available when building procurement lists.
          </p>
          <Button className="mt-5" onClick={() => setAddItemOpen(true)}>
            <Plus className="h-4 w-4" />
            Add the first item
          </Button>
        </Card>
      ) : (
        <div className="space-y-6">
          {cats.map((category) => (
            <Card key={category}>
              <div className="border-b px-5 py-3">
                <h2 className="font-semibold">{category}</h2>
              </div>
              <div className="divide-y">
                {state.catalogue
                  .filter((item) => item.category === category)
                  .map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
                    >
                      <div className="min-w-40">
                        <p className="text-sm font-medium">{item.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.variants.length
                            ? `${item.variants.length} variant${item.variants.length === 1 ? "" : "s"} · Unit: ${item.unit}`
                            : "No variants yet"}
                        </p>
                      </div>
                      <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                        {item.variants.map((variant) => (
                          <span
                            key={variant.id}
                            className="rounded-md bg-secondary px-2 py-0.5 text-xs"
                          >
                            {variant.label}
                          </span>
                        ))}
                      </div>
                      <Button variant="outline" size="sm" onClick={() => setVariantItemId(item.id)}>
                        <Plus className="h-4 w-4" />
                        Add variant
                      </Button>
                    </div>
                  ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      {addItemOpen && (
        <AddItemDialog
          onClose={() => setAddItemOpen(false)}
          onCreated={(item) => {
            setAddItemOpen(false);
            setVariantItemId(item.id);
          }}
        />
      )}
      {variantItem && (
        <AddVariantDialog item={variantItem} onClose={() => setVariantItemId(null)} />
      )}
    </>
  );
}
