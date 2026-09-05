import { api } from "@/api/client";
import { endpoints } from "@/api/endpoints";
import { queueOfflineMutation } from "@/services/offline-mutation.service";
import type { ApiNotification, NotificationListResponse } from "@/types/notification";

export const notificationsService = {
  async list(params?: { isRead?: boolean; type?: string; limit?: number }): Promise<NotificationListResponse> {
    const { data } = await api.get<NotificationListResponse>(endpoints.notifications.list, { params });
    return data;
  },

  async markRead(id: string): Promise<ApiNotification> {
    try {
      const { data } = await api.patch<ApiNotification>(endpoints.notifications.markRead(id));
      return data;
    } catch (error) {
      return queueOfflineMutation(error, { method: "PATCH", url: endpoints.notifications.markRead(id) }, {
        id,
        title: "Notification",
        message: "",
        type: "INFO",
        isRead: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      } as ApiNotification);
    }
  },

  async markAllRead() {
    try {
      const { data } = await api.patch(endpoints.notifications.markAllRead);
      return data;
    } catch (error) {
      return queueOfflineMutation(error, { method: "PATCH", url: endpoints.notifications.markAllRead }, { queued: true });
    }
  }
};
