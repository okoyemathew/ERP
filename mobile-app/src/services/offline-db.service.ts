import * as SQLite from "expo-sqlite";
import type { ApiCustomer } from "@/types/customer";
import type { ApiExpense, CreateExpensePayload, ExpenseCategory } from "@/types/expense";
import type { ApiProduct, ProductReturnRequest } from "@/types/product";
import type { ApiMutationPayload, SyncPayload, SyncQueueItem, SyncOperationType, SyncQueueStatus } from "@/types/sync";
import type { ApiSale, CreateSalePayload } from "@/types/sales";

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function normalizePhone(phone?: string | null) {
  return (phone ?? "").replace(/\D/g, "") || (phone ?? "").trim().toLowerCase();
}

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
    CREATE TABLE IF NOT EXISTS product_return_request_cache (
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

  async replaceQueuedSaleCustomerByPhone(businessId: string, phone: string, serverCustomer: ApiCustomer) {
    const db = await getDb();
    const targetPhone = normalizePhone(phone);
    const localCustomers = (await this.getCachedCustomers(businessId)).filter((customer) => normalizePhone(customer.phone) === targetPhone);
    if (localCustomers.length === 0) {
      await this.cacheCustomer(businessId, serverCustomer);
      return;
    }

    const localCustomerIds = new Set(localCustomers.map((customer) => customer.id));
    const rows = await db.getAllAsync<{ id: string; payload: string }>(
      "SELECT id, payload FROM sync_queue WHERE type = 'SALE_CREATE' AND status IN ('PENDING', 'FAILED', 'SYNCING')"
    );
    const updatedAt = new Date().toISOString();

    for (const row of rows) {
      const payload = JSON.parse(row.payload) as CreateSalePayload;
      if (!payload.customerId || !localCustomerIds.has(payload.customerId)) continue;

      await db.runAsync(
        "UPDATE sync_queue SET payload = ?, updatedAt = ? WHERE id = ?",
        JSON.stringify({ ...payload, customerId: serverCustomer.id }),
        updatedAt,
        row.id
      );
    }

    await this.cacheCustomer(businessId, serverCustomer);
    for (const localCustomer of localCustomers) {
      if (localCustomer.id !== serverCustomer.id) {
        await this.removeCachedCustomer(businessId, localCustomer.id);
      }
    }
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

  async cacheProductReturnRequests(businessId: string, requests: ProductReturnRequest[]) {
    const db = await getDb();
    const updatedAt = new Date().toISOString();
    for (const request of requests) {
      await db.runAsync(
        "INSERT OR REPLACE INTO product_return_request_cache (id, businessId, payload, updatedAt) VALUES (?, ?, ?, ?)",
        request.id,
        businessId,
        JSON.stringify(request),
        updatedAt
      );
    }
  },

  async cacheProductReturnRequest(businessId: string, request: ProductReturnRequest) {
    await this.cacheProductReturnRequests(businessId, [request]);
  },

  async getCachedProductReturnRequests(businessId: string): Promise<ProductReturnRequest[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<{ payload: string }>(
      "SELECT payload FROM product_return_request_cache WHERE businessId = ? ORDER BY updatedAt DESC",
      businessId
    );
    return rows.map((row) => JSON.parse(row.payload) as ProductReturnRequest);
  },

  async getQueuedOfflineSales(businessId: string): Promise<ApiSale[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<{
      id: string;
      payload: string;
      status: SyncQueueStatus;
      createdAt: string;
      updatedAt: string;
    }>(
      "SELECT id, payload, status, createdAt, updatedAt FROM sync_queue WHERE type = 'SALE_CREATE' AND status IN ('PENDING', 'FAILED', 'SYNCING') ORDER BY createdAt DESC"
    );
    const [customers, products] = await Promise.all([
      this.getCachedCustomers(businessId),
      this.getCachedProducts(businessId)
    ]);
    const customersById = new Map(customers.map((customer) => [customer.id, customer]));
    const productsById = new Map(products.map((product) => [product.id, product]));

    return rows.map((row) => {
      const payload = JSON.parse(row.payload) as CreateSalePayload;
      const items = payload.items ?? [];
      const payments = payload.payments ?? [];
      const subtotal = items.reduce((sum, item) => sum + item.quantity * Number(item.unitPrice ?? 0), 0);
      const discountAmount = items.reduce((sum, item) => sum + Number(item.discountAmount ?? 0), 0);
      const taxAmount = items.reduce((sum, item) => sum + Number(item.taxAmount ?? 0), 0);
      const totalAmount = Math.max(0, subtotal - discountAmount + taxAmount);
      const nonCreditPaid = payments
        .filter((payment) => payment.paymentMethod !== "CREDIT")
        .reduce((sum, payment) => sum + payment.amount, 0);
      const amountPaid = Math.min(totalAmount, nonCreditPaid);
      const balanceDue = Math.max(0, totalAmount - amountPaid);
      const customer = payload.customerId ? customersById.get(payload.customerId) : null;
      const saleNumber = `OFF-${row.id.slice(-8).toUpperCase()}`;

      return {
        id: row.id,
        localSyncStatus: row.status,
        saleNumber,
        customerId: payload.customerId ?? null,
        userId: "offline-user",
        subtotal,
        discountAmount,
        taxAmount,
        totalAmount,
        amountPaid,
        balanceDue,
        paymentStatus: amountPaid >= totalAmount ? "PAID" : amountPaid > 0 ? "PARTIAL" : "UNPAID",
        status: payments.length > 0 ? "COMPLETED" : "PENDING",
        saleDate: row.createdAt,
        customer: customer ?? null,
        user: {
          id: "offline-user",
          firstName: "Offline",
          lastName: "Sale",
          username: "offline"
        },
        items: items.map((item, index) => {
          const product = productsById.get(item.productId);
          const unitPrice = Number(item.unitPrice ?? product?.sellingPrice ?? 0);
          const lineDiscount = Number(item.discountAmount ?? 0);
          const lineTax = Number(item.taxAmount ?? 0);
          return {
            id: `${row.id}-item-${index}`,
            productId: item.productId,
            quantity: item.quantity,
            unitPrice,
            discountAmount: lineDiscount,
            taxAmount: lineTax,
            totalAmount: Math.max(0, item.quantity * unitPrice - lineDiscount + lineTax),
            product: {
              id: item.productId,
              name: product?.name ?? "Product",
              sku: product?.sku ?? null,
              barcode: product?.barcode ?? null
            }
          };
        }),
        payments: payments.map((payment, index) => ({
          id: `${row.id}-payment-${index}`,
          paymentMethod: payment.paymentMethod,
          amount: payment.amount,
          referenceNumber: payment.referenceNumber ?? null,
          paymentDate: row.createdAt
        })),
        receipt: payments.length > 0
          ? { id: row.id, receiptNumber: saleNumber }
          : null
      };
    });
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
