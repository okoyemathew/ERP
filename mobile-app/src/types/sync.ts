import type { CreateSalePayload } from "./sales";
import type { CreateExpensePayload } from "./expense";

export type SyncOperationType = "SALE_CREATE" | "EXPENSE_CREATE";
export type SyncQueueStatus = "PENDING" | "SYNCING" | "SYNCED" | "FAILED";
export type SyncPayload = (CreateSalePayload | CreateExpensePayload) & {
  deviceId?: string;
  idempotencyKey?: string;
};

export interface SyncQueueItem {
  id: string;
  type: SyncOperationType;
  payload: SyncPayload;
  status: SyncQueueStatus;
  attempts: number;
  lastError?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SyncResult {
  operationId: string;
  type: SyncOperationType;
  status: "SYNCED" | "DUPLICATE_CONFIRMED" | "FAILED";
  entity?: string;
  entityId?: string;
  syncVersion?: number;
  error?: string;
}
