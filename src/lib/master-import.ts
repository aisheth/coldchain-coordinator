import Papa from "papaparse";
import type {
  ApiCategory,
  ApiCustomer,
  ApiItem,
  ApiSizeOption,
  ApiUom,
  ApiUser,
  ApiVendor,
} from "./api-types";
import { errorMessage } from "./api";

export const importDefinitions = {
  items: { label: "Items", columns: ["name", "category", "description"], required: ["name"] },
  variants: {
    label: "Item variants",
    columns: ["item", "size", "uom", "sku", "description"],
    required: ["item", "uom"],
  },
  vendors: {
    label: "Vendors",
    columns: ["name", "contact_person", "phone", "address"],
    required: ["name"],
  },
  customers: {
    label: "Customers",
    columns: ["name", "contact_person", "phone", "email", "address"],
    required: ["name"],
  },
  workers: {
    label: "Worker accounts",
    columns: ["username", "name", "phone", "email"],
    required: ["username", "name"],
  },
  categories: { label: "Catalogue categories", columns: ["name"], required: ["name"] },
  sizes: { label: "Size options", columns: ["label"], required: ["label"] },
  uoms: {
    label: "Units of measurement",
    columns: ["code", "name", "symbol", "allows_decimal"],
    required: ["code", "name", "symbol", "allows_decimal"],
  },
} as const;
export type ImportKind = keyof typeof importDefinitions;
export interface ImportContext {
  items: ApiItem[];
  vendors: ApiVendor[];
  customers: ApiCustomer[];
  users: ApiUser[];
  categories: ApiCategory[];
  sizes: ApiSizeOption[];
  uoms: ApiUom[];
}
export interface ImportRow {
  record: number;
  values: Record<string, string>;
  errors: string[];
  status: "ready" | "invalid" | "saved" | "failed" | "uncertain";
  message: string;
}
export const normalize = (value: string) => value.trim().toLowerCase();
function matches<T>(rows: T[], get: (row: T) => string, value: string) {
  return rows.filter((row) => normalize(get(row)) === normalize(value));
}
export function previewCsv(text: string, kind: ImportKind, context: ImportContext): ImportRow[] {
  if (new Blob([text]).size > 2_000_000) throw new Error("CSV exceeds the 2 MB limit.");
  const parsed = Papa.parse<string[]>(text.replace(/^\uFEFF/, ""), {
    skipEmptyLines: "greedy",
    dynamicTyping: false,
  });
  const parseError = parsed.errors.find((issue) => issue.code !== "UndetectableDelimiter");
  if (parseError) throw new Error(parseError.message);
  const [header, ...rows] = parsed.data;
  if (!header?.length) throw new Error("CSV needs a header row.");
  const headings = header.map(normalize);
  const def = importDefinitions[kind];
  if (new Set(headings).size !== headings.length)
    throw new Error("Repeated column headers are not allowed.");
  const expected: readonly string[] = def.columns;
  const missing = def.required.filter((key) => !headings.includes(key));
  const unknown = headings.filter((key) => !expected.includes(key));
  if (missing.length || unknown.length)
    throw new Error(
      `Header errors: ${missing.length ? `missing ${missing.join(", ")}. ` : ""}${unknown.length ? `unknown ${unknown.join(", ")}.` : ""}`,
    );
  if (!rows.length) throw new Error("CSV contains no data rows.");
  if (rows.length > 1000)
    throw new Error("CSV exceeds the 1,000-row limit. Split it into smaller files.");
  const seen = new Set<string>();
  return rows.map((cells, index) => {
    const values = Object.fromEntries(
      expected.map((field) => [field, cells[headings.indexOf(field)]?.trim() ?? ""]),
    );
    const errors =
      cells.length !== header.length
        ? [`Expected ${header.length} columns, found ${cells.length}.`]
        : [];
    for (const field of def.required) if (!values[field]) errors.push(`${field} is required.`);
    const v = (key: string) => values[key] ?? "";
    const max = (key: string, limit: number) => {
      if (v(key).length > limit) errors.push(`${key} must be at most ${limit} characters.`);
    };
    let duplicate = false;
    let key = normalize(v("name") || v("label") || v("code") || v("username"));
    if (kind === "items") {
      max("name", 200);
      duplicate = matches(context.items, (item) => item.name, v("name")).length > 0;
      if (
        v("category") &&
        matches(
          context.categories.filter((x) => x.is_active),
          (x) => x.name,
          v("category"),
        ).length !== 1
      )
        errors.push("category must match exactly one active saved category.");
    } else if (kind === "variants") {
      const item = matches(
        context.items.filter((x) => x.is_active),
        (x) => x.name,
        v("item"),
      );
      const uom = matches(context.uoms, (x) => x.code, v("uom"));
      const size = matches(
        context.sizes.filter((x) => x.is_active),
        (x) => x.label,
        v("size"),
      );
      if (item.length !== 1) errors.push("item must match exactly one active saved item.");
      if (uom.length !== 1) errors.push("uom must match exactly one saved UOM code.");
      if (v("size") && size.length !== 1)
        errors.push("size must match exactly one active saved size label.");
      max("sku", 60);
      key = [v("item"), v("size"), v("uom")].map(normalize).join("|");
      duplicate = Boolean(
        item[0]?.variants.some(
          (x) => x.uom_id === uom[0]?.id && x.size_option_id === (size[0]?.id ?? null),
        ),
      );
      if (
        v("sku") &&
        context.items.some((x) =>
          x.variants.some((variant) => normalize(variant.sku ?? "") === normalize(v("sku"))),
        )
      )
        errors.push("sku already exists.");
      if (v("sku") && seen.has(`sku:${normalize(v("sku"))}`))
        errors.push("Duplicate sku in this CSV.");
      if (v("sku")) seen.add(`sku:${normalize(v("sku"))}`);
    } else if (kind === "vendors")
      duplicate = matches(context.vendors, (x) => x.name, v("name")).length > 0;
    else if (kind === "customers")
      duplicate = matches(context.customers, (x) => x.name, v("name")).length > 0;
    else if (kind === "workers") {
      key = normalize(v("username"));
      max("name", 200);
      max("username", 50);
      if (!/^[A-Za-z0-9._-]{3,50}$/.test(v("username")))
        errors.push("username needs 3–50 letters, numbers, dots, underscores or hyphens.");
      duplicate = matches(context.users, (x) => x.username, v("username")).length > 0;
      if (
        v("email") &&
        context.users.some((x) => normalize(x.email ?? "") === normalize(v("email")))
      )
        errors.push("email already belongs to a user.");
      if (v("email") && seen.has(`email:${normalize(v("email"))}`))
        errors.push("Duplicate email in this CSV.");
      if (v("email")) seen.add(`email:${normalize(v("email"))}`);
    } else if (kind === "categories") {
      max("name", 100);
      duplicate = matches(context.categories, (x) => x.name, v("name")).length > 0;
    } else if (kind === "sizes") {
      max("label", 60);
      duplicate = matches(context.sizes, (x) => x.label, v("label")).length > 0;
    } else if (kind === "uoms") {
      max("code", 30);
      max("symbol", 15);
      if (!["true", "false"].includes(v("allows_decimal")))
        errors.push("allows_decimal must be true or false.");
      duplicate = matches(context.uoms, (x) => x.code, v("code")).length > 0;
    }
    if (v("email") && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v("email")))
      errors.push("email is invalid.");
    if (duplicate) errors.push("Duplicate: already exists in saved data (not overwritten).");
    if (seen.has(key)) errors.push("Duplicate row in this CSV.");
    seen.add(key);
    return {
      record: index + 2,
      values,
      errors,
      status: errors.length ? "invalid" : "ready",
      message: "",
    };
  });
}
export function templateCsv(kind: ImportKind) {
  return Papa.unparse([Array.from(importDefinitions[kind].columns)]) + "\r\n";
}
export function rowsCsv(rows: ImportRow[], kind: ImportKind) {
  return Papa.unparse(
    {
      fields: [...importDefinitions[kind].columns, "record", "status", "result"],
      data: rows.map((row) => [
        ...importDefinitions[kind].columns.map((key) => row.values[key] ?? ""),
        String(row.record),
        row.status,
        row.errors.join("; ") || row.message,
      ]),
    },
    { escapeFormulae: true },
  );
}
export async function importRows(
  rows: ImportRow[],
  write: (row: ImportRow) => Promise<void>,
  progress: (rows: ImportRow[]) => void,
): Promise<ImportRow[]> {
  const results = rows.map((row) => ({ ...row }));
  for (const row of results) {
    if (row.status !== "ready" || row.errors.length) continue;
    try {
      await write(row);
      row.status = "saved";
      row.message = "Saved successfully.";
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? error.code : "";
      row.status =
        code === "network_error" ||
        (error &&
          typeof error === "object" &&
          "status" in error &&
          typeof error.status === "number" &&
          error.status >= 500)
          ? "uncertain"
          : "failed";
      row.message = `${errorMessage(error)}${row.status === "uncertain" ? " Save outcome unknown. Refresh and check saved data before retrying." : ""}`;
    }
    progress(results.map((entry) => ({ ...entry })));
  }
  return results;
}
