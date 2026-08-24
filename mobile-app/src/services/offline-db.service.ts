import * as SQLite from "expo-sqlite";
import type { ApiProduct } from "@/types/product";
import type { SyncQueueItem, SyncOperationType, SyncQueueStatus } from "@/types/sync";
import type { CreateSalePayload } from "@/types/sales";

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function getDb() {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync("smart-pos-offline.db");
  }
  const db = await dbPromise;
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS product_cache (
      id TEXT PRIMARY KEY NOT NULL,
      businessId TEXT NOT NULL,
      payload TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sync_queue (
      id TEXT PRIMARY KEY NOT NULL,
      type TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      lastError TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
  `);
  return db;
}

export const offlineDbService = {
  async cacheProducts(businessId: string, products: ApiProduct[]) {
    const db = await getDb();
    const updatedAt = new Date().toISOString();
    for (const product of products) {
      await db.runAsync(
        "INSERT OR REPLACE INTO product_cache (id, businessId, payload, updatedAt) VALUES (?, ?, ?, ?)",
        product.id,
        businessId,
        JSON.stringify(product),
        updatedAt
      );
    }
  },

  async getCachedProducts(businessId: string): Promise<ApiProduct[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<{ payload: string }>(
      "SELECT payload FROM product_cache WHERE businessId = ? ORDER BY updatedAt DESC",
      businessId
    );
    return rows.map((row) => JSON.parse(row.payload) as ApiProduct);
  },

  async enqueueSale(id: string, payload: CreateSalePayload): Promise<SyncQueueItem> {
    const db = await getDb();
    const now = new Date().toISOString();
    await db.runAsync(
      "INSERT OR REPLACE INTO sync_queue (id, type, payload, status, attempts, lastError, createdAt, updatedAt) VALUES (?, ?, ?, ?, COALESCE((SELECT attempts FROM sync_queue WHERE id = ?), 0), NULL, COALESCE((SELECT createdAt FROM sync_queue WHERE id = ?), ?), ?)",
      id,
      "SALE_CREATE",
      JSON.stringify(payload),
      "PENDING",
      id,
      id,
      now,
      now
    );
    return { id, type: "SALE_CREATE", payload, status: "PENDING", attempts: 0, lastError: null, createdAt: now, updatedAt: now };
  },

  async pendingOperations(): Promise<SyncQueueItem[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<{
      id: string;
      type: SyncOperationType;
      payload: string;
      status: SyncQueueStatus;
      attempts: number;
      lastError: string | null;
      createdAt: string;
      updatedAt: string;
    }>("SELECT * FROM sync_queue WHERE status IN ('PENDING', 'FAILED', 'SYNCING') ORDER BY createdAt ASC LIMIT 25");
    return rows.map((row) => ({ ...row, payload: JSON.parse(row.payload) as CreateSalePayload }));
  },

  async markSyncing(ids: string[]) {
    const db = await getDb();
    const now = new Date().toISOString();
    for (const id of ids) {
      await db.runAsync("UPDATE sync_queue SET status = 'SYNCING', attempts = attempts + 1, updatedAt = ? WHERE id = ?", now, id);
    }
  },

  async markSynced(id: string) {
    const db = await getDb();
    await db.runAsync("UPDATE sync_queue SET status = 'SYNCED', lastError = NULL, updatedAt = ? WHERE id = ?", new Date().toISOString(), id);
  },

  async markFailed(id: string, error: string) {
    const db = await getDb();
    await db.runAsync("UPDATE sync_queue SET status = 'FAILED', lastError = ?, updatedAt = ? WHERE id = ?", error, new Date().toISOString(), id);
  },

  async queueCount() {
    const db = await getDb();
    const row = await db.getFirstAsync<{ count: number }>("SELECT COUNT(*) AS count FROM sync_queue WHERE status IN ('PENDING', 'FAILED', 'SYNCING')");
    return row?.count ?? 0;
  }
};
