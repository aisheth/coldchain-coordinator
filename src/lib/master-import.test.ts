import { describe, expect, it, vi } from "vitest";
import { ApiError } from "./api";
import {
  importDefinitions,
  importRows,
  previewCsv,
  templateCsv,
  type ImportContext,
  type ImportKind,
} from "./master-import";
const empty: ImportContext = {
  items: [],
  vendors: [],
  customers: [],
  users: [],
  categories: [],
  sizes: [],
  uoms: [],
};
describe("CSV master data review", () => {
  it("handles quoted commas and embedded newlines without altering phone identifiers", () => {
    const rows = previewCsv(
      'name,phone,address\n"Vendor, Ltd",00123,"First line\nSecond line"',
      "vendors",
      empty,
    );
    expect(rows[0]?.values).toEqual({
      name: "Vendor, Ltd",
      contact_person: "",
      phone: "00123",
      address: "First line\nSecond line",
    });
    expect(rows[0]?.errors).toEqual([]);
  });
  it("rejects missing, unknown, repeated headers and malformed quoting before writes", () => {
    expect(() => previewCsv("phone\n123", "vendors", empty)).toThrow("missing name");
    expect(() => previewCsv("name,password\nVendor,hidden", "vendors", empty)).toThrow(
      "unknown password",
    );
    expect(() => previewCsv("name,name\nA,A", "vendors", empty)).toThrow("Repeated");
    expect(() => previewCsv('name\n"unclosed', "vendors", empty)).toThrow();
  });
  it("reports blank required values, row column counts, CSV duplicates and existing duplicates", () => {
    const context = {
      ...empty,
      vendors: [
        {
          id: "v1",
          name: "Existing",
          contact_person: null,
          phone: null,
          address: null,
          is_active: true,
        },
      ],
    };
    const rows = previewCsv(
      "name,phone\nExisting,123\nNew,456\n new ,789\n,123\nExtra,1,2",
      "vendors",
      context,
    );
    expect(rows.map((row) => row.status)).toEqual([
      "invalid",
      "ready",
      "invalid",
      "invalid",
      "invalid",
    ]);
    expect(rows[0]?.errors.join(" ")).toContain("already exists");
    expect(rows[2]?.errors.join(" ")).toContain("Duplicate row");
    expect(rows[3]?.record).toBe(5);
    expect(rows[4]?.errors.join(" ")).toContain("Expected 2 columns");
  });
  it("validates worker identities and rejects password/role columns to prevent escalation", () => {
    const rows = previewCsv(
      "username,name,email\nbad user,Worker,invalid\nfield.user,Worker,worker@example.com",
      "workers",
      empty,
    );
    expect(rows[0]?.errors).toHaveLength(2);
    expect(rows[1]?.status).toBe("ready");
    expect(() => previewCsv("username,name,role\nuser,User,owner", "workers", empty)).toThrow(
      "unknown role",
    );
    expect(() => previewCsv("username,name,password\nuser,User,secret", "workers", empty)).toThrow(
      "unknown password",
    );
  });
  it("requires saved item/category/size/UOM references and rejects duplicate variant combinations", () => {
    const context: ImportContext = {
      ...empty,
      categories: [{ id: "c1", name: "Electrical", is_active: true }],
      sizes: [{ id: "s1", label: "1 metre", value: null, uom_id: null, is_active: true }],
      uoms: [{ id: "u1", code: "MTR", name: "Metre", symbol: "m", allows_decimal: true }],
      items: [
        {
          id: "i1",
          name: "Copper wire",
          category_id: "c1",
          category_name: "Electrical",
          description: null,
          is_active: true,
          variants: [],
        },
      ],
    };
    expect(previewCsv("name,category\nPipe,Missing", "items", context)[0]?.status).toBe("invalid");
    expect(
      previewCsv(
        "item,size,uom\nCopper wire,1 metre,MTR\nCopper wire,1 metre,MTR\nMissing,,MTR",
        "variants",
        context,
      ).map((row) => row.status),
    ).toEqual(["ready", "invalid", "invalid"]);
    expect(
      previewCsv("code,name,symbol,allows_decimal\nMTR,Metre,m,maybe", "uoms", empty)[0]?.errors,
    ).toContain("allows_decimal must be true or false.");
  });
  it.each(Object.keys(importDefinitions) as ImportKind[])(
    "provides valid headers for %s and limits whole-file size",
    (kind) => {
      expect(templateCsv(kind).trim()).toBe(importDefinitions[kind].columns.join(","));
      expect(() => previewCsv("name\n" + "x".repeat(2_000_000), "items", empty)).toThrow("2 MB");
      expect(() =>
        previewCsv(
          "name\n" + Array.from({ length: 1001 }, (_, i) => `Vendor ${i}`).join("\n"),
          "vendors",
          empty,
        ),
      ).toThrow("1,000-row");
    },
  );
  it("does not write before invocation, reports partial failures, and retries only reviewed failed rows", async () => {
    const rows = previewCsv("name\nA\nB\nA", "vendors", empty);
    const write = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new ApiError("Denied", 403));
    expect(write).not.toHaveBeenCalled();
    const result = await importRows(rows, write, vi.fn());
    expect(write).toHaveBeenCalledTimes(2);
    expect(result.map((row) => row.status)).toEqual(["saved", "failed", "invalid"]);
    expect(result[1]?.message).toBe("Denied");
    write.mockResolvedValue(undefined);
    const retry = result.map((row) =>
      row.status === "failed" ? { ...row, status: "ready" as const } : row,
    );
    const retried = await importRows(retry, write, vi.fn());
    expect(write).toHaveBeenCalledTimes(3);
    expect(retried.map((row) => row.status)).toEqual(["saved", "saved", "invalid"]);
  });
  it("marks network and server errors as unknown and never automatically retries unknown outcomes", async () => {
    const rows = previewCsv("name\nA\nB", "vendors", empty);
    const write = vi
      .fn()
      .mockRejectedValueOnce(new ApiError("Offline", 0, "network_error"))
      .mockRejectedValueOnce(new ApiError("Server failure", 500));
    const result = await importRows(rows, write, vi.fn());
    expect(result.map((row) => row.status)).toEqual(["uncertain", "uncertain"]);
    await importRows(result, write, vi.fn());
    expect(write).toHaveBeenCalledTimes(2);
  });
});
