import { create } from "zustand";
import { productsService } from "@/services/products.service";
import type { Product } from "@/types/domain.types";
import { mapApiProductToDomain } from "@/types/product";

interface InventoryStore {
  products: Product[];
  fetchProducts: () => Promise<void>;
  updateStock: (id: string, stock: number) => void;
}

export const useInventoryStore = create<InventoryStore>((set) => ({
  products: [],
  fetchProducts: async () => {
    const response = await productsService.list({ limit: 100 });
    set({ products: response.data.map(mapApiProductToDomain) });
  },
  updateStock: (id, stock) => set((state) => ({ products: state.products.map((product) => (product.id === id ? { ...product, stock } : product)) }))
}));
