import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const DEVICE_ID_KEY = "smartpos.deviceId";

function createDeviceId() {
  return `device-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export const deviceService = {
  async getDeviceInfo() {
    let deviceId = await SecureStore.getItemAsync(DEVICE_ID_KEY);
    if (!deviceId) {
      deviceId = createDeviceId();
      await SecureStore.setItemAsync(DEVICE_ID_KEY, deviceId);
    }

    return {
      deviceId,
      deviceType: Platform.OS,
      deviceName: `${Platform.OS} POS device`
    };
  }
};
