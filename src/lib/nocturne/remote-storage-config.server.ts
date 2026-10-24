/** Resolve server-only Turso credentials as a pair; never mix database integrations. */
export function remoteStorageConfig(env: Record<string, string | undefined> = process.env) {
  const canonical = [env["TURSO_DATABASE_URL"]?.trim(), env["TURSO_AUTH_TOKEN"]?.trim()];
  const integration = [
    env["TURSO_DATABASE_TURSO_DATABASE_URL"]?.trim(),
    env["TURSO_DATABASE_TURSO_AUTH_TOKEN"]?.trim(),
  ];
  const [url, authToken] = canonical.some(Boolean) ? canonical : integration;
  if (!url && !authToken) return undefined;
  if (!url || !authToken || !/^(libsql|https):\/\//.test(url))
    throw new Error("REMOTE_DATABASE_NOT_CONFIGURED");
  return { url, authToken };
}
