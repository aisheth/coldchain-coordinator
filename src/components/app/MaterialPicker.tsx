import { useMemo, useRef, useState } from "react";
import { Plus, Trash2, Search, Check, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, selectCls } from "./ui";
import { availableItems, availableVariants, describeLine, lineKey } from "@/lib/procurement";
import type { CatalogueItem, MaterialLine } from "@/lib/types";

interface PickerInput {
  category: string;
  q: string;
  itemId: string;
  variantId: string;
  qty: string;
  remarks: string;
  editing: string | null;
}
export function MaterialPicker({
  catalogue,
  list,
  onChange,
  input,
  onInputChange,
}: {
  catalogue: CatalogueItem[];
  list: MaterialLine[];
  onChange: (l: MaterialLine[]) => void;
  input?: PickerInput;
  onInputChange?: (input: PickerInput) => void;
}) {
  const [local, setLocal] = useState<PickerInput>({
    category: "",
    q: "",
    itemId: "",
    variantId: "",
    qty: "1",
    remarks: "",
    editing: null,
  });
  const current = input ?? local;
  const inputRef = useRef(current);
  inputRef.current = current;
  const { category, q, itemId, variantId, qty, remarks, editing } = current;
  const change = <K extends keyof PickerInput>(key: K, value: PickerInput[K]) => {
    const next = { ...inputRef.current, [key]: value };
    // Keep the same object current across multiple setters in one event.
    inputRef.current = next;
    if (onInputChange) onInputChange(next);
    else setLocal(next);
  };
  const setCategory = (value: string) => change("category", value);
  const setQ = (value: string) => change("q", value);
  const setItemId = (value: string) => change("itemId", value);
  const setVariantId = (value: string) => change("variantId", value);
  const setQty = (value: string) => change("qty", value);
  const setRemarks = (value: string) => change("remarks", value);
  const setEditing = (value: string | null) => change("editing", value);

  const categories = useMemo(() => [...new Set(catalogue.map((c) => c.category))], [catalogue]);
  const items = availableItems(catalogue, list).filter(
    (i) => (!category || i.category === category) && i.name.toLowerCase().includes(q.toLowerCase()),
  );
  const item = catalogue.find((i) => i.id === itemId);
  const variants = availableVariants(item, list);
  const validItem = items.some((i) => i.id === itemId);
  const validVariant = variants.some((v) => v.id === variantId);

  const add = () => {
    if (!validItem || !validVariant || Number(qty) <= 0) return;
    const next = [...list, { itemId, variantId, qty: Number(qty), remarks: remarks || undefined }];
    onChange(next);
    setVariantId("");
    setQty("1");
    setRemarks("");
    if (availableVariants(item, next).length === 0) setItemId("");
  };
  const update = (k: string, patch: Partial<MaterialLine>) =>
    onChange(list.map((l) => (lineKey(l.itemId, l.variantId) === k ? { ...l, ...patch } : l)));

  return (
    <div className="space-y-5">
      <div className="grid gap-3 rounded-lg border bg-muted/40 p-4 md:grid-cols-12">
        <Field label="Category" className="md:col-span-3">
          <select
            className={selectCls}
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setItemId("");
              setVariantId("");
            }}
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Search item" className="md:col-span-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="e.g. copper"
            />
          </div>
        </Field>
        <Field label="Item" className="md:col-span-3">
          <select
            className={selectCls}
            value={validItem ? itemId : ""}
            onChange={(e) => {
              setItemId(e.target.value);
              setVariantId("");
            }}
            aria-label="Item"
          >
            <option value="">{items.length ? "Select item" : "No items match"}</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Size / specification" className="md:col-span-3">
          <select
            className={selectCls}
            value={validVariant ? variantId : ""}
            onChange={(e) => setVariantId(e.target.value)}
            disabled={!validItem}
            aria-label="Specification"
          >
            <option value="">Select size</option>
            {variants.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label={`Quantity${item ? ` (${item.unit})` : ""}`} className="md:col-span-2">
          <Input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} />
        </Field>
        <Field label="Remarks (optional)" className="md:col-span-7">
          <Input
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="Brand, grade, notes for worker"
          />
        </Field>
        <div className="flex items-end md:col-span-3">
          <Button
            className="w-full"
            onClick={add}
            disabled={!validItem || !validVariant || Number(qty) <= 0}
          >
            <Plus className="h-4 w-4" />
            Add to list
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5">Item</th>
              <th className="px-4 py-2.5">Specification</th>
              <th className="px-4 py-2.5">Qty</th>
              <th className="px-4 py-2.5">Unit</th>
              <th className="px-4 py-2.5">Remarks</th>
              <th className="px-4 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {list.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  No materials added yet.
                </td>
              </tr>
            )}
            {list.map((l) => {
              const k = lineKey(l.itemId, l.variantId);
              const d = describeLine(catalogue, l);
              const on = editing === k;
              return (
                <tr key={k}>
                  <td className="px-4 py-2.5 font-medium">{d.name}</td>
                  <td className="px-4 py-2.5">{d.spec}</td>
                  <td className="px-4 py-2.5">
                    {on ? (
                      <Input
                        type="number"
                        min={1}
                        className="h-8 w-20"
                        value={l.qty}
                        onChange={(e) => update(k, { qty: Math.max(1, Number(e.target.value)) })}
                      />
                    ) : (
                      l.qty
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{d.unit}</td>
                  <td className="px-4 py-2.5">
                    {on ? (
                      <Input
                        className="h-8"
                        value={l.remarks ?? ""}
                        onChange={(e) => update(k, { remarks: e.target.value })}
                      />
                    ) : (
                      <span className="text-muted-foreground">{l.remarks || "—"}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Edit"
                      onClick={() => setEditing(on ? null : k)}
                    >
                      {on ? <Check className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Remove"
                      onClick={() =>
                        onChange(list.filter((x) => lineKey(x.itemId, x.variantId) !== k))
                      }
                    >
                      <Trash2 className="h-4 w-4 text-danger" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
