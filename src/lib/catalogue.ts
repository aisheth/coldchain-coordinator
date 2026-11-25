export interface CatalogueItemDraft {
  name: string;
  categoryId: string;
  description: string;
}

export interface CatalogueVariantDraft {
  sizeOptionId: string;
  uomId: string;
  sku: string;
  description: string;
}

export interface UomDraft {
  code: string;
  name: string;
  symbol: string;
  allowsDecimal: boolean;
}

export function catalogueItemError(draft: CatalogueItemDraft) {
  if (!draft.name.trim()) return "Enter an item name.";
  if (draft.name.trim().length > 200) return "Item names must be 200 characters or fewer.";
  return "";
}

export function catalogueVariantError(draft: CatalogueVariantDraft) {
  if (!draft.uomId) return "Select or create a unit of measurement.";
  if (draft.sku.trim().length > 60) return "SKUs must be 60 characters or fewer.";
  return "";
}

export function categoryError(name: string) {
  if (!name.trim()) return "Enter a category name.";
  if (name.trim().length > 100) return "Category names must be 100 characters or fewer.";
  return "";
}

export function sizeOptionError(label: string) {
  if (!label.trim()) return "Enter a size label.";
  if (label.trim().length > 60) return "Size labels must be 60 characters or fewer.";
  return "";
}

export function uomError(draft: UomDraft) {
  if (!draft.code.trim() || !draft.name.trim() || !draft.symbol.trim())
    return "Enter the unit code, name and symbol.";
  if (draft.code.trim().length > 30) return "Unit codes must be 30 characters or fewer.";
  if (draft.symbol.trim().length > 15) return "Unit symbols must be 15 characters or fewer.";
  return "";
}
