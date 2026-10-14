import "server-only";
import { cookies } from "next/headers";
import { databasePool } from "./pool";
import { financeClient } from "./client";
import { authService } from "../auth/service";
import { encryptionKey } from "../auth/crypto";
import { sessionCookieOptions } from "../auth/cookie-options";
export async function createClient() {
  const key = encryptionKey(); if (!key) throw new Error("Authentication configuration unavailable");
  const pool = databasePool(); const store = await cookies();
  const options = sessionCookieOptions();
  const name = options.secure ? "__Host-o2c-session" : "o2c-session";
  const session = { read: () => store.get(name)?.value,
    write: (token: string, maxAge: number) => { store.set(name, token, { ...options, maxAge }); },
    clear: () => { store.set(name, "", { ...options, maxAge: 0 }); } };
  return { ...financeClient(pool, session.read), auth: authService(pool, session, key) };
}
