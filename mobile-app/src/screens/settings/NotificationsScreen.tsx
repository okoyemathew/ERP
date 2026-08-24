import React, { useCallback, useEffect, useState } from "react";
import { Bell } from "lucide-react-native";
import { SimpleRow, ListScreen } from "@/screens/shared/ScreenKit";
import { EmptyState, ErrorState, LoadingState } from "@/components/common";
import { notificationsService } from "@/services/notifications.service";
import { colors } from "@/theme";
import type { ApiNotification } from "@/types/notification";

export function NotificationsScreen() {
  const [items, setItems] = useState<ApiNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const response = await notificationsService.list({ limit: 50 });
      setItems(response.data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  const handleRead = async (notification: ApiNotification) => {
    if (notification.isRead) return;
    setItems((current) => current.map((item) => (item.id === notification.id ? { ...item, isRead: true } : item)));
    try {
      await notificationsService.markRead(notification.id);
    } catch {
      setItems((current) => current.map((item) => (item.id === notification.id ? { ...item, isRead: false } : item)));
    }
  };

  return (
    <ListScreen
      title="Notifications"
      data={loading || error ? [] : items}
      keyExtractor={(item) => item.id}
      empty={
        loading ? (
          <LoadingState label="Loading notifications" />
        ) : error ? (
          <ErrorState onRetry={() => void loadNotifications()} />
        ) : (
          <EmptyState icon={<Bell size={28} color={colors.textPlaceholder} />} title="No notifications yet" />
        )
      }
      renderItem={({ item }) => (
        <SimpleRow
          title={item.title}
          subtitle={`${item.message} | ${new Date(item.createdAt).toLocaleString()}`}
          status={item.isRead ? "read" : "unread"}
          icon={<Bell size={17} color={colors.primary} />}
          onPress={() => void handleRead(item)}
        />
      )}
    />
  );
}
