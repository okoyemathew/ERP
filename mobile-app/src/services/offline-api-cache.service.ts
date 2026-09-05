import * as SQLite from "expo-sqlite";

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function getDb() {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync("smart-pos-offline.db");
  }
  const db = await dbPromise;
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS api_response_cache (
      cacheKey TEXT PRIMARY KEY NOT NULL,
      payload TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
  `);
  return db;
}

function normalizeUrl(url?: string) {
  if (!url) return "";
  try {
    const parsed = url.startsWith("http") ? new URL(url) : new URL(url, "https://offline.local");
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}

function stableStringify(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const objectValue = value as Record<string, unknown>;
  return `{${Object.keys(objectValue)
    .sort()
    .filter((key) => objectValue[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${stableStringify(objectValue[key])}`)
    .join(",")}}`;
}

export function apiCacheKey(method?: string, url?: string, params?: unknown) {
  return `${(method ?? "GET").toUpperCase()} ${normalizeUrl(url)} ${stableStringify(params)}`;
}

export const offlineApiCacheService = {
  async set(cacheKey: string, payload: unknown) {
    const db = await getDb();
    await db.runAsync(
      "INSERT OR REPLACE INTO api_response_cache (cacheKey, payload, updatedAt) VALUES (?, ?, ?)",
      cacheKey,
      JSON.stringify(payload),
      new Date().toISOString()
    );
  },

  async get<T>(cacheKey: string): Promise<T | null> {
    const db = await getDb();
    const row = await db.getFirstAsync<{ payload: string }>(
      "SELECT payload FROM api_response_cache WHERE cacheKey = ?",
      cacheKey
    );
    return row ? (JSON.parse(row.payload) as T) : null;
  }
};
