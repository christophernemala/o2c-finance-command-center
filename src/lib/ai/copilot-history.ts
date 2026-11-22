export interface CopilotHistoryToolUse { tool: string; status: "ok" | "error" }

/** Expose only the tool name and recorded outcome; never render saved tool inputs as source metadata. */
export function copilotHistoryTools(value: unknown): CopilotHistoryToolUse[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(entry => {
    if (!entry || typeof entry !== "object") return [];
    const row = entry as { tool?: unknown; ok?: unknown };
    return typeof row.tool === "string" && typeof row.ok === "boolean"
      ? [{ tool: row.tool, status: row.ok ? "ok" as const : "error" as const }]
      : [];
  });
}
