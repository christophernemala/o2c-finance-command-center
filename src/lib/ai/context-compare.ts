import { toolDefinitions, tools } from "./tools";
import type { FieldCheck } from "@/types/operations";

/** Compare the input of a failed call with the tool's declared schema. Uses only recorded data. */
export function compareFields(toolName: string, input: Record<string, unknown> | null, error: string | null): FieldCheck[] {
  const entry = tools.find(candidate => candidate.name === toolName); if (!entry) return [];
  const schema = toolDefinitions([entry])[0].input_schema as { properties?: Record<string, { type?: string | string[]; enum?: unknown[]; anyOf?: { type?: string }[] }>; required?: string[] };
  const required = new Set(schema.required ?? []);
  return Object.entries(schema.properties ?? {}).map(([name, spec]) => {
    const types = spec.enum ? `one of ${spec.enum.join(", ")}` : [spec.type, ...(spec.anyOf ?? []).map(option => option.type)].flat().filter(Boolean).join(" or ") || "value";
    const value = input?.[name]; const absent = value === undefined || value === null || value === "";
    const sent = absent ? null : (typeof value === "string" ? value : JSON.stringify(value)).slice(0, 200);
    const flagged = error !== null && new RegExp(`\\b${name}\\b`).test(error);
    return { name, expected: types, required: required.has(name), sent, status: absent && required.has(name) ? "missing" : flagged ? "invalid" : "match" };
  });
}
