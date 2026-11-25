import { useDraft, draftField } from "@/lib/drafts";
import { DraftNotice } from "@/components/app/DraftNotice";
import { useState, type FormEvent } from "react";
import { LoaderCircle, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, selectCls } from "@/components/app/ui";
import { errorMessage } from "@/lib/api";
import {
  catalogueItemError,
  catalogueVariantError,
  categoryError,
  sizeOptionError,
  uomError,
} from "@/lib/catalogue";
import { useStore } from "@/lib/store";
import type { CatalogueItem } from "@/lib/types";

const NEW_OPTION = "__new";
const blankUom = { code: "", name: "", symbol: "", allowsDecimal: false };

export function AddItemDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (item: CatalogueItem) => void;
}) {
  const {
    user,
    catalogueOptions,
    catalogueOptionsLoading,
    addCatalogueCategory,
    addCatalogueItem,
  } = useStore();
  const draft = useDraft(user, "catalogue:item:new", {
    name: "",
    categoryId: "",
    categoryName: "",
    description: "",
  });
  const [name, setName] = draftField(draft, "name");
  const [categoryId, setCategoryId] = draftField(draft, "categoryId");
  const [categoryName, setCategoryName] = draftField(draft, "categoryName");
  const [description, setDescription] = draftField(draft, "description");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    const validation =
      catalogueItemError({ name, categoryId, description }) ||
      (categoryId === NEW_OPTION ? categoryError(categoryName) : "");
    if (validation) {
      setError(validation);
      return;
    }
    setBusy(true);
    setError("");
    let categorySaved = false;
    try {
      let resolvedCategoryId = categoryId;
      if (categoryId === NEW_OPTION) {
        const category = await addCatalogueCategory(categoryName);
        resolvedCategoryId = category.id;
        setCategoryId(category.id);
        setCategoryName("");
        categorySaved = true;
      }
      const item = await addCatalogueItem({
        name,
        categoryId: resolvedCategoryId === NEW_OPTION ? "" : resolvedCategoryId,
        description,
      });
      draft.clear();
      toast.success(`${item.name} added to the catalogue`);
      onCreated(item);
    } catch (err) {
      setError(
        `${categorySaved ? "The category was saved, but the item was not created. " : ""}${errorMessage(err)}`,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add catalogue item</DialogTitle>
          <DialogDescription>
            Create the item first, then add one variant for each size and unit.
          </DialogDescription>
        </DialogHeader>
        <DraftNotice draft={draft} />
        <form className="space-y-4" onSubmit={(event) => void submit(event)}>
          <fieldset disabled={draft.pending || busy} className="space-y-4">
            <Field label="Item name">
              <Input
                autoFocus
                maxLength={200}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Refrigeration pipe"
              />
            </Field>
            <Field label="Category">
              <select
                aria-label="Category"
                className={selectCls}
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
                disabled={catalogueOptionsLoading || busy}
              >
                <option value="">Uncategorised</option>
                {catalogueOptions.categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
                <option value={NEW_OPTION}>+ Create a new category</option>
              </select>
            </Field>
            {categoryId === NEW_OPTION && (
              <Field label="New category name">
                <Input
                  maxLength={100}
                  value={categoryName}
                  onChange={(event) => setCategoryName(event.target.value)}
                  placeholder="e.g. Refrigeration"
                />
              </Field>
            )}
            <Field label="Description (optional)">
              <Textarea
                rows={3}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="What this material is used for"
              />
            </Field>
            {error && (
              <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || catalogueOptionsLoading}>
                {busy ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                {busy ? "Saving item…" : "Save item & add variant"}
              </Button>
            </DialogFooter>
          </fieldset>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AddVariantDialog({ item, onClose }: { item: CatalogueItem; onClose: () => void }) {
  const {
    user,
    catalogueOptions,
    catalogueOptionsLoading,
    catalogueOptionsError,
    loadCatalogueOptions,
    addCatalogueSizeOption,
    addCatalogueUom,
    addCatalogueVariant,
  } = useStore();
  const draft = useDraft(user, `catalogue:variant:${item.id}`, {
    sizeOptionId: "",
    sizeLabel: "",
    uomId: catalogueOptions.uoms[0]?.id ?? NEW_OPTION,
    newUom: blankUom,
    sku: "",
    description: "",
  });
  const [sizeOptionId, setSizeOptionId] = draftField(draft, "sizeOptionId");
  const [sizeLabel, setSizeLabel] = draftField(draft, "sizeLabel");
  const [uomId, setUomId] = draftField(draft, "uomId");
  const [newUom, setNewUom] = draftField(draft, "newUom");
  const [sku, setSku] = draftField(draft, "sku");
  const [description, setDescription] = draftField(draft, "description");
  const [addedCount, setAddedCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    const validation =
      catalogueVariantError({
        sizeOptionId,
        uomId: uomId === NEW_OPTION ? "new-unit" : uomId,
        sku,
        description,
      }) ||
      (sizeOptionId === NEW_OPTION ? sizeOptionError(sizeLabel) : "") ||
      (uomId === NEW_OPTION ? uomError(newUom) : "");
    if (validation) {
      setError(validation);
      return;
    }
    setBusy(true);
    setError("");
    let referenceSaved = false;
    try {
      let resolvedSizeId = sizeOptionId;
      let resolvedUomId = uomId;
      if (sizeOptionId === NEW_OPTION) {
        const size = await addCatalogueSizeOption(sizeLabel);
        resolvedSizeId = size.id;
        setSizeOptionId(size.id);
        setSizeLabel("");
        referenceSaved = true;
      }
      if (uomId === NEW_OPTION) {
        const uom = await addCatalogueUom(newUom);
        resolvedUomId = uom.id;
        setUomId(uom.id);
        setNewUom(blankUom);
        referenceSaved = true;
      }
      await addCatalogueVariant(item.id, {
        sizeOptionId: resolvedSizeId === NEW_OPTION ? "" : resolvedSizeId,
        uomId: resolvedUomId,
        sku,
        description,
      });
      setAddedCount((count) => count + 1);
      draft.clear();
      toast.success(`Variant added to ${item.name}`);
    } catch (err) {
      setError(
        `${referenceSaved ? "The new size or unit was saved, but the variant was not added. " : ""}${errorMessage(err)}`,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add variant to {item.name}</DialogTitle>
          <DialogDescription>
            A size is optional. Every variant needs its own unit of measurement.
          </DialogDescription>
        </DialogHeader>
        {catalogueOptionsError && (
          <div className="rounded-lg bg-danger-soft p-3 text-sm text-danger">
            <p role="alert">
              Saved categories, sizes and units could not be loaded: {catalogueOptionsError}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => void loadCatalogueOptions()}
              disabled={catalogueOptionsLoading}
            >
              Try loading them again
            </Button>
          </div>
        )}
        <DraftNotice draft={draft} />
        <form className="space-y-4" onSubmit={(event) => void submit(event)}>
          <fieldset disabled={draft.pending || busy} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Size / specification">
                <select
                  aria-label="Size / specification"
                  className={selectCls}
                  value={sizeOptionId}
                  onChange={(event) => setSizeOptionId(event.target.value)}
                  disabled={catalogueOptionsLoading || busy}
                >
                  <option value="">Standard — no size</option>
                  {catalogueOptions.sizeOptions.map((size) => (
                    <option key={size.id} value={size.id}>
                      {size.label}
                    </option>
                  ))}
                  <option value={NEW_OPTION}>+ Create a new size</option>
                </select>
              </Field>
              <Field label="Unit of measurement">
                <select
                  aria-label="Unit of measurement"
                  className={selectCls}
                  value={uomId}
                  onChange={(event) => setUomId(event.target.value)}
                  disabled={catalogueOptionsLoading || busy}
                >
                  <option value="">Select a unit</option>
                  {catalogueOptions.uoms.map((uom) => (
                    <option key={uom.id} value={uom.id}>
                      {uom.name} ({uom.symbol})
                    </option>
                  ))}
                  <option value={NEW_OPTION}>+ Create a new unit</option>
                </select>
              </Field>
            </div>
            {sizeOptionId === NEW_OPTION && (
              <Field label="New size label">
                <Input
                  maxLength={60}
                  value={sizeLabel}
                  onChange={(event) => setSizeLabel(event.target.value)}
                  placeholder="e.g. 1 metre or 10 mm"
                />
              </Field>
            )}
            {uomId === NEW_OPTION && (
              <div className="space-y-3 rounded-lg border p-4">
                <p className="text-sm font-medium">New unit of measurement</p>
                <div className="grid gap-3 md:grid-cols-3">
                  <Field label="Code">
                    <Input
                      maxLength={30}
                      value={newUom.code}
                      onChange={(event) => setNewUom({ ...newUom, code: event.target.value })}
                      placeholder="MTR"
                    />
                  </Field>
                  <Field label="Name">
                    <Input
                      value={newUom.name}
                      onChange={(event) => setNewUom({ ...newUom, name: event.target.value })}
                      placeholder="Metre"
                    />
                  </Field>
                  <Field label="Symbol">
                    <Input
                      maxLength={15}
                      value={newUom.symbol}
                      onChange={(event) => setNewUom({ ...newUom, symbol: event.target.value })}
                      placeholder="m"
                    />
                  </Field>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-primary"
                    checked={newUom.allowsDecimal}
                    onChange={(event) =>
                      setNewUom({ ...newUom, allowsDecimal: event.target.checked })
                    }
                  />
                  Allow decimal quantities
                </label>
              </div>
            )}
            <Field label="SKU (optional)">
              <Input
                maxLength={60}
                value={sku}
                onChange={(event) => setSku(event.target.value)}
                placeholder="Supplier or internal SKU"
              />
            </Field>
            <Field label="Variant description (optional)">
              <Textarea
                rows={2}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>
            {addedCount > 0 && !error && (
              <p className="rounded-lg bg-success-soft p-3 text-sm text-success" aria-live="polite">
                {addedCount} variant{addedCount === 1 ? "" : "s"} added. You can add another or
                close this window.
              </p>
            )}
            {error && (
              <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
                Done
              </Button>
              <Button type="submit" disabled={busy || catalogueOptionsLoading}>
                {busy ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                {busy ? "Saving variant…" : addedCount ? "Add another variant" : "Add variant"}
              </Button>
            </DialogFooter>
          </fieldset>
        </form>
      </DialogContent>
    </Dialog>
  );
}
