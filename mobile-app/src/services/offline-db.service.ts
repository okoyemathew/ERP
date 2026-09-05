import * as SQLite from "expo-sqlite";
import type { ApiCustomer } from "@/types/customer";
import type { ApiExpense, CreateExpensePayload, ExpenseCategory } from "@/types/expense";
import type { ApiProduct } from "@/types/product";
import type { ApiMutationPayload, SyncPayload, SyncQueueItem, SyncOperationType, SyncQueueStatus } from "@/types/sync";
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
    CREATE TABLE IF NOT EXISTS customer_cache (
      id TEXT PRIMARY KEY NOT NULL,
      businessId TEXT NOT NULL,
      payload TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS expense_cache (
      id TEXT PRIMARY KEY NOT NULL,
      businessId TEXT NOT NULL,
      payload TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS expense_category_cache (
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

  async cacheProduct(businessId: string, product: ApiProduct) {
    await this.cacheProducts(businessId, [product]);
  },

  async getCachedProducts(businessId: string): Promise<ApiProduct[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<{ payload: string }>(
      "SELECT payload FROM product_cache WHERE businessId = ? ORDER BY updatedAt DESC",
      businessId
    );
    return rows.map((row) => JSON.parse(row.payload) as ApiProduct);
  },

  async getCachedProduct(businessId: string, productId: string): Promise<ApiProduct | null> {
    const db = await getDb();
    const row = await db.getFirstAsync<{ payload: string }>(
      "SELECT payload FROM product_cache WHERE businessId = ? AND id = ?",
      businessId,
      productId
    );
    return row ? (JSON.parse(row.payload) as ApiProduct) : null;
  },

  async removeCachedProduct(businessId: string, productId: string) {
    const db = await getDb();
    await db.runAsync("DELETE FROM product_cache WHERE businessId = ? AND id = ?", businessId, productId);
  },

  async cacheCustomers(businessId: string, customers: ApiCustomer[]) {
    const db = await getDb();
    const updatedAt = new Date().toISOString();
    for (const customer of customers) {
      await db.runAsync(
        "INSERT OR REPLACE INTO customer_cache (id, businessId, payload, updatedAt) VALUES (?, ?, ?, ?)",
        customer.id,
        businessId,
        JSON.stringify(customer),
        updatedAt
      );
    }
  },

  async getCachedCustomers(businessId: string): Promise<ApiCustomer[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<{ payload: string }>(
      "SELECT payload FROM customer_cache WHERE businessId = ? ORDER BY updatedAt DESC",
      businessId
    );
    return rows.map((row) => JSON.parse(row.payload) as ApiCustomer);
  },

  async cacheCustomer(businessId: string, customer: ApiCustomer) {
    await this.cacheCustomers(businessId, [customer]);
  },

  async removeCachedCustomer(businessId: string, customerId: string) {
    const db = await getDb();
    await db.runAsync("DELETE FROM customer_cache WHERE businessId = ? AND id = ?", businessId, customerId);
  },

  async cacheExpenses(businessId: string, expenses: ApiExpense[]) {
    const db = await getDb();
    const updatedAt = new Date().toISOString();
    for (const expense of expenses) {
      await db.runAsync(
        "INSERT OR REPLACE INTO expense_cache (id, businessId, payload, updatedAt) VALUES (?, ?, ?, ?)",
        expense.id,
        businessId,
        JSON.stringify(expense),
        updatedAt
      );
    }
  },

  async cacheExpense(businessId: string, expense: ApiExpense) {
    await this.cacheExpenses(businessId, [expense]);
  },

  async getCachedExpenses(businessId: string): Promise<ApiExpense[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<{ payload: string }>(
      "SELECT payload FROM expense_cache WHERE businessId = ? ORDER BY updatedAt DESC",
      businessId
    );
    return rows.map((row) => JSON.parse(row.payload) as ApiExpense);
  },

  async removeCachedExpense(businessId: string, expenseId: string) {
    const db = await getDb();
    await db.runAsync("DELETE FROM expense_cache WHERE businessId = ? AND id = ?", businessId, expenseId);
  },

  async cacheExpenseCategories(businessId: string, categories: ExpenseCategory[]) {
    const db = await getDb();
    const updatedAt = new Date().toISOString();
    for (const category of categories) {
      await db.runAsync(
        "INSERT OR REPLACE INTO expense_category_cache (id, businessId, payload, updatedAt) VALUES (?, ?, ?, ?)",
        category.id,
        businessId,
        JSON.stringify(category),
        updatedAt
      );
    }
  },

  async getCachedExpenseCategories(businessId: string): Promise<ExpenseCategory[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<{ payload: string }>(
      "SELECT payload FROM expense_category_cache WHERE businessId = ? ORDER BY updatedAt DESC",
      businessId
    );
    return rows.map((row) => JSON.parse(row.payload) as ExpenseCategory);
  },

  async applySaleToCachedProducts(businessId: string, items: CreateSalePayload["items"]) {
    const db = await getDb();
    const updatedAt = new Date().toISOString();
    for (const item of items) {
      const row = await db.getFirstAsync<{ payload: string }>(
        "SELECT payload FROM product_cache WHERE businessId = ? AND id = ?",
        businessId,
        item.productId
      );
      if (!row) continue;

      const product = JSON.parse(row.payload) as ApiProduct;
      if (product.inventory) {
        const nextAvailable = Math.max(0, (product.inventory.quantityAvailable ?? 0) - item.quantity);
        const nextOnHand = Math.max(0, (product.inventory.quantityOnHand ?? 0) - item.quantity);
        product.inventory = {
          ...product.inventory,
          quantityAvailable: nextAvailable,
          quantityOnHand: nextOnHand
        };
      }

      await db.runAsync(
        "UPDATE product_cache SET payload = ?, updatedAt = ? WHERE businessId = ? AND id = ?",
        JSON.stringify(product),
        updatedAt,
        businessId,
        item.productId
      );
    }
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

  async enqueueExpense(id: string, payload: CreateExpensePayload): Promise<SyncQueueItem> {
    const db = await getDb();
    const now = new Date().toISOString();
    await db.runAsync(
      "INSERT OR REPLACE INTO sync_queue (id, type, payload, status, attempts, lastError, createdAt, updatedAt) VALUES (?, ?, ?, ?, COALESCE((SELECT attempts FROM sync_queue WHERE id = ?), 0), NULL, COALESCE((SELECT createdAt FROM sync_queue WHERE id = ?), ?), ?)",
      id,
      "EXPENSE_CREATE",
      JSON.stringify(payload),
      "PENDING",
      id,
      id,
      now,
      now
    );
    return { id, type: "EXPENSE_CREATE", payload, status: "PENDING", attempts: 0, lastError: null, createdAt: now, updatedAt: now };
  },

  async enqueueApiMutation(id: string, payload: ApiMutationPayload): Promise<SyncQueueItem> {
    const db = await getDb();
    const now = new Date().toISOString();
    await db.runAsync(
      "INSERT OR REPLACE INTO sync_queue (id, type, payload, status, attempts, lastError, createdAt, updatedAt) VALUES (?, ?, ?, ?, COALESCE((SELECT attempts FROM sync_queue WHERE id = ?), 0), NULL, COALESCE((SELECT createdAt FROM sync_queue WHERE id = ?), ?), ?)",
      id,
      "API_MUTATION",
      JSON.stringify(payload),
      "PENDING",
      id,
      id,
      now,
      now
    );
    return { id, type: "API_MUTATION", payload, status: "PENDING", attempts: 0, lastError: null, createdAt: now, updatedAt: now };
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
    return rows.map((row) => ({ ...row, payload: JSON.parse(row.payload) as SyncPayload }));
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

  async markPending(ids: string[]) {
    const db = await getDb();
    const now = new Date().toISOString();
    for (const id of ids) {
      await db.runAsync("UPDATE sync_queue SET status = 'PENDING', updatedAt = ? WHERE id = ? AND status = 'SYNCING'", now, id);
    }
  },

  async queueCount() {
    const db = await getDb();
    const row = await db.getFirstAsync<{ count: number }>("SELECT COUNT(*) AS count FROM sync_queue WHERE status IN ('PENDING', 'FAILED', 'SYNCING')");
    return row?.count ?? 0;
  }
};
