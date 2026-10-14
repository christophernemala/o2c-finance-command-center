import "server-only";
import { Pool } from "pg";
import { postgresConfig } from "./config";
import type { SqlPool } from "./transaction";
const globalDatabase = globalThis as typeof globalThis & { o2cPool?: Pool };
export function databasePool(): SqlPool {
  const settings = postgresConfig(); if (!settings) throw new Error("Database connection unavailable");
  globalDatabase.o2cPool ??= new Pool({ ...settings, max: 5, connectionTimeoutMillis: 5000, idleTimeoutMillis: 10000, allowExitOnIdle: true });
  // Pool errors must be handled without logging connection strings or financial data.
  if (!globalDatabase.o2cPool.listenerCount("error")) globalDatabase.o2cPool.on("error", () => {});
  return globalDatabase.o2cPool as unknown as SqlPool;
}
