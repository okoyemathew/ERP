import { endpoints } from "@/api/endpoints";
import type { DashboardStatistics, DashboardSummary, ReportResponse } from "@/types/report";
import { api } from "./api";

export const reportsService = {
  async summary(): Promise<ReportResponse> {
    const { data } = await api.get<ReportResponse>(endpoints.reports.summary);
    return data;
  },

  async dashboardSummary(businessId: string): Promise<DashboardSummary> {
    const { data } = await api.get<DashboardSummary>(endpoints.businesses.dashboardSummary(businessId));
    return data;
  },

  async dashboardStatistics(businessId: string): Promise<DashboardStatistics> {
    const { data } = await api.get<DashboardStatistics>(endpoints.businesses.dashboardStatistics(businessId));
    return data;
  },

  async sales(period: "daily" | "weekly" | "monthly" | "yearly"): Promise<ReportResponse> {
    const path = {
      daily: endpoints.reports.dailySales,
      weekly: endpoints.reports.weeklySales,
      monthly: endpoints.reports.monthlySales,
      yearly: endpoints.reports.yearlySales
    }[period];
    const { data } = await api.get<ReportResponse>(path);
    return data;
  },

  async profit(): Promise<ReportResponse> {
    const { data } = await api.get<ReportResponse>(endpoints.reports.profit);
    return data;
  },

  async expenses(period = "day"): Promise<ReportResponse> {
    const { data } = await api.get<ReportResponse>(endpoints.reports.expenses, { params: { period } });
    return data;
  },

  async inventory(): Promise<ReportResponse> {
    const { data } = await api.get<ReportResponse>(endpoints.reports.inventory);
    return data;
  },

  async credit(): Promise<ReportResponse> {
    const { data } = await api.get<ReportResponse>(endpoints.reports.credit);
    return data;
  },

  async employeeSales(period = "day"): Promise<ReportResponse> {
    const { data } = await api.get<ReportResponse>(endpoints.reports.employeeSales, { params: { period } });
    return data;
  }
};
