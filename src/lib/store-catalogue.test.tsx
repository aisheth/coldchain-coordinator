import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StoreProvider, useStore } from "./store";
import type { ApiCategory, ApiItem, ApiSizeOption, ApiUom, ApiUser, ApiVariant } from "./api-types";

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
}));

vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>();
  return {
    ...actual,
    apiRequest: mocks.request,
    loginRequest: mocks.login,
    logoutRequest: mocks.logout,
    hasSession: () => false,
    clearSession: vi.fn(),
    uploadAttachment: vi.fn(),
  };
});

const owner: ApiUser = {
  id: "owner-1",
  org_id: "org-1",
  username: "owner",
  email: null,
  name: "Owner",
  phone: null,
  role: "owner",
  is_active: true,
  must_change_password: false,
};
const category: ApiCategory = { id: "category-1", name: "Refrigeration", is_active: true };
const size: ApiSizeOption = {
  id: "size-1",
  label: "1 metre",
  value: null,
  uom_id: null,
  is_active: true,
};
const uom: ApiUom = { id: "uom-1", code: "MTR", name: "Metre", symbol: "m", allows_decimal: true };
const item: ApiItem = {
  id: "item-1",
  name: "Copper pipe",
  category_id: category.id,
  category_name: category.name,
  description: "Cold room refrigerant line",
  is_active: true,
  variants: [],
};
const variant: ApiVariant = {
  id: "variant-1",
  item_id: item.id,
  item_name: item.name,
  category_name: category.name,
  display_name: "Copper pipe — 1 metre",
  sku: "CP-1M",
  description: null,
  size_option_id: size.id,
  size_label: size.label,
  uom_id: uom.id,
  uom_code: uom.code,
  uom_symbol: uom.symbol,
  allows_decimal: true,
  attributes: {},
  is_active: true,
};

function wrapper({ children }: { children: ReactNode }) {
  return <StoreProvider>{children}</StoreProvider>;
}

beforeEach(() => {
  mocks.request.mockReset();
  mocks.login.mockReset();
  mocks.login.mockResolvedValue({ access_token: "access", refresh_token: "refresh" });
  mocks.request.mockImplementation(async (path: string, options?: { method?: string }) => {
    if (path === "/auth/me") return owner;
    if (path === "/organization/settings")
      return {
        organization_name: "ColdTrack",
        require_owner_approval: false,
        require_delivery_photo: false,
      };
    if (path === "/item-categories" && options?.method === "POST") return category;
    if (path === "/size-options" && options?.method === "POST") return size;
    if (path === "/uom" && options?.method === "POST") return uom;
    if (path === "/items" && options?.method === "POST") return item;
    if (path === "/items/item-1/variants" && options?.method === "POST") return variant;
    if (path === "/item-categories") return [category];
    if (path === "/size-options?active=true") return [size];
    if (path === "/uom") return [uom];
    if (path.startsWith("/")) return { items: [], total: 0, limit: 200, offset: 0 };
    throw new Error(`Unexpected request: ${path}`);
  });
});

describe("catalogue store integration", () => {
  it("creates an item and variant at the documented paths with the API's request shapes", async () => {
    const { result } = renderHook(() => useStore(), { wrapper });
    await act(async () => {
      await result.current.login("owner", "password");
    });

    await act(async () => {
      await result.current.addCatalogueItem({
        name: " Copper pipe ",
        categoryId: category.id,
        description: " Cold room refrigerant line ",
      });
    });
    await act(async () => {
      await result.current.addCatalogueVariant(item.id, {
        sizeOptionId: size.id,
        uomId: uom.id,
        sku: " CP-1M ",
        description: "",
      });
    });

    expect(mocks.request).toHaveBeenCalledWith("/items", {
      method: "POST",
      body: {
        name: "Copper pipe",
        category_id: category.id,
        description: "Cold room refrigerant line",
      },
    });
    expect(mocks.request).toHaveBeenCalledWith("/items/item-1/variants", {
      method: "POST",
      body: {
        size_option_id: size.id,
        uom_id: uom.id,
        sku: "CP-1M",
        description: null,
        attributes: {},
      },
    });
    expect(result.current.state.catalogue).toEqual([
      {
        id: item.id,
        name: item.name,
        category: category.name,
        unit: "m",
        variants: [{ id: variant.id, label: size.label }],
      },
    ]);
  });

  it("surfaces catalogue option failures without inventing fallback records", async () => {
    const { result } = renderHook(() => useStore(), { wrapper });
    await act(async () => {
      await result.current.login("owner", "password");
    });
    mocks.request.mockImplementation(async (path: string) => {
      if (path === "/item-categories") throw new Error("Catalogue access denied");
      if (path === "/size-options?active=true") return [];
      if (path === "/uom") return [];
      throw new Error(`Unexpected request: ${path}`);
    });

    await act(async () => {
      await result.current.loadCatalogueOptions();
    });

    expect(result.current.catalogueOptionsError).toBe("Catalogue access denied");
    expect(result.current.catalogueOptionsLoading).toBe(false);
    expect(result.current.catalogueOptions).toEqual({ categories: [], sizeOptions: [], uoms: [] });
  });

  it("loads and creates categories, sizes and UOMs without replacing their endpoints", async () => {
    const { result } = renderHook(() => useStore(), { wrapper });
    await act(async () => {
      await result.current.login("owner", "password");
    });
    await act(async () => {
      await result.current.loadCatalogueOptions();
    });

    expect(result.current.catalogueOptions).toEqual({
      categories: [category],
      sizeOptions: [size],
      uoms: [uom],
    });
    expect(result.current.catalogueOptionsLoading).toBe(false);
    expect(result.current.catalogueOptionsError).toBeNull();

    await act(async () => {
      await result.current.addCatalogueCategory(" Refrigeration ");
      await result.current.addCatalogueSizeOption(" 1 metre ");
      await result.current.addCatalogueUom({
        code: " MTR ",
        name: " Metre ",
        symbol: " m ",
        allowsDecimal: true,
      });
    });

    expect(mocks.request).toHaveBeenCalledWith("/item-categories", {
      method: "POST",
      body: { name: "Refrigeration" },
    });
    expect(mocks.request).toHaveBeenCalledWith("/size-options", {
      method: "POST",
      body: { label: "1 metre" },
    });
    expect(mocks.request).toHaveBeenCalledWith("/uom", {
      method: "POST",
      body: { code: "MTR", name: "Metre", symbol: "m", allows_decimal: true },
    });
  });
});
