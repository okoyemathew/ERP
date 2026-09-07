import { api } from "@/api/client";
import { endpoints } from "@/api/endpoints";
import { AppApiError } from "@/api/errors";
import { getRequiredBusinessId } from "@/api/session";
import { offlineDbService } from "@/services/offline-db.service";
import { queueOfflineMutation } from "@/services/offline-mutation.service";
import type {
  ApiProduct,
  ProductBrand,
  ProductCategory,
  ProductListResponse,
  ProductOptionPayload,
  ProductQuery,
  ProductReturnRequest,
  ProductReturnRequestListResponse,
  ProductReturnRequestPayload,
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

function offlineId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function optionFallback<T extends ProductCategory | ProductBrand | ProductUnit>(
  businessId: string,
  payload: ProductOptionPayload | Partial<ProductOptionPayload>,
  type: "category" | "brand" | "unit",
  id = offlineId(type)
): T {
  return {
    id,
    businessId,
    name: payload.name ?? "Pending",
    code: payload.code ?? null,
    symbol: payload.symbol ?? payload.name ?? "UNIT",
    description: payload.description ?? null,
    isActive: payload.isActive ?? true
  } as unknown as T;
}

function productFallback(businessId: string, payload: UpsertProductPayload, id = offlineId("product")): ApiProduct {
  const now = new Date().toISOString();
  const category = optionFallback<ProductCategory>(businessId, { name: "Uncategorized" }, "category", payload.categoryId ?? "offline-category");
  const unit = optionFallback<ProductUnit>(businessId, { name: "Unit", symbol: "UNIT" }, "unit", payload.unitId ?? "offline-unit");
  const quantity = payload.initialStock ?? 0;
  return {
    id,
    businessId,
    categoryId: category.id,
    brandId: payload.brandId ?? null,
    supplierId: payload.supplierId ?? null,
    unitId: unit.id,
    name: payload.name,
    sku: payload.sku ?? id,
    barcode: payload.barcode ?? null,
    description: payload.description ?? null,
    purchasePrice: payload.purchasePrice ?? 0,
    sellingPrice: payload.sellingPrice ?? 0,
    baseSellingPrice: payload.baseSellingPrice ?? payload.sellingPrice ?? 0,
    wholesalePrice: payload.wholesalePrice ?? null,
    minimumStock: payload.minimumStock,
    maximumStock: payload.maximumStock ?? null,
    imageUrl: payload.imageUrl ?? null,
    isActive: payload.isActive ?? true,
    createdAt: now,
    updatedAt: now,
    initialStockQuantity: quantity,
    category,
    unit,
    brand: null,
    supplier: null,
    inventory: {
      id: `inventory-${id}`,
      quantityOnHand: quantity,
      quantityReserved: 0,
      quantityAvailable: quantity,
      reorderLevel: payload.minimumStock,
      reorderQuantity: null,
      averageCost: payload.purchasePrice ?? 0
    },
    images: [],
    barcodes: []
  };
}

function filterCachedReturnRequests(
  requests: ProductReturnRequest[],
  params: { status?: "PENDING" | "APPROVED" | "REJECTED"; limit?: number; productId?: string }
) {
  return requests.filter((request) => {
    if (params.status && request.status !== params.status) return false;
    if (params.productId && request.productId !== params.productId) return false;
    return true;
  });
}

async function returnRequestFallback(
  businessId: string,
  payload: ProductReturnRequestPayload,
  id = offlineId("return-request")
): Promise<ProductReturnRequest> {
  const now = new Date().toISOString();
  const product = await offlineDbService.getCachedProduct(businessId, payload.productId);
  return {
    id,
    businessId,
    productId: payload.productId,
    requestedById: "offline-user",
    reviewedById: null,
    quantity: payload.quantity,
    unitCost: payload.unitCost ?? null,
    referenceNumber: payload.referenceNumber ?? null,
    remarks: payload.remarks ?? null,
    status: "PENDING",
    decisionNote: null,
    requestedAt: now,
    reviewedAt: null,
    inventoryTransactionId: null,
    createdAt: now,
    updatedAt: now,
    product: product ? { id: product.id, name: product.name, sku: product.sku, barcode: product.barcode } : undefined,
    requestedBy: undefined,
    reviewedBy: null
  };
}

function decidedReturnRequestFallback(
  current: ProductReturnRequest | undefined,
  businessId: string,
  requestId: string,
  status: "APPROVED" | "REJECTED",
  note?: string
): ProductReturnRequest {
  const now = new Date().toISOString();
  return {
    id: requestId,
    businessId,
    productId: current?.productId ?? "offline-product",
    requestedById: current?.requestedById ?? "offline-user",
    reviewedById: "offline-reviewer",
    quantity: current?.quantity ?? 0,
    unitCost: current?.unitCost ?? null,
    referenceNumber: current?.referenceNumber ?? null,
    remarks: current?.remarks ?? null,
    status,
    decisionNote: note ?? null,
    requestedAt: current?.requestedAt ?? now,
    reviewedAt: now,
    inventoryTransactionId: current?.inventoryTransactionId ?? null,
    createdAt: current?.createdAt ?? now,
    updatedAt: now,
    product: current?.product,
    requestedBy: current?.requestedBy,
    reviewedBy: current?.reviewedBy ?? null
  };
}

async function applyApprovedReturnToCachedProduct(businessId: string, request: ProductReturnRequest) {
  const product = await offlineDbService.getCachedProduct(businessId, request.productId);
  if (!product?.inventory || request.quantity <= 0) return;
  await offlineDbService.cacheProduct(businessId, {
    ...product,
    inventory: {
      ...product.inventory,
      quantityOnHand: product.inventory.quantityOnHand + request.quantity,
      quantityAvailable: product.inventory.quantityAvailable + request.quantity,
      averageCost: Number(request.unitCost ?? product.inventory.averageCost ?? 0)
    },
    updatedAt: new Date().toISOString()
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
    try {
      const { data } = await api.get<ApiProduct>(endpoints.products.detail(businessId, id));
      await offlineDbService.cacheProduct(businessId, data);
      return data;
    } catch (error) {
      if (error instanceof AppApiError && (error.code === "NETWORK" || error.code === "TIMEOUT")) {
        const cached = await offlineDbService.getCachedProduct(businessId, id);
        if (cached) return cached;
      }
      throw error;
    }
  },

  async create(payload: UpsertProductPayload): Promise<ApiProduct> {
    const businessId = await getRequiredBusinessId();
    try {
      const { data } = await api.post<ApiProduct>(endpoints.products.create(businessId), payload);
      await offlineDbService.cacheProduct(businessId, data);
      return data;
    } catch (error) {
      const fallback = productFallback(businessId, payload);
      await offlineDbService.cacheProduct(businessId, fallback);
      return queueOfflineMutation(error, { method: "POST", url: endpoints.products.create(businessId), data: payload }, fallback);
    }
  },

  async update(id: string, payload: Partial<UpsertProductPayload>): Promise<ApiProduct> {
    const businessId = await getRequiredBusinessId();
    try {
      const { data } = await api.patch<ApiProduct>(endpoints.products.detail(businessId, id), payload);
      await offlineDbService.cacheProduct(businessId, data);
      return data;
    } catch (error) {
      const current = await offlineDbService.getCachedProduct(businessId, id);
      const fallback = { ...(current ?? productFallback(businessId, { name: payload.name ?? "Pending Product", minimumStock: payload.minimumStock ?? 0 }, id)), ...payload, updatedAt: new Date().toISOString() } as ApiProduct;
      await offlineDbService.cacheProduct(businessId, fallback);
      return queueOfflineMutation(error, { method: "PATCH", url: endpoints.products.detail(businessId, id), data: payload }, fallback);
    }
  },

  async stockIn(productId: string, quantity: number, unitCost?: number): Promise<void> {
    const businessId = await getRequiredBusinessId();
    const payload = {
      productId,
      quantity,
      transactionType: "STOCK_IN",
      unitCost,
      remarks: "Actual new stock"
    };
    try {
      await api.post(endpoints.inventory.stockIn(businessId), payload);
    } catch (error) {
      const current = await offlineDbService.getCachedProduct(businessId, productId);
      if (current?.inventory) {
        const nextProduct: ApiProduct = {
          ...current,
          inventory: {
            ...current.inventory,
            quantityOnHand: current.inventory.quantityOnHand + quantity,
            quantityAvailable: current.inventory.quantityAvailable + quantity,
            averageCost: unitCost ?? current.inventory.averageCost
          }
        };
        await offlineDbService.cacheProduct(businessId, nextProduct);
      }
      await queueOfflineMutation(error, { method: "POST", url: endpoints.inventory.stockIn(businessId), data: payload }, undefined);
    }
  },

  async returnRequests(params: { status?: "PENDING" | "APPROVED" | "REJECTED"; limit?: number; productId?: string } = {}): Promise<ProductReturnRequestListResponse> {
    const businessId = await getRequiredBusinessId();
    try {
      const { data } = await api.get<ProductReturnRequestListResponse>(endpoints.inventory.returnRequests(businessId), { params });
      await offlineDbService.cacheProductReturnRequests(businessId, data.data);
      return data;
    } catch (error) {
      if (error instanceof AppApiError && (error.code === "NETWORK" || error.code === "TIMEOUT")) {
        const cached = filterCachedReturnRequests(await offlineDbService.getCachedProductReturnRequests(businessId), params);
        const limit = params.limit ?? cached.length;
        return {
          data: cached.slice(0, limit),
          meta: { page: 1, limit, total: cached.length, totalPages: cached.length > 0 ? 1 : 0 }
        };
      }
      throw error;
    }
  },

  async createReturnRequest(payload: ProductReturnRequestPayload): Promise<ProductReturnRequest> {
    const businessId = await getRequiredBusinessId();
    try {
      const { data } = await api.post<ProductReturnRequest>(endpoints.inventory.returnRequests(businessId), payload);
      await offlineDbService.cacheProductReturnRequest(businessId, data);
      return data;
    } catch (error) {
      const fallback = await returnRequestFallback(businessId, payload);
      await offlineDbService.cacheProductReturnRequest(businessId, fallback);
      return queueOfflineMutation(error, { method: "POST", url: endpoints.inventory.returnRequests(businessId), data: payload }, fallback);
    }
  },

  async approveReturnRequest(requestId: string, note?: string): Promise<ProductReturnRequest> {
    const businessId = await getRequiredBusinessId();
    try {
      const { data } = await api.patch<ProductReturnRequest>(endpoints.inventory.approveReturnRequest(businessId, requestId), { note });
      await offlineDbService.cacheProductReturnRequest(businessId, data);
      return data;
    } catch (error) {
      const current = (await offlineDbService.getCachedProductReturnRequests(businessId)).find((request) => request.id === requestId);
      const fallback = decidedReturnRequestFallback(current, businessId, requestId, "APPROVED", note);
      await offlineDbService.cacheProductReturnRequest(businessId, fallback);
      await applyApprovedReturnToCachedProduct(businessId, fallback);
      return queueOfflineMutation(error, { method: "PATCH", url: endpoints.inventory.approveReturnRequest(businessId, requestId), data: { note } }, fallback);
    }
  },

  async rejectReturnRequest(requestId: string, note?: string): Promise<ProductReturnRequest> {
    const businessId = await getRequiredBusinessId();
    try {
      const { data } = await api.patch<ProductReturnRequest>(endpoints.inventory.rejectReturnRequest(businessId, requestId), { note });
      await offlineDbService.cacheProductReturnRequest(businessId, data);
      return data;
    } catch (error) {
      const current = (await offlineDbService.getCachedProductReturnRequests(businessId)).find((request) => request.id === requestId);
      const fallback = decidedReturnRequestFallback(current, businessId, requestId, "REJECTED", note);
      await offlineDbService.cacheProductReturnRequest(businessId, fallback);
      return queueOfflineMutation(error, { method: "PATCH", url: endpoints.inventory.rejectReturnRequest(businessId, requestId), data: { note } }, fallback);
    }
  },

  async deactivate(id: string): Promise<ApiProduct> {
    const businessId = await getRequiredBusinessId();
    try {
      const { data } = await api.delete<ApiProduct>(endpoints.products.detail(businessId, id));
      await offlineDbService.removeCachedProduct(businessId, id);
      return data;
    } catch (error) {
      const current = await offlineDbService.getCachedProduct(businessId, id);
      await offlineDbService.removeCachedProduct(businessId, id);
      return queueOfflineMutation(error, { method: "DELETE", url: endpoints.products.detail(businessId, id) }, current ?? productFallback(businessId, { name: "Deleted Product", minimumStock: 0 }, id));
    }
  },

  async searchByBarcode(barcode: string): Promise<ApiProduct[]> {
    const businessId = await getRequiredBusinessId();
    try {
      const { data } = await api.get<ApiProduct[]>(endpoints.products.search(businessId), { params: { barcode } });
      await offlineDbService.cacheProducts(businessId, data);
      return data;
    } catch (error) {
      if (error instanceof AppApiError && (error.code === "NETWORK" || error.code === "TIMEOUT")) {
        return (await offlineDbService.getCachedProducts(businessId)).filter((product) => product.barcode === barcode);
      }
      throw error;
    }
  },

  async generateBarcode(): Promise<string> {
    const businessId = await getRequiredBusinessId();
    try {
      const { data } = await api.get<{ barcode: string }>(endpoints.products.generateBarcode(businessId));
      return data.barcode;
    } catch (error) {
      if (error instanceof AppApiError && (error.code === "NETWORK" || error.code === "TIMEOUT")) {
        return `OFF${Date.now().toString().slice(-10)}`;
      }
      throw error;
    }
  },

  async categories(): Promise<ProductCategory[]> {
    const businessId = await getRequiredBusinessId();
    const { data } = await api.get<ProductCategory[]>(endpoints.categories.list(businessId));
    return data;
  },

  async createCategory(payload: ProductOptionPayload): Promise<ProductCategory> {
    const businessId = await getRequiredBusinessId();
    try {
      const { data } = await api.post<ProductCategory>(endpoints.categories.create(businessId), payload);
      return data;
    } catch (error) {
      return queueOfflineMutation(error, { method: "POST", url: endpoints.categories.create(businessId), data: payload }, optionFallback(businessId, payload, "category"));
    }
  },

  async updateCategory(id: string, payload: Partial<ProductOptionPayload>): Promise<ProductCategory> {
    const businessId = await getRequiredBusinessId();
    try {
      const { data } = await api.patch<ProductCategory>(endpoints.categories.detail(businessId, id), payload);
      return data;
    } catch (error) {
      return queueOfflineMutation(error, { method: "PATCH", url: endpoints.categories.detail(businessId, id), data: payload }, optionFallback(businessId, payload, "category", id));
    }
  },

  async deactivateCategory(id: string): Promise<ProductCategory> {
    const businessId = await getRequiredBusinessId();
    try {
      const { data } = await api.delete<ProductCategory>(endpoints.categories.detail(businessId, id));
      return data;
    } catch (error) {
      return queueOfflineMutation(error, { method: "DELETE", url: endpoints.categories.detail(businessId, id) }, optionFallback(businessId, { name: "Pending" }, "category", id));
    }
  },

  async brands(): Promise<ProductBrand[]> {
    const businessId = await getRequiredBusinessId();
    const { data } = await api.get<ProductBrand[]>(endpoints.brands.list(businessId));
    return data;
  },

  async createBrand(payload: ProductOptionPayload): Promise<ProductBrand> {
    const businessId = await getRequiredBusinessId();
    try {
      const { data } = await api.post<ProductBrand>(endpoints.brands.create(businessId), payload);
      return data;
    } catch (error) {
      return queueOfflineMutation(error, { method: "POST", url: endpoints.brands.create(businessId), data: payload }, optionFallback(businessId, payload, "brand"));
    }
  },

  async updateBrand(id: string, payload: Partial<ProductOptionPayload>): Promise<ProductBrand> {
    const businessId = await getRequiredBusinessId();
    try {
      const { data } = await api.patch<ProductBrand>(endpoints.brands.detail(businessId, id), payload);
      return data;
    } catch (error) {
      return queueOfflineMutation(error, { method: "PATCH", url: endpoints.brands.detail(businessId, id), data: payload }, optionFallback(businessId, payload, "brand", id));
    }
  },

  async deactivateBrand(id: string): Promise<ProductBrand> {
    const businessId = await getRequiredBusinessId();
    try {
      const { data } = await api.delete<ProductBrand>(endpoints.brands.detail(businessId, id));
      return data;
    } catch (error) {
      return queueOfflineMutation(error, { method: "DELETE", url: endpoints.brands.detail(businessId, id) }, optionFallback(businessId, { name: "Pending" }, "brand", id));
    }
  },

  async units(): Promise<ProductUnit[]> {
    const businessId = await getRequiredBusinessId();
    const { data } = await api.get<ProductUnit[]>(endpoints.units.list(businessId));
    return data;
  },

  async createUnit(payload: ProductOptionPayload): Promise<ProductUnit> {
    const businessId = await getRequiredBusinessId();
    try {
      const { data } = await api.post<ProductUnit>(endpoints.units.create(businessId), payload);
      return data;
    } catch (error) {
      return queueOfflineMutation(error, { method: "POST", url: endpoints.units.create(businessId), data: payload }, optionFallback(businessId, payload, "unit"));
    }
  },

  async updateUnit(id: string, payload: Partial<ProductOptionPayload>): Promise<ProductUnit> {
    const businessId = await getRequiredBusinessId();
    try {
      const { data } = await api.patch<ProductUnit>(endpoints.units.detail(businessId, id), payload);
      return data;
    } catch (error) {
      return queueOfflineMutation(error, { method: "PATCH", url: endpoints.units.detail(businessId, id), data: payload }, optionFallback(businessId, payload, "unit", id));
    }
  },

  async deactivateUnit(id: string): Promise<ProductUnit> {
    const businessId = await getRequiredBusinessId();
    try {
      const { data } = await api.delete<ProductUnit>(endpoints.units.detail(businessId, id));
      return data;
    } catch (error) {
      return queueOfflineMutation(error, { method: "DELETE", url: endpoints.units.detail(businessId, id) }, optionFallback(businessId, { name: "Pending", symbol: "UNIT" }, "unit", id));
    }
  },

  async suppliers(): Promise<ProductSupplier[]> {
    const businessId = await getRequiredBusinessId();
    const { data } = await api.get<{ data: ProductSupplier[] } | ProductSupplier[]>(endpoints.suppliers.list(businessId), { params: { limit: 100 } });
    return Array.isArray(data) ? data : data.data;
  }
};
