import { describe, expect, it } from "vitest";
import {
  catalogueItemError,
  catalogueVariantError,
  categoryError,
  sizeOptionError,
  uomError,
} from "./catalogue";

describe("catalogue form validation", () => {
  it("requires an item name and enforces the API's 200-character limit", () => {
    expect(catalogueItemError({ name: "  ", categoryId: "", description: "" })).toBe(
      "Enter an item name.",
    );
    expect(catalogueItemError({ name: "x".repeat(201), categoryId: "", description: "" })).toBe(
      "Item names must be 200 characters or fewer.",
    );
  });

  it("requires a unit for every variant", () => {
    expect(catalogueVariantError({ sizeOptionId: "", uomId: "", sku: "", description: "" })).toBe(
      "Select or create a unit of measurement.",
    );
  });

  it("enforces category and size label limits from the API", () => {
    expect(categoryError("")).toBe("Enter a category name.");
    expect(categoryError("x".repeat(101))).toBe("Category names must be 100 characters or fewer.");
    expect(sizeOptionError("x".repeat(61))).toBe("Size labels must be 60 characters or fewer.");
  });

  it("requires all UOM identity fields before creating a unit", () => {
    expect(uomError({ code: "M", name: "", symbol: "m", allowsDecimal: true })).toBe(
      "Enter the unit code, name and symbol.",
    );
    expect(uomError({ code: "M", name: "Metre", symbol: "m", allowsDecimal: true })).toBe("");
  });
});
