import { api } from "@/api/client";
import { endpoints } from "@/api/endpoints";
import type { AuthBusiness } from "@/types/auth";
import type { BusinessConfig, BusinessProfile } from "@/types/business";
import type { ApiRole } from "@/types/employee";

function toAuthBusiness(profile: BusinessProfile): AuthBusiness {
  return {
    id: profile.id,
    name: profile.name,
    about: profile.about,
    legalName: profile.legalName,
    status: profile.status,
    currency: profile.currency,
    timezone: profile.timezone
  };
}

export const businessService = {
  async profile(businessId: string): Promise<AuthBusiness> {
    const { data } = await api.get<BusinessProfile>(endpoints.businesses.profile(businessId));
    return toAuthBusiness(data);
  },

  async config(businessId: string): Promise<BusinessConfig> {
    const { data } = await api.get<BusinessConfig>(endpoints.businesses.config(businessId));
    return data;
  },

  async updateBusiness(businessId: string, payload: Partial<BusinessConfig["business"]>): Promise<AuthBusiness> {
    const { data } = await api.patch<BusinessProfile>(endpoints.businesses.update(businessId), payload);
    return toAuthBusiness(data);
  },

  async updateSettings(businessId: string, payload: Partial<NonNullable<BusinessConfig["settings"]>>) {
    const { data } = await api.patch(endpoints.businesses.settings(businessId), payload);
    return data;
  },

  async updateReceiptSettings(businessId: string, payload: Partial<NonNullable<BusinessConfig["receiptSettings"]>>) {
    const { data } = await api.patch(endpoints.businesses.receiptSettings(businessId), payload);
    return data;
  },

  async updateTaxSettings(businessId: string, payload: Partial<NonNullable<BusinessConfig["taxSettings"]>>) {
    const { data } = await api.patch(endpoints.businesses.taxSettings(businessId), payload);
    return data;
  },

  async updateNotificationSettings(businessId: string, payload: Partial<NonNullable<BusinessConfig["notificationSettings"]>>) {
    const { data } = await api.patch(endpoints.businesses.notificationSettings(businessId), payload);
    return data;
  },

  async roles(businessId: string): Promise<ApiRole[]> {
    const { data } = await api.get<{ data: ApiRole[] }>(endpoints.businesses.roles(businessId));
    return data.data;
  },

  async permissions(businessId: string) {
    const { data } = await api.get<{ data: Array<{ id: string; name: string; module: string; description: string | null }> }>(
      endpoints.businesses.permissions(businessId)
    );
    return data.data;
  }
};
