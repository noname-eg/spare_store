import { hashPassword } from "./auth";

export const MIN_PASSWORD_LENGTH = 8;

export type AdminPasswordRow = { id: string; username: string };

export type ResetAdminPasswordOptions = {
  supabaseUrl: string;
  serviceRoleKey: string;
  username: string;
  password: string;
  /** Injected in tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
};

export type ResetAdminPasswordResult = {
  id: string;
  username: string;
  /** Active sessions revoked for this admin, so a leaked cookie cannot survive a reset. */
  revokedSessions: boolean;
};

function requireConfig(url: string | undefined, key: string | undefined): asserts url is string {
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to reset an admin password.");
  }
}

function authHeaders(serviceRoleKey: string): Record<string, string> {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
    Prefer: "return=minimal",
  };
}

/**
 * Replaces an admin password and revokes every live session for that account.
 *
 * The password is never logged or returned: only the scrypt hash reaches Supabase,
 * and revocation means a session cookie captured before the reset stops working.
 */
export async function resetAdminPassword(options: ResetAdminPasswordOptions): Promise<ResetAdminPasswordResult> {
  requireConfig(options.supabaseUrl, options.serviceRoleKey);

  const username = options.username.trim();
  if (!username) throw new Error("A username is required.");

  if (options.password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }

  const base = options.supabaseUrl.replace(/\/+$/, "");
  const doFetch = options.fetchImpl || fetch;
  const headers = authHeaders(options.serviceRoleKey);
  const query = encodeURIComponent(username);

  const lookup = await doFetch(`${base}/rest/v1/admin_users?username=eq.${query}&select=id,username`, { headers });
  if (!lookup.ok) throw new Error(`Unable to look up admin (${lookup.status}).`);
  const rows = (await lookup.json()) as AdminPasswordRow[] | null;
  const admin = rows && rows[0];
  if (!admin) throw new Error(`No admin found with username "${username}".`);

  const passwordHash = await hashPassword(options.password);

  const update = await doFetch(`${base}/rest/v1/admin_users?id=eq.${encodeURIComponent(admin.id)}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ password_hash: passwordHash }),
  });
  if (!update.ok) throw new Error(`Unable to update password (${update.status}).`);

  // Best effort: a failure here must not report the reset as failed, the password is already changed.
  let revokedSessions = false;
  try {
    const revoke = await doFetch(
      `${base}/rest/v1/admin_sessions?admin_user_id=eq.${encodeURIComponent(admin.id)}&revoked_at=is.null`,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify({ revoked_at: new Date().toISOString() }),
      }
    );
    revokedSessions = revoke.ok;
  } catch {
    revokedSessions = false;
  }

  return { id: admin.id, username: admin.username, revokedSessions };
}
