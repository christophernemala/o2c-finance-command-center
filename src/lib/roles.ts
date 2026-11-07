/** Display names for the stored roles. Stored values and every database permission check are unchanged. */
const labels: Record<string, string> = { admin: "Admin", approver: "AR Manager", maker: "AR Clerk", viewer: "Viewer" };
export function roleLabel(role: string): string { return labels[role] ?? role; }
