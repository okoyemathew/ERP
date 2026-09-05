import NetInfo from "@react-native-community/netinfo";
import { api } from "@/api/client";
import { endpoints } from "@/api/endpoints";
import { AppApiError } from "@/api/errors";
import { getRequiredBusinessId } from "@/api/session";
import { deviceService } from "@/services/device.service";
import type { CreateExpensePayload } from "@/types/expense";
import type { CreateSalePayload } from "@/types/sales";
import type { ApiMutationPayload, SyncQueueItem, SyncResult } from "@/types/sync";
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
    const businessId = await getRequiredBusinessId();
    const { deviceId } = await deviceService.getDeviceInfo();
    const operationId = payload.idempotencyKey ?? createOperationId(deviceId);
    const queuedPayload = { ...payload, deviceId, idempotencyKey: operationId };
    const queued = await offlineDbService.enqueueSale(operationId, queuedPayload);
    await offlineDbService.applySaleToCachedProducts(businessId, payload.items);
    return queued;
  },

  async enqueueExpense(payload: CreateExpensePayload) {
    const { deviceId } = await deviceService.getDeviceInfo();
    const operationId = `expense-${createOperationId(deviceId)}`;
    const queuedPayload = {
      ...payload,
      deviceId,
      receiptNumber: payload.receiptNumber ?? operationId
    };
    return offlineDbService.enqueueExpense(operationId, queuedPayload);
  },

  async enqueueMutation(payload: Omit<ApiMutationPayload, "deviceId">) {
    const { deviceId } = await deviceService.getDeviceInfo();
    const operationId = `api-${createOperationId(deviceId)}`;
    return offlineDbService.enqueueApiMutation(operationId, { ...payload, deviceId });
  },

  async syncApiMutations(operations: SyncQueueItem[]) {
    let synced = 0;
    let failed = 0;

    for (const operation of operations) {
      const payload = operation.payload as ApiMutationPayload;
      try {
        await api.request({
          method: payload.method,
          url: payload.url,
          data: payload.data,
          params: payload.params
        });
        await offlineDbService.markSynced(operation.id);
        synced += 1;
      } catch (error) {
        if (error instanceof AppApiError && (error.code === "NETWORK" || error.code === "TIMEOUT")) {
          await offlineDbService.markPending([operation.id]);
          return { synced, failed, interrupted: true };
        }
        await offlineDbService.markFailed(operation.id, error instanceof Error ? error.message : "Sync failed");
        failed += 1;
      }
    }

    return { synced, failed, interrupted: false };
  },

  async syncPending() {
    if (!(await this.isOnline())) return { synced: 0, failed: 0 };
    const operations = await offlineDbService.pendingOperations();
    if (operations.length === 0) return { synced: 0, failed: 0 };

    const operationIds = operations.map((operation) => operation.id);
    await offlineDbService.markSyncing(operationIds);
    const apiMutations = operations.filter((operation) => operation.type === "API_MUTATION");
    const serverSyncOperations = operations.filter((operation) => operation.type !== "API_MUTATION");
    const apiMutationResult = await this.syncApiMutations(apiMutations);
    if (apiMutationResult.interrupted || serverSyncOperations.length === 0) {
      return { synced: apiMutationResult.synced, failed: apiMutationResult.failed };
    }

    let data: { results: SyncResult[] };
    try {
      const response = await api.post<{ results: SyncResult[] }>(endpoints.sync.batch, {
        operations: serverSyncOperations.map((operation) => ({
          operationId: operation.id,
          type: operation.type,
          deviceId: operation.payload.deviceId,
          payload: operation.payload
        }))
      });
      data = response.data;
    } catch (error) {
      if (error instanceof AppApiError && (error.code === "NETWORK" || error.code === "TIMEOUT")) {
        await offlineDbService.markPending(operationIds);
        return { synced: 0, failed: 0 };
      }
      await offlineDbService.markPending(operationIds);
      throw error;
    }

    let synced = apiMutationResult.synced;
    let failed = apiMutationResult.failed;
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
    const interval = setInterval(() => {
      void this.syncPending().catch(() => undefined);
    }, 30000);
    void this.syncPending().catch(() => undefined);
    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }
};
