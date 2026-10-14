export function postgresConfig(env: Record<string, string | undefined> = process.env) {
  const connectionString = env.DATABASE_URL;
  if (!connectionString) return null;
  try {
    const url = new URL(connectionString);
    if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || !url.username || !url.pathname || url.pathname === "/") return null;
    const local = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
    const mode = url.searchParams.get("sslmode");
    if (mode && !["disable", "verify-full"].includes(mode)) return null;
    if (!local && mode === "disable") return null;
    // pg connection-string SSL flags may override explicit verification; normalize them.
    for (const key of ["ssl", "sslmode", "sslcert", "sslkey", "sslrootcert", "uselibpqcompat"]) url.searchParams.delete(key);
    return { connectionString: url.toString(), ssl: local && mode !== "verify-full" ? false as const : { rejectUnauthorized: true, ...(env.DATABASE_SSL_CA ? { ca: env.DATABASE_SSL_CA } : {}) } };
  } catch { return null; }
}
