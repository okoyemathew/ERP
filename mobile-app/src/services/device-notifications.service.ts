import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { businessService } from "@/services/business.service";
import { notificationsService } from "@/services/notifications.service";
import type { ApiNotification } from "@/types/notification";

const CHANNEL_ID = "business-alerts";
const POLL_INTERVAL_MS = 45000;

type ExpoNotificationsModule = typeof import("expo-notifications");

let pollTimer: ReturnType<typeof setInterval> | null = null;
let polling = false;
let notificationsModule: Promise<ExpoNotificationsModule | null> | null = null;
let notificationHandlerConfigured = false;
let notificationPermissionStatus = {
  PermissionStatus: { GRANTED: "granted" },
  IosAuthorizationStatus: { AUTHORIZED: 2, PROVISIONAL: 3, EPHEMERAL: 4 }
};

async function getNotificationsModule() {
  if (!notificationsModule) {
    notificationsModule = import("expo-notifications")
      .then((module) => {
        if (!notificationHandlerConfigured) {
          module.setNotificationHandler({
            handleNotification: async () => ({
              shouldShowAlert: true,
              shouldShowBanner: true,
              shouldShowList: true,
              shouldPlaySound: true,
              shouldSetBadge: true
            })
          });
          notificationHandlerConfigured = true;
        }
        notificationPermissionStatus = module;

        return module;
      })
      .catch(() => null);
  }

  return notificationsModule;
}

function stateKey(businessId: string, userId: string) {
  return `device-notifications:last-seen:${businessId}:${userId}`;
}

async function configureNotificationChannel() {
  const Notifications = await getNotificationsModule();
  if (!Notifications) return null;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: "Business alerts",
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#1565C0"
    });
  }

  return Notifications;
}

function isGranted(permission: import("expo-notifications").NotificationPermissionsStatus) {
  const iosStatus = permission.ios?.status;
  return permission.granted || permission.status === notificationPermissionStatus.PermissionStatus.GRANTED ||
    iosStatus === notificationPermissionStatus.IosAuthorizationStatus.AUTHORIZED ||
    iosStatus === notificationPermissionStatus.IosAuthorizationStatus.PROVISIONAL ||
    iosStatus === notificationPermissionStatus.IosAuthorizationStatus.EPHEMERAL;
}

async function ensurePermission() {
  const Notifications = await configureNotificationChannel();
  if (!Notifications) return false;

  const current = await Notifications.getPermissionsAsync();
  return isGranted(current);
}

async function requestPermission() {
  const Notifications = await configureNotificationChannel();
  if (!Notifications) return { available: false, granted: false, canAskAgain: false };

  const current = await Notifications.getPermissionsAsync();
  if (isGranted(current)) return { available: true, granted: true, canAskAgain: current.canAskAgain };

  const requested = await Notifications.requestPermissionsAsync();
  return { available: true, granted: isGranted(requested), canAskAgain: requested.canAskAgain };
}

async function pushEnabled(businessId: string) {
  try {
    const config = await businessService.config(businessId);
    return config.notificationSettings?.pushNotifications !== false;
  } catch {
    return true;
  }
}

async function notifyDevice(notification: ApiNotification) {
  const Notifications = await getNotificationsModule();
  if (!Notifications) return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: notification.title,
      body: notification.message,
      data: {
        notificationId: notification.id,
        type: notification.type
      },
      sound: true
    },
    trigger: null
  });
}

async function pollForNotifications(businessId: string, userId: string) {
  if (polling) return;
  polling = true;

  try {
    if (!(await pushEnabled(businessId))) return;

    const hasPermission = await ensurePermission();
    if (!hasPermission) return;

    const key = stateKey(businessId, userId);
    const response = await notificationsService.list({ isRead: false, limit: 20 });
    const latestCreatedAt = response.data.reduce<string | null>((latest, notification) => {
      if (!latest || new Date(notification.createdAt).getTime() > new Date(latest).getTime()) {
        return notification.createdAt;
      }
      return latest;
    }, null);

    const lastSeen = await SecureStore.getItemAsync(key);
    if (!lastSeen) {
      if (latestCreatedAt) {
        await SecureStore.setItemAsync(key, latestCreatedAt);
      }
      return;
    }

    const newNotifications = response.data
      .filter((notification) => new Date(notification.createdAt).getTime() > new Date(lastSeen).getTime())
      .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());

    for (const notification of newNotifications) {
      await notifyDevice(notification);
    }

    if (latestCreatedAt) {
      await SecureStore.setItemAsync(key, latestCreatedAt);
    }
  } catch {
    // Device notifications should never interrupt normal app usage.
  } finally {
    polling = false;
  }
}

export const deviceNotificationsService = {
  getPermissionStatus: async () => {
    const Notifications = await configureNotificationChannel();
    if (!Notifications) return { available: false, granted: false, canAskAgain: false };
    const permission = await Notifications.getPermissionsAsync();
    return { available: true, granted: isGranted(permission), canAskAgain: permission.canAskAgain };
  },
  requestPermission,
  start(businessId?: string | null, userId?: string | null) {
    if (!businessId || !userId) return () => undefined;

    void pollForNotifications(businessId, userId);
    pollTimer = setInterval(() => {
      void pollForNotifications(businessId, userId);
    }, POLL_INTERVAL_MS);

    return () => {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    };
  }
};
