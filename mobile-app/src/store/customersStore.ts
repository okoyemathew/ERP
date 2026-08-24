import { create } from "zustand";
import { customersService } from "@/services/customers.service";
import type { ApiCustomer } from "@/types/customer";

interface CustomersStore {
  customers: ApiCustomer[];
  fetchCustomers: () => Promise<void>;
  addCustomer: (customer: ApiCustomer) => void;
}

export const useCustomersStore = create<CustomersStore>((set) => ({
  customers: [],
  fetchCustomers: async () => {
    const response = await customersService.list();
    set({ customers: response.data });
  },
  addCustomer: (customer) => set((state) => ({ customers: [customer, ...state.customers] }))
}));
