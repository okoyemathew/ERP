import { create } from "zustand";
import { employeesService } from "@/services/employees.service";
import type { ApiEmployee } from "@/types/employee";

interface EmployeesStore {
  employees: ApiEmployee[];
  fetchEmployees: () => Promise<void>;
  addEmployee: (employee: ApiEmployee) => void;
}

export const useEmployeesStore = create<EmployeesStore>((set) => ({
  employees: [],
  fetchEmployees: async () => {
    const response = await employeesService.list();
    set({ employees: response.data });
  },
  addEmployee: (employee) => set((state) => ({ employees: [employee, ...state.employees] }))
}));
