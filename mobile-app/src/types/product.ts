import type { Product } from "./domain.types";

export interface ProductCategory {
  id: string;
  businessId: string;
  name: string;
  code?: string | null;
  description?: string | null;
  isActive: boolean;
}

export interface ProductBrand {
  id: string;
  businessId: string;
  name: string;
  description?: string | null;
  isActive: boolean;
}

export interface ProductUnit {
  id: string;
  businessId: string;
  name: string;
  symbol: string;
  description?: string | null;
  isActive: boolean;
}

export interface ProductSupplier {
  id: string;
  businessId: string;
  supplierCode?: string | null;
  companyName: string;
  contactPerson?: string | null;
  phone: string;
  email?: string | null;
  status: string;
}

export interface ProductInventory {
  id: string;
  quantityOnHand: number;
  quantityReserved: number;
  quantityAvailable: number;
  reorderLevel: number;
  reorderQuantity?: number | null;
  averageCost?: string | number | null;
}

export interface ProductImage {
  id: string;
  productId: string;
  imageUrl: string;
  isPrimary: boolean;
}

export interface ProductBarcode {
  id: string;
  productId: string;
  barcode: string;
  barcodeType?: string | null;
  isPrimary: boolean;
}

export interface ProductAddedBy {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
}

export interface ApiProduct {
  id: string;
  businessId: string;
  categoryId: string;
  brandId?: string | null;
  supplierId?: string | null;
  unitId: string;
  name: string;
  sku: string;
  barcode?: string | null;
  description?: string | null;
  purchasePrice: string | number;
  sellingPrice: string | number;
  baseSellingPrice?: string | number;
  wholesalePrice?: string | number | null;
  minimumStock: number;
  maximumStock?: number | null;
  imageUrl?: string | null;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
  addedAt?: string;
  addedBy?: ProductAddedBy | null;
  initialStockQuantity?: number;
  category: ProductCategory;
  brand?: ProductBrand | null;
  supplier?: ProductSupplier | null;
  unit: ProductUnit;
  inventory?: ProductInventory | null;
  images?: ProductImage[];
  barcodes?: ProductBarcode[];
}

export interface ProductListResponse {
  data: ApiProduct[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface ProductQuery {
  page?: number;
  limit?: number;
  search?: string;
  category?: string;
  brand?: string;
  supplier?: string;
  unit?: string;
  lowStock?: boolean;
  available?: boolean;
  sortBy?: "name" | "sku" | "createdAt" | "sellingPrice" | "quantityAvailable";
  sortOrder?: "asc" | "desc";
}

export interface UpsertProductPayload {
  categoryId: string;
  brandId?: string;
  supplierId?: string;
  unitId: string;
  name: string;
  sku: string;
  barcode?: string;
  description?: string;
  purchasePrice: number;
  sellingPrice: number;
  baseSellingPrice?: number;
  wholesalePrice?: number;
  minimumStock?: number;
  maximumStock?: number;
  initialStock?: number;
  imageUrl?: string;
  isActive?: boolean;
}

export interface ProductOptionPayload {
  name: string;
  code?: string;
  symbol?: string;
  description?: string;
  isActive?: boolean;
}

const colors = ["#1565C0", "#2E7D32", "#FB8C00", "#6A1B9A", "#E65100", "#00838F", "#C62828", "#00695C"];

export function mapApiProductToDomain(product: ApiProduct): Product {
  const stock = product.inventory?.quantityAvailable ?? 0;
  const colorIndex = product.name.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0) % colors.length;
  return {
    id: product.id,
    name: product.name,
    sku: product.sku,
    category: product.category?.name ?? "Uncategorized",
    price: Number(product.sellingPrice ?? 0),
    cost: Number(product.purchasePrice ?? 0),
    stock,
    floorPrice: Number(product.wholesalePrice ?? product.purchasePrice ?? 0),
    iconColor: colors[colorIndex],
    supplier: product.supplier?.companyName
  };
}
