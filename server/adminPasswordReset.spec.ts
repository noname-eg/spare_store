import { describe, it, expect, vi } from "vitest";
import { resetAdminPassword, MIN_PASSWORD_LENGTH } from "./adminPasswordReset";
import { verifyPassword } from "./auth";

const URL_BASE = "https://project.supabase.co";
const KEY = "service-role-key";

type Call = { url: string; method: string; body?: string };

function makeFetch(rows: { id: string; username: string }[] | null, overrides: { status?: number } = {}) {
  const calls: Call[] = [];
  const impl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method || "GET";
    calls.push({ url, method, body: typeof init?.body === "string" ? init.body : undefined });

    if (method === "GET") {
      if (overrides.status) return new Response("{}", { status: overrides.status });
      return new Response(JSON.stringify(rows), { status: 200 });
    }
    return new Response(null, { status: 204 });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const base = { supabaseUrl: URL_BASE, serviceRoleKey: KEY, username: "Casper", password: "longenough1" };

describe("resetAdminPassword", () => {
  it("stores a scrypt hash that the stored password verifies against", async () => {
    const { impl, calls } = makeFetch([{ id: "admin-1", username: "Casper" }]);
    await resetAdminPassword({ ...base, fetchImpl: impl });

    const patch = calls.find((call) => call.method === "PATCH" && call.url.includes("admin_users"));
    const stored = JSON.parse(patch!.body!).password_hash as string;
    expect(stored).toMatch(/^[\w-]+:[\w-]+$/);
    await expect(verifyPassword("longenough1", stored)).resolves.toBe(true);
    await expect(verifyPassword("something-else", stored)).resolves.toBe(false);
  });

  it("never sends the plaintext password to Supabase", async () => {
    const { impl, calls } = makeFetch([{ id: "admin-1", username: "Casper" }]);
    await resetAdminPassword({ ...base, fetchImpl: impl });
    for (const call of calls) expect(call.body || "").not.toContain("longenough1");
  });

  it("revokes live sessions so a cookie captured before the reset dies", async () => {
    const { impl, calls } = makeFetch([{ id: "admin-1", username: "Casper" }]);
    const result = await resetAdminPassword({ ...base, fetchImpl: impl });
    expect(result.revokedSessions).toBe(true);

    const revoke = calls.find((call) => call.url.includes("admin_sessions"));
    expect(revoke).toBeDefined();
    expect(revoke!.method).toBe("PATCH");
    expect(revoke!.url).toContain("admin_user_id=eq.admin-1");
    expect(JSON.parse(revoke!.body!).revoked_at).toEqual(expect.any(String));
  });

  it("still reports success when session revocation fails", async () => {
    const calls: string[] = [];
    const impl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method || "GET";
      calls.push(url);
      if (method === "GET") return new Response(JSON.stringify([{ id: "admin-1", username: "Casper" }]), { status: 200 });
      if (url.includes("admin_sessions")) throw new Error("network down");
      return new Response(null, { status: 204 });
    }) as unknown as typeof fetch;

    const result = await resetAdminPassword({ ...base, fetchImpl: impl });
    expect(result.revokedSessions).toBe(false);
  });

  it("rejects an unknown username without touching the password", async () => {
    const { impl, calls } = makeFetch([]);
    await expect(resetAdminPassword({ ...base, fetchImpl: impl })).rejects.toThrow(/No admin found/);
    expect(calls.some((call) => call.method === "PATCH")).toBe(false);
  });

  it(`rejects a password shorter than ${MIN_PASSWORD_LENGTH} characters`, async () => {
    const { impl } = makeFetch([{ id: "admin-1", username: "Casper" }]);
    await expect(resetAdminPassword({ ...base, password: "short", fetchImpl: impl })).rejects.toThrow(/at least/i);
  });

  it("fails closed when Supabase credentials are missing", async () => {
    const { impl } = makeFetch([]);
    await expect(
      resetAdminPassword({ ...base, serviceRoleKey: "", fetchImpl: impl })
    ).rejects.toThrow(/SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/);
  });
});
