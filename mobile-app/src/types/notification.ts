export type NotificationType = "INFO" | "SUCCESS" | "WARNING" | "ERROR";

export interface ApiNotification {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  isRead: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationListResponse {
  unreadCount: number;
  data: ApiNotification[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
