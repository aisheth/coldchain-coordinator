import type { CatalogueItem, MaterialLine } from "./types";

export const lineKey = (itemId: string, variantId: string) => `${itemId}::${variantId}`;

/** Variants of an item still selectable: excludes those already in the current list. */
export function availableVariants(item: CatalogueItem | undefined, list: MaterialLine[]) {
  if (!item) return [];
  const taken = new Set(list.map((l) => lineKey(l.itemId, l.variantId)));
  return item.variants.filter((v) => !taken.has(lineKey(item.id, v.id)));
}

/** Items that still have at least one selectable variant. */
export function availableItems(catalogue: CatalogueItem[], list: MaterialLine[]) {
  return catalogue.filter((i) => availableVariants(i, list).length > 0);
}

export function describeLine(catalogue: CatalogueItem[], l: MaterialLine) {
  const item = catalogue.find((i) => i.id === l.itemId);
  const variant = item?.variants.find((v) => v.id === l.variantId);
  return { name: item?.name ?? "Unknown item", spec: variant?.label ?? "-", unit: item?.unit ?? "", category: item?.category ?? "" };
}
