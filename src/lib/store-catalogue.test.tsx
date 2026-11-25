import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StoreProvider, useStore } from "./store";
import type { ApiCategory, ApiItem, ApiSizeOption, ApiUom, ApiUser, ApiVariant } from "./api-types";
import type { ImportContext, ImportKind } from "./master-import";

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

  it.each([
    [
      "items",
      { name: "Pipe", category: "Refrigeration", description: "" },
      "/items",
      { name: "Pipe", category_id: "category-1", description: null },
    ],
    [
      "variants",
      { item: "Copper pipe", size: "1 metre", uom: "MTR", sku: "SKU-1", description: "" },
      "/items/item-1/variants",
      {
        size_option_id: "size-1",
        uom_id: "uom-1",
        sku: "SKU-1",
        description: null,
        attributes: {},
      },
    ],
    [
      "vendors",
      { name: "Vendor", phone: "00123" },
      "/vendors",
      { name: "Vendor", contact_person: null, phone: "00123", address: null },
    ],
    [
      "customers",
      { name: "Customer", email: "customer@example.com" },
      "/customers",
      {
        name: "Customer",
        contact_person: null,
        phone: null,
        address: null,
        email: "customer@example.com",
      },
    ],
    [
      "workers",
      { name: "Field worker", username: "field.user" },
      "/users",
      {
        name: "Field worker",
        username: "field.user",
        role: "worker",
        password: "test-only-password",
        phone: null,
        email: null,
      },
    ],
    ["categories", { name: "Electrical" }, "/item-categories", { name: "Electrical" }],
    ["sizes", { label: "10 mm" }, "/size-options", { label: "10 mm" }],
    [
      "uoms",
      { code: "PCS", name: "Pieces", symbol: "pc", allows_decimal: "false" },
      "/uom",
      { code: "PCS", name: "Pieces", symbol: "pc", allows_decimal: false },
    ],
  ] satisfies [ImportKind, Record<string, string>, string, object][])(
    "imports %s with exact existing API shapes",
    async (kind, values, path, body) => {
      const { result } = renderHook(() => useStore(), { wrapper });
      await act(async () => {
        await result.current.login("owner", "test-only-password");
      });
      const context: ImportContext = {
        items: [item],
        vendors: [],
        customers: [],
        users: [],
        categories: [category],
        sizes: [size],
        uoms: [uom],
      };
      await act(async () => {
        await result.current.importMasterRow(
          kind,
          { record: 2, values, errors: [], status: "ready", message: "" },
          context,
          "test-only-password",
        );
      });
      expect(mocks.request).toHaveBeenCalledWith(path, { method: "POST", body });
    },
  );

  it("preserves the created request checkpoint when a later procurement stage fails", async () => {
    const { result } = renderHook(() => useStore(), { wrapper });
    await act(async () => {
      await result.current.login("owner", "test-only-password");
    });
    mocks.request.mockImplementation(async (path: string) => {
      if (path === "/requests") return { id: "request-1", code: "PR-NEW" };
      throw new Error("Could not save lines");
    });
    const checkpoint = vi.fn();
    await expect(
      result.current.createTask({
        projectId: "p1",
        workerId: "w1",
        vendorId: "v1",
        materials: [{ itemId: "i1", variantId: "var1", qty: 5 }],
        instructions: "Check stock",
        deliverySite: "Site",
        dueDate: "2026-11-30",
        onRequestCreated: checkpoint,
      }),
    ).rejects.toThrow("PR-NEW was created, but setup did not finish");
    expect(checkpoint).toHaveBeenCalledWith({ id: "request-1", code: "PR-NEW" });
    expect(mocks.request).toHaveBeenCalledWith("/requests/request-1/items:bulk", {
      method: "POST",
      body: { lines: [{ variant_id: "var1", required_qty: 5, remarks: null }] },
    });
    expect(mocks.request).not.toHaveBeenCalledWith(
      "/requests/request-1/finalize",
      expect.anything(),
    );
  });

  it("denies worker-account imports to an admin before any POST", async () => {
    mocks.request.mockImplementation(async (path: string) =>
      path === "/auth/me"
        ? { ...owner, role: "admin" }
        : path === "/organization/settings"
          ? {}
          : { items: [], total: 0 },
    );
    const { result } = renderHook(() => useStore(), { wrapper });
    await act(async () => {
      await result.current.login("admin", "test-only-password");
    });
    await expect(
      result.current.importMasterRow(
        "workers",
        {
          record: 2,
          values: { username: "worker", name: "Worker" },
          errors: [],
          status: "ready",
          message: "",
        },
        { items: [], vendors: [], customers: [], users: [], categories: [], sizes: [], uoms: [] },
        "test-only-password",
      ),
    ).rejects.toThrow("cannot import");
    expect(mocks.request.mock.calls.some(([, options]) => options?.method === "POST")).toBe(false);
  });
});
