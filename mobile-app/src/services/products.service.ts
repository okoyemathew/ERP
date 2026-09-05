import { api } from "@/api/client";
import { endpoints } from "@/api/endpoints";
import { AppApiError } from "@/api/errors";
import { getRequiredBusinessId } from "@/api/session";
import { offlineDbService } from "@/services/offline-db.service";
import type {
  ApiProduct,
  ProductBrand,
  ProductCategory,
  ProductListResponse,
  ProductOptionPayload,
  ProductQuery,
  ProductSupplier,
  ProductUnit,
  UpsertProductPayload
} from "@/types/product";

function filterCachedProducts(products: ApiProduct[], params: ProductQuery) {
  const search = params.search?.trim().toLowerCase();
  return products.filter((product) => {
    if (params.available && (product.inventory?.quantityAvailable ?? 0) <= 0) return false;
    if (params.lowStock && (product.inventory?.quantityAvailable ?? 0) > product.minimumStock) return false;
    if (params.category && product.categoryId !== params.category) return false;
    if (params.brand && product.brandId !== params.brand) return false;
    if (params.supplier && product.supplierId !== params.supplier) return false;
    if (params.unit && product.unitId !== params.unit) return false;
    if (!search) return true;
    return [product.name, product.sku, product.barcode, product.category?.name, product.brand?.name]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(search));
  });
}

export const productsService = {
  async list(params: ProductQuery = {}): Promise<ProductListResponse> {
    const businessId = await getRequiredBusinessId();
    try {
      const { data } = await api.get<ProductListResponse>(endpoints.products.list(businessId), { params });
      await offlineDbService.cacheProducts(businessId, data.data);
      return data;
    } catch (error) {
      if (error instanceof AppApiError && (error.code === "NETWORK" || error.code === "TIMEOUT")) {
        const cached = filterCachedProducts(await offlineDbService.getCachedProducts(businessId), params);
        const limit = params.limit ?? cached.length;
        return {
          data: cached.slice(0, limit),
          meta: { page: 1, limit, total: cached.length, totalPages: cached.length > 0 ? 1 : 0 }
        };
      }
      throw error;
    }
  },

  async detail(id: string): Promise<ApiProduct> {
    const businessId = await getRequiredBusinessId();
    const { data } = await api.get<ApiProduct>(endpoints.products.detail(businessId, id));
    return data;
  },

  async create(payload: UpsertProductPayload): Promise<ApiProduct> {
    const businessId = await getRequiredBusinessId();
    const { data } = await api.post<ApiProduct>(endpoints.products.create(businessId), payload);
    return data;
  },

  async update(id: string, payload: Partial<UpsertProductPayload>): Promise<ApiProduct> {
    const businessId = await getRequiredBusinessId();
    const { data } = await api.patch<ApiProduct>(endpoints.products.detail(businessId, id), payload);
    return data;
  },

  async stockIn(productId: string, quantity: number, unitCost?: number): Promise<void> {
    const businessId = await getRequiredBusinessId();
    await api.post(endpoints.inventory.stockIn(businessId), {
      productId,
      quantity,
      transactionType: "STOCK_IN",
      unitCost,
      remarks: "Actual new stock"
    });
  },

  async deactivate(id: string): Promise<ApiProduct> {
    const businessId = await getRequiredBusinessId();
    const { data } = await api.delete<ApiProduct>(endpoints.products.detail(businessId, id));
    return data;
  },

  async searchByBarcode(barcode: string): Promise<ApiProduct[]> {
    const businessId = await getRequiredBusinessId();
    const { data } = await api.get<ApiProduct[]>(endpoints.products.search(businessId), { params: { barcode } });
    return data;
  },

  async generateBarcode(): Promise<string> {
    const businessId = await getRequiredBusinessId();
    const { data } = await api.get<{ barcode: string }>(endpoints.products.generateBarcode(businessId));
    return data.barcode;
  },

  async categories(): Promise<ProductCategory[]> {
    const businessId = await getRequiredBusinessId();
    const { data } = await api.get<ProductCategory[]>(endpoints.categories.list(businessId));
    return data;
  },

  async createCategory(payload: ProductOptionPayload): Promise<ProductCategory> {
    const businessId = await getRequiredBusinessId();
    const { data } = await api.post<ProductCategory>(endpoints.categories.create(businessId), payload);
    return data;
  },

  async updateCategory(id: string, payload: Partial<ProductOptionPayload>): Promise<ProductCategory> {
    const businessId = await getRequiredBusinessId();
    const { data } = await api.patch<ProductCategory>(endpoints.categories.detail(businessId, id), payload);
    return data;
  },

  async deactivateCategory(id: string): Promise<ProductCategory> {
    const businessId = await getRequiredBusinessId();
    const { data } = await api.delete<ProductCategory>(endpoints.categories.detail(businessId, id));
    return data;
  },

  async brands(): Promise<ProductBrand[]> {
    const businessId = await getRequiredBusinessId();
    const { data } = await api.get<ProductBrand[]>(endpoints.brands.list(businessId));
    return data;
  },

  async createBrand(payload: ProductOptionPayload): Promise<ProductBrand> {
    const businessId = await getRequiredBusinessId();
    const { data } = await api.post<ProductBrand>(endpoints.brands.create(businessId), payload);
    return data;
  },

  async updateBrand(id: string, payload: Partial<ProductOptionPayload>): Promise<ProductBrand> {
    const businessId = await getRequiredBusinessId();
    const { data } = await api.patch<ProductBrand>(endpoints.brands.detail(businessId, id), payload);
    return data;
  },

  async deactivateBrand(id: string): Promise<ProductBrand> {
    const businessId = await getRequiredBusinessId();
    const { data } = await api.delete<ProductBrand>(endpoints.brands.detail(businessId, id));
    return data;
  },

  async units(): Promise<ProductUnit[]> {
    const businessId = await getRequiredBusinessId();
    const { data } = await api.get<ProductUnit[]>(endpoints.units.list(businessId));
    return data;
  },

  async createUnit(payload: ProductOptionPayload): Promise<ProductUnit> {
    const businessId = await getRequiredBusinessId();
    const { data } = await api.post<ProductUnit>(endpoints.units.create(businessId), payload);
    return data;
  },

  async updateUnit(id: string, payload: Partial<ProductOptionPayload>): Promise<ProductUnit> {
    const businessId = await getRequiredBusinessId();
    const { data } = await api.patch<ProductUnit>(endpoints.units.detail(businessId, id), payload);
    return data;
  },

  async deactivateUnit(id: string): Promise<ProductUnit> {
    const businessId = await getRequiredBusinessId();
    const { data } = await api.delete<ProductUnit>(endpoints.units.detail(businessId, id));
    return data;
  },

  async suppliers(): Promise<ProductSupplier[]> {
    const businessId = await getRequiredBusinessId();
    const { data } = await api.get<{ data: ProductSupplier[] } | ProductSupplier[]>(endpoints.suppliers.list(businessId), { params: { limit: 100 } });
    return Array.isArray(data) ? data : data.data;
  }
};
