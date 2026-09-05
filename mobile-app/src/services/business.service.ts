import { api } from "@/api/client";
import { endpoints } from "@/api/endpoints";
import { queueOfflineMutation } from "@/services/offline-mutation.service";
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
    try {
      const { data } = await api.patch<BusinessProfile>(endpoints.businesses.update(businessId), payload);
      return toAuthBusiness(data);
    } catch (error) {
      return queueOfflineMutation(error, { method: "PATCH", url: endpoints.businesses.update(businessId), data: payload }, {
        id: businessId,
        name: payload.name ?? "Business",
        about: payload.about,
        currency: payload.currency,
        timezone: payload.timezone
      });
    }
  },

  async updateSettings(businessId: string, payload: Partial<NonNullable<BusinessConfig["settings"]>>) {
    try {
      const { data } = await api.patch(endpoints.businesses.settings(businessId), payload);
      return data;
    } catch (error) {
      return queueOfflineMutation(error, { method: "PATCH", url: endpoints.businesses.settings(businessId), data: payload }, payload);
    }
  },

  async updateReceiptSettings(businessId: string, payload: Partial<NonNullable<BusinessConfig["receiptSettings"]>>) {
    try {
      const { data } = await api.patch(endpoints.businesses.receiptSettings(businessId), payload);
      return data;
    } catch (error) {
      return queueOfflineMutation(error, { method: "PATCH", url: endpoints.businesses.receiptSettings(businessId), data: payload }, payload);
    }
  },

  async updateTaxSettings(businessId: string, payload: Partial<NonNullable<BusinessConfig["taxSettings"]>>) {
    try {
      const { data } = await api.patch(endpoints.businesses.taxSettings(businessId), payload);
      return data;
    } catch (error) {
      return queueOfflineMutation(error, { method: "PATCH", url: endpoints.businesses.taxSettings(businessId), data: payload }, payload);
    }
  },

  async updateNotificationSettings(businessId: string, payload: Partial<NonNullable<BusinessConfig["notificationSettings"]>>) {
    try {
      const { data } = await api.patch(endpoints.businesses.notificationSettings(businessId), payload);
      return data;
    } catch (error) {
      return queueOfflineMutation(error, { method: "PATCH", url: endpoints.businesses.notificationSettings(businessId), data: payload }, payload);
    }
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
