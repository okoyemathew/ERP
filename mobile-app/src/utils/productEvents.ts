import type { ApiProduct } from "@/types/product";

type ProductListener = (product: ApiProduct) => void;
const listeners = new Set<ProductListener>();

export const productEvents = {
  subscribe(listener: ProductListener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  notifyCreated(product: ApiProduct) {
    listeners.forEach((listener) => listener(product));
  }
};
