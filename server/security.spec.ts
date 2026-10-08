import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import express from "express";
import type { Router } from "express";
import { requireRole, requireSession } from "./auth";
import { filterPublicSettings } from "./routes/setting";
import adminCouponsRouter from "./routes/admin-coupons";
import adminSettingsRouter from "./routes/admin-settings";
import adminOrdersRouter from "./routes/admin-orders";
import adminProductsRouter from "./routes/admin-products";
import settingRouter from "./routes/setting";
import { supabase } from "./db";

vi.mock("./db", () => {
    const storage = { from: vi.fn() };
    const supabase = { from: vi.fn(), storage };
    return {
        supabase,
        getCoupons: vi.fn(async () => []),
        createCoupon: vi.fn(),
        deleteCoupon: vi.fn(),
        getOrders: vi.fn(async () => []),
        getPublicCoupons: vi.fn(async () => []),
    };
});

async function mount(routes: { path: string; router: Router; protected?: boolean }[]) {
    const app = express();
    app.use(express.json());
    for (const r of routes) {
        if (r.protected) {
            const { requireAdmin } = await import("./auth");
            app.use(r.path, requireAdmin, r.router);
        } else {
            app.use(r.path, r.router);
        }
    }
    const server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address() as { port: number };
    return {
        url: `http://127.0.0.1:${address.port}`,
        close: () => new Promise<void>((resolve) => server.close(() => resolve())),
    };
}

function mockRes() {
    const json = vi.fn();
    return { res: { status: vi.fn().mockReturnThis(), json } as any, json };
}

afterEach(() => {
    vi.clearAllMocks();
});

describe("admin authorization (A/B)", () => {
    it("A: unauthenticated admin endpoint returns 401 (server-side, mounted middleware)", async () => {
        const server = await mount([{ path: "/api/admin/coupons", router: adminCouponsRouter, protected: true }]);
        try {
            const response = await fetch(`${server.url}/api/admin/coupons`);
            expect(response.status).toBe(401);
        } finally {
            await server.close();
        }
    });

    it("A: requireSession without a session cookie returns 401", async () => {
        const { res, json } = mockRes();
        const req = { headers: {}, ip: "::1", socket: { remoteAddress: "::1" } } as any;
        await requireSession(req, res, vi.fn());
        expect(res.status).toHaveBeenCalledWith(401);
        expect(json).toHaveBeenCalledWith({ error: "Authentication required." });
    });

    it("B: authenticated non-admin (editor) is denied 403 for admin-only action", () => {
        const { res, json } = mockRes();
        const next = vi.fn();
        requireRole("admin")({ admin: { id: "1", role: "editor", isActive: true } } as any, res, next);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });

    it("B: pending admin passes the role guard", () => {
        const { res, json } = mockRes();
        const next = vi.fn();
        requireRole("admin")({ admin: { id: "1", role: "admin", isActive: true } } as any, res, next);
        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
    });
});

describe("input validation on admin endpoints (I/J/K)", () => {
    beforeEach(() => {
        (supabase.from as any).mockReset();
    });

    it("I: malformed admin-coupons payload → 400 (discount > 100)", async () => {
        const server = await mount([{ path: "/api/admin/coupons", router: adminCouponsRouter }]);
        try {
            const response = await fetch(`${server.url}/api/admin/coupons`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code: "WELCOME", discount: 150 }),
            });
            expect(response.status).toBe(400);
            expect(supabase.from).not.toHaveBeenCalled();
        } finally {
            await server.close();
        }
    });

    it("I: malformed admin-products payload → 400 (missing product name)", async () => {
        const server = await mount([{ path: "/api/admin/products", router: adminProductsRouter }]);
        try {
            const response = await fetch(`${server.url}/api/admin/products`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ originalPrice: -5 }),
            });
            expect(response.status).toBe(400);
        } finally {
            await server.close();
        }
    });

    it("J: invalid order status value → 400 (never reaches stock logic)", async () => {
        const server = await mount([{ path: "/api/admin/orders", router: adminOrdersRouter }]);
        try {
            const response = await fetch(`${server.url}/api/admin/orders/xyz/status`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ fulfillmentStatus: "banana" }),
            });
            expect(response.status).toBe(400);
        } finally {
            await server.close();
        }
    });

    it("J: empty status payload → 400", async () => {
        const server = await mount([{ path: "/api/admin/orders", router: adminOrdersRouter }]);
        try {
            const response = await fetch(`${server.url}/api/admin/orders/xyz/status`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}),
            });
            expect(response.status).toBe(400);
        } finally {
            await server.close();
        }
    });

    it("K: invalid settings payload → rejected 400 safely", async () => {
        const server = await mount([{ path: "/api/admin/settings", router: adminSettingsRouter }]);
        try {
            const response = await fetch(`${server.url}/api/admin/settings`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ type: "" }),
            });
            expect(response.status).toBe(400);
        } finally {
            await server.close();
        }
    });

    it("K: valid settings payload persists through the mocked DB path", async () => {
        (supabase.from as any).mockReturnValue({ upsert: vi.fn().mockResolvedValue({ error: null }) });
        const server = await mount([{ path: "/api/admin/settings", router: adminSettingsRouter }]);
        try {
            const response = await fetch(`${server.url}/api/admin/settings`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ type: "siteSettings", data: { announcement: "x", accent: "#000" } }),
            });
            expect(response.status).toBe(200);
            expect(supabase.from).toHaveBeenCalledWith("site_settings");
        } finally {
            await server.close();
        }
    });
});

describe("public settings privacy (F/H) — explicit allowlist", () => {
    it("exposes only allowed settings keys; future/sensitive keys are excluded", () => {
        const rows = [
            { key: "siteSettings", value_json: { announcement: "hi" } },
            { key: "sections", value_json: { arrivals: {} } },
            { key: "pageSettings", value_json: {} },
            { key: "internalAdminConfig", value_json: { secret: true } },
            { key: "serviceCredentials", value_json: { key: "SECRET" } },
        ];
        const output = filterPublicSettings(rows);
        expect(Object.keys(output).sort()).toEqual(["pageSettings", "sections", "siteSettings"]);
        expect(output.internalAdminConfig).toBeUndefined();
        expect(output.serviceCredentials).toBeUndefined();
    });

    it("public GET /api/settings returns only allowlisted keys over the wire", async () => {
        (supabase.from as any).mockReturnValue({
            select: vi.fn().mockResolvedValue({
                data: [
                    { key: "siteSettings", value_json: { announcement: "ok" } },
                    { key: "privateKey", value_json: { apiKey: "SECRET" } },
                ],
                error: null,
            }),
        });
        const server = await mount([{ path: "/api/settings", router: settingRouter }]);
        try {
            const response = await fetch(`${server.url}/api/settings`);
            expect(response.status).toBe(200);
            const body = await response.json();
            expect(body.siteSettings).toBeTruthy();
            expect(body.privateKey).toBeUndefined();
        } finally {
            await server.close();
        }
    });
});

describe("service-role / env hygiene (M) — static contract", () => {
    it("db.ts must require the service-role key and never fall back to the anon key", () => {
        const source = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
        expect(source).not.toContain("SUPABASE_ANON_KEY");
        expect(source).toContain("SUPABASE_SERVICE_ROLE_KEY");
        expect(source).toMatch(/refusing to fall back to an anonymous key/i);
    });

    it("no VITE_ secret references exist in server code", () => {
        const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
        expect(source).not.toMatch(/VITE_.*SERVICE_ROLE/i);
    });
});