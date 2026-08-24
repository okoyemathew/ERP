import { api } from "@/api/client";
import { endpoints } from "@/api/endpoints";
import type { ApiNotification, NotificationListResponse } from "@/types/notification";

export const notificationsService = {
  async list(params?: { isRead?: boolean; type?: string; limit?: number }): Promise<NotificationListResponse> {
    const { data } = await api.get<NotificationListResponse>(endpoints.notifications.list, { params });
    return data;
  },

  async markRead(id: string): Promise<ApiNotification> {
    const { data } = await api.patch<ApiNotification>(endpoints.notifications.markRead(id));
    return data;
  },

  async markAllRead() {
    const { data } = await api.patch(endpoints.notifications.markAllRead);
    return data;
  }
};
