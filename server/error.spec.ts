import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Response } from "express";
import { sanitizeClientMessage, sendError } from "./error";

function makeRes() {
    const json = vi.fn();
    const res = { status: vi.fn().mockReturnThis(), json } as unknown as Response;
    return { res, json };
}

describe("error sanitization (L: no internal/DB leakage)", () => {
    beforeEach(() => vi.restoreAllMocks());

    it("passes through safe app-level 4xx messages and status", () => {
        const err = Object.assign(new Error("Not enough stock is available for this order"), { status: 409 });
        const out = sanitizeClientMessage(err);
        expect(out).toEqual({ status: 409, message: "Not enough stock is available for this order" });
    });

    it("sanitizes Postgres/Supabase internal messages to a generic 500", () => {
        const cases = [
            'duplicate key value violates unique constraint "products_pkey"',
            'relation "orders" does not exist',
            'invalid input syntax for type uuid: "no-such-product"',
            'permission denied for table site_settings',
            'PostgREST returned error. new row violates row-level security policy',
            'INSERT public.coupons ... violates check constraint',
        ];
        for (const message of cases) {
            const out = sanitizeClientMessage(Object.assign(new Error(message), { status: 500 }));
            expect(out.status).toBe(500);
            expect(out.message).not.toBe(message);
            expect(out.message.length).toBeGreaterThan(0);
        }
    });

    it("does not turn every error into a useless message (keeps safe 4xx)", () => {
        const err = Object.assign(new Error("Invalid coupon code"), { status: 422 });
        const { status, message } = sanitizeClientMessage(err);
        expect(status).toBe(422);
        expect(message).toBe("Invalid coupon code");
    });

    it("sendError responds with JSON and never the raw DB error", () => {
        const { res, json } = makeRes();
        const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
        sendError(res, Object.assign(new Error('column "secret" of relation "admin_users" does not exist'), { status: 500 }), "ctx");
        expect(res.status).toHaveBeenCalledWith(500);
        expect(json).toHaveBeenCalledWith({ error: expect.not.stringContaining("secret") as unknown as string });
        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });
});