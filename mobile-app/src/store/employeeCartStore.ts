import { create } from "zustand";
import type { EmployeeStockItem } from "@/types/domain.types";

interface EmployeeCartItem {
  stockItem: EmployeeStockItem;
  qty: number;
  sellingPrice: number;
}

interface EmployeeCartStore {
  items: EmployeeCartItem[];
  total: number;
  addItem: (stockItem: EmployeeStockItem, sellingPrice: number) => void;
  updateQty: (productId: string, qty: number) => void;
  updateSellingPrice: (productId: string, sellingPrice: number) => void;
  removeItem: (productId: string) => void;
  clearCart: () => void;
}

const computeTotal = (items: EmployeeCartItem[]) => items.reduce((sum, item) => sum + item.qty * item.sellingPrice, 0);

export const useEmployeeCartStore = create<EmployeeCartStore>((set) => ({
  items: [],
  total: 0,
  addItem: (stockItem, sellingPrice) =>
    set((state) => {
      const exists = state.items.find((item) => item.stockItem.productId === stockItem.productId);
      const items = exists
        ? state.items.map((item) => (item.stockItem.productId === stockItem.productId ? { ...item, qty: item.qty + 1, sellingPrice } : item))
        : [...state.items, { stockItem, qty: 1, sellingPrice }];
      return { items, total: computeTotal(items) };
    }),
  updateQty: (productId, qty) =>
    set((state) => {
      const items = state.items.map((item) => (item.stockItem.productId === productId ? { ...item, qty } : item)).filter((item) => item.qty > 0);
      return { items, total: computeTotal(items) };
    }),
  updateSellingPrice: (productId, sellingPrice) =>
    set((state) => {
      const items = state.items.map((item) => (item.stockItem.productId === productId ? { ...item, sellingPrice } : item));
      return { items, total: computeTotal(items) };
    }),
  removeItem: (productId) =>
    set((state) => {
      const items = state.items.filter((item) => item.stockItem.productId !== productId);
      return { items, total: computeTotal(items) };
    }),
  clearCart: () => set({ items: [], total: 0 })
}));
