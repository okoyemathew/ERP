import { create } from "zustand";
import type { Product } from "@/types/domain.types";

interface CartItem {
  product: Product;
  qty: number;
}

interface CartStore {
  items: CartItem[];
  total: number;
  addItem: (product: Product, sellingPrice?: number) => void;
  removeItem: (productId: string) => void;
  updateQty: (productId: string, qty: number) => void;
  updateSellingPrice: (productId: string, sellingPrice: number) => void;
  clearCart: () => void;
}

const computeTotal = (items: CartItem[]) => items.reduce((sum, item) => sum + item.qty * item.product.price, 0);

export const useCartStore = create<CartStore>((set) => ({
  items: [],
  total: 0,
  addItem: (product, sellingPrice) =>
    set((state) => {
      const pricedProduct = { ...product, price: sellingPrice ?? product.price };
      const exists = state.items.find((item) => item.product.id === product.id);
      const items = exists
        ? state.items.map((item) => (item.product.id === product.id ? { ...item, product: pricedProduct, qty: item.qty + 1 } : item))
        : [...state.items, { product: pricedProduct, qty: 1 }];
      return { items, total: computeTotal(items) };
    }),
  removeItem: (productId) =>
    set((state) => {
      const items = state.items.filter((item) => item.product.id !== productId);
      return { items, total: computeTotal(items) };
    }),
  updateQty: (productId, qty) =>
    set((state) => {
      const items = state.items.map((item) => (item.product.id === productId ? { ...item, qty: Math.max(0, qty) } : item)).filter((item) => item.qty > 0);
      return { items, total: computeTotal(items) };
    }),
  updateSellingPrice: (productId, sellingPrice) =>
    set((state) => {
      const items = state.items.map((item) => (item.product.id === productId ? { ...item, product: { ...item.product, price: sellingPrice } } : item));
      return { items, total: computeTotal(items) };
    }),
  clearCart: () => set({ items: [], total: 0 })
}));
