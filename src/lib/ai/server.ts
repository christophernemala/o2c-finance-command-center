import "server-only";
import { databasePool } from "../postgres/pool";
import { aiConfig } from "./config";
import { anthropicCaller } from "./loop";
export function aiDependencies() {
  const config = aiConfig();
  return { pool: databasePool(), config, call: config ? anthropicCaller(config.apiKey) : null };
}
