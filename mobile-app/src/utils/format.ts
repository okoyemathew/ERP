import { useAuthStore } from "@/store/authStore";
import { formatMoney } from "@/utils/currency";

export const formatCurrency = (value: number | string | null | undefined, currency?: string | null) =>
  formatMoney(value, currency ?? useAuthStore.getState().business?.currency);

export const initials = (name: string) => {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
};
