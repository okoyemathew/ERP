import NetInfo from "@react-native-community/netinfo";
import { api } from "@/api/client";
import { endpoints } from "@/api/endpoints";
import { deviceService } from "@/services/device.service";
import type { CreateSalePayload } from "@/types/sales";
import type { SyncResult } from "@/types/sync";
import { offlineDbService } from "./offline-db.service";

function createOperationId(deviceId: string) {
  return `${deviceId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export const offlineSyncService = {
  async isOnline() {
    const state = await NetInfo.fetch();
    return Boolean(state.isConnected && state.isInternetReachable !== false);
  },

  async enqueueSale(payload: CreateSalePayload) {
    const { deviceId } = await deviceService.getDeviceInfo();
    const operationId = payload.idempotencyKey ?? createOperationId(deviceId);
    const queuedPayload = { ...payload, deviceId, idempotencyKey: operationId };
    return offlineDbService.enqueueSale(operationId, queuedPayload);
  },

  async syncPending() {
    if (!(await this.isOnline())) return { synced: 0, failed: 0 };
    const operations = await offlineDbService.pendingOperations();
    if (operations.length === 0) return { synced: 0, failed: 0 };

    await offlineDbService.markSyncing(operations.map((operation) => operation.id));
    const { data } = await api.post<{ results: SyncResult[] }>(endpoints.sync.batch, {
      operations: operations.map((operation) => ({
        operationId: operation.id,
        type: operation.type,
        deviceId: operation.payload.deviceId,
        payload: operation.payload
      }))
    });

    let synced = 0;
    let failed = 0;
    for (const result of data.results) {
      if (result.status === "SYNCED" || result.status === "DUPLICATE_CONFIRMED") {
        await offlineDbService.markSynced(result.operationId);
        synced += 1;
      } else {
        await offlineDbService.markFailed(result.operationId, result.error ?? "Sync failed");
        failed += 1;
      }
    }

    return { synced, failed };
  },

  startAutoSync() {
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) {
        void this.syncPending().catch(() => undefined);
      }
    });
    void this.syncPending().catch(() => undefined);
    return unsubscribe;
  }
};
