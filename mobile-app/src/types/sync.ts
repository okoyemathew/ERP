import type { CreateSalePayload } from "./sales";

export type SyncOperationType = "SALE_CREATE";
export type SyncQueueStatus = "PENDING" | "SYNCING" | "SYNCED" | "FAILED";

export interface SyncQueueItem {
  id: string;
  type: SyncOperationType;
  payload: CreateSalePayload;
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
