import { z } from "zod";
import { positiveAmount } from "./money";
import { workspaces } from "@/types/workspace";
const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
const money = z.string().refine(value => { try { positiveAmount(value); return true; } catch { return false; } });
const version = z.string().regex(/^[1-9]\d{0,9}$/).transform(Number).refine(Number.isSafeInteger);
const scope = { tenant: uuid, entity: uuid, view: z.enum(workspaces).optional() };
export const credentialsSchema = z.object({
  email: z.string().trim().max(254).pipe(z.email()).transform(value => value.toLowerCase()),
  password: z.string().min(1).max(256),
});
export const signupPasswordSchema = z.object({
  password: z.string().min(12).max(256),
  confirm: z.string().min(12).max(256),
}).refine(value => value.password === value.confirm);
export const commandSchema = z.discriminatedUnion("intent", [
  z.object({ ...scope, intent: z.literal("propose"), id: uuid, kind: z.enum(["receipt", "allocation"]), amount: money,
    evidence: z.string().trim().min(10).max(2000), invoice: uuid.optional(), receipt: uuid.optional(), bank: uuid.optional(), customer: uuid.optional() }),
  z.object({ ...scope, intent: z.literal("approve"), id: uuid, version, acknowledge: z.literal("yes") }),
  z.object({ ...scope, intent: z.literal("reject"), id: uuid, version, acknowledge: z.literal("yes") }),
  z.object({ ...scope, intent: z.literal("execute"), id: uuid, version, acknowledge: z.literal("yes") }),
  z.object({ ...scope, intent: z.literal("commit"), id: uuid, acknowledge: z.literal("yes") }),
  z.object({ ...scope, intent: z.literal("stage"), kind: z.enum(["invoices", "bank_lines"]),
    file: z.instanceof(File).refine(file => file.size <= 1024 * 1024 && file.name.toLowerCase().endsWith(".csv")) }),
]);
