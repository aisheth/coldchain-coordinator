import { describe, expect, it } from "vitest";
import { availableItems, availableVariants } from "./procurement";
import type { CatalogueItem } from "./types";

const copper: CatalogueItem = { id: "cw", name: "Copper Wire", category: "Electrical", unit: "roll",
  variants: [{ id: "1m", label: "1 metre" }, { id: "2m", label: "2 metres" }, { id: "5m", label: "5 metres" }] };

describe("procurement picker", () => {
  it("hides an added variant but keeps siblings", () => {
    const ids = availableVariants(copper, [{ itemId: "cw", variantId: "1m", qty: 2 }]).map((v) => v.id);
    expect(ids).toEqual(["2m", "5m"]);
  });
  it("restores a variant once removed from the list", () => {
    expect(availableVariants(copper, []).map((v) => v.id)).toEqual(["1m", "2m", "5m"]);
  });
  it("drops an item when all its variants are in the list", () => {
    const list = ["1m", "2m", "5m"].map((v) => ({ itemId: "cw", variantId: v, qty: 1 }));
    expect(availableItems([copper], list)).toHaveLength(0);
  });
});
