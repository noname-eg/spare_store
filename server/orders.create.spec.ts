import { describe, it, expect, vi, afterEach } from "vitest";
import type { Express } from "express";
import express from "express";
import ordersRouter from "./routes/orders";
import { supabase } from "./db";

vi.mock("./db", () => {
    return { supabase: { from: vi.fn(), rpc: vi.fn() } };
});

type DbRowResult = { data: any; error: any } | (() => Promise<{ data: any; error: any }>);

function mockChain(result: DbRowResult) {
    const resolve = typeof result === "function" ? () => Promise.resolve(result) : () => Promise.resolve(result);
    const b: any = {
        then: (onFulfilled: any) => resolve().then(onFulfilled),
        select: vi.fn(() => b),
        eq: vi.fn(() => b),
        in: vi.fn(() => b),
        limit: vi.fn(() => b),
        maybeSingle: vi.fn(() => resolve()),
        single: vi.fn(() => resolve()),
        update: vi.fn(() => b),
        insert: vi.fn(() => b),
        delete: vi.fn(() => b),
        gte: vi.fn(() => b),
        lt: vi.fn(() => b),
        gt: vi.fn(() => b),
    };
    return b;
}

interface SetupOptions {
    orderPreCheck?: DbRowResult;
    products?: DbRowResult;
    coupons?: DbRowResult;
    siteSettings?: DbRowResult;
    rpc?: { data?: any; error?: any };
}

function setupDb(opts: SetupOptions = {}) {
    (supabase.from as any).mockImplementation((table: string) => {
        if (table === "orders") return mockChain(opts.orderPreCheck ?? { data: null, error: null });
        if (table === "products") return mockChain(opts.products ?? { data: [], error: null });
        if (table === "coupons") return mockChain(opts.coupons ?? { data: null, error: null });
        if (table === "site_settings")
            return mockChain(opts.siteSettings ?? { data: { key: "siteSettings", value_json: { shippingCost: 80, freeShippingThreshold: 2500 } }, error: null });
        return mockChain({ data: null, error: null });
    });
    (supabase.rpc as any).mockResolvedValue(opts.rpc ?? { data: defaultRpcData(), error: null });
}

function defaultRpcData() {
    return {
        ok: true,
        duplicate: false,
        order_id: "o-1",
        public_reference: "ORD-ABC12345",
        created_at: "2026-09-17T00:00:00Z",
        subtotal: 120,
        discount_amount: 0,
        shipping_amount: 80,
        total: 200,
    };
}

async function createApp(): Promise<{ app: Express; baseUrl: string; close: () => Promise<void> }> {
    const app = express();
    app.set("trust proxy", true);
    app.use(express.json());
    app.use("/api/orders", ordersRouter);
    const server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address() as { port: number };
    return {
        app,
        baseUrl: `http://127.0.0.1:${address.port}`,
        close: () => new Promise<void>((resolve) => server.close(() => resolve())),
    };
}

// كل طلب يعطي عنوان IP فريداً حتى لا يتداخل حد 10 طلبات/دقيقة من module-level بين الاختبارات
let requestSeq = 0;
async function post(baseUrl: string, body: unknown): Promise<Response> {
    requestSeq += 1;
    return fetch(`${baseUrl}/api/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Forwarded-For": `1.1.1.${requestSeq}` },
        body: JSON.stringify(body),
    });
}

const productFixture = {
    id: "p-1",
    name: "Shirt",
    name_ar: "قميص",
    original_price: 60,
    sale_price: null,
    is_active: true,
    product_variants: [{ id: "v-1", size: "M", color: "#222", sku: "SKU-1", stock: 10 }],
};

function validBody() {
    return {
        customerName: "أحمد",
        phone: "+201234567890",
        address: "شارع التحرير، القاهرة",
        paymentMethod: "cod",
        idempotencyKey: "idem-12345",
        orderItems: [{ productId: "p-1", variantId: "v-1", size: "M", color: "#222", quantity: 2 }],
    };
}

afterEach(() => {
    vi.clearAllMocks();
});

describe("POST /api/orders — atomic order creation via RPC", () => {
    it("creates an order atomically via supabase.rpc and returns the DB-generated reference (201)", async () => {
        setupDb({ products: { data: [productFixture], error: null } });
        const { baseUrl, close } = await createApp();
        try {
            const response = await post(baseUrl, validBody());
            expect(response.status).toBe(201);
            const body = await response.json();
            expect(body.id).toBe("ORD-ABC12345");
            expect(body.publicReference).toBe("ORD-ABC12345");
            expect(body.total).toBe(200);
            expect(body.subtotal).toBe(120);
            expect(body.shippingAmount).toBe(80);
            expect(body.discountAmount).toBe(0);

            expect(supabase.rpc).toHaveBeenCalledTimes(1);
            const [fnName, args] = (supabase.rpc as any).mock.calls[0];
            expect(fnName).toBe("create_order");
            // public_reference يولَّد داخل الـ DB فقط ولا يُرسل أبداً
            expect(args.payload.public_reference).toBeUndefined();
            expect(args.payload.idempotency_key).toBe("idem-12345");
            expect(args.payload.customer_name).toBe("أحمد");
            expect(args.payload.subtotal).toBe(120);
            expect(args.payload.items[0]).toMatchObject({
                product_id: "p-1",
                variant_id: "v-1",
                product_name_snapshot: "Shirt",
                sku_snapshot: "SKU-1",
                size_snapshot: "M",
                color_snapshot: "#222",
                unit_price: 60,
                quantity: 2,
                line_total: 120,
            });
        } finally {
            await close();
        }
    });

    it("short-circuits duplicates via the idempotency pre-check (200) without touching the RPC", async () => {
        setupDb({
            orderPreCheck: { data: { public_reference: "ORD-EXISTS", total: 200 }, error: null },
            products: { data: [productFixture], error: null },
        });
        const { baseUrl, close } = await createApp();
        try {
            const response = await post(baseUrl, validBody());
            expect(response.status).toBe(200);
            expect(await response.json()).toEqual({ duplicate: true, publicReference: "ORD-EXISTS", total: 200 });
            expect(supabase.rpc).not.toHaveBeenCalled();
        } finally {
            await close();
        }
    });

    it("handles an RPC-reported race duplicate (200) with zero side effects from our side", async () => {
        setupDb({
            products: { data: [productFixture], error: null },
            rpc: { data: { ...defaultRpcData(), duplicate: true }, error: null },
        });
        const { baseUrl, close } = await createApp();
        try {
            const response = await post(baseUrl, validBody());
            expect(response.status).toBe(200);
            expect(await response.json()).toEqual({ duplicate: true, publicReference: "ORD-ABC12345", total: 200 });
        } finally {
            await close();
        }
    });

    it("maps insufficient_stock from the RPC to a safe 409", async () => {
        setupDb({
            products: { data: [productFixture], error: null },
            rpc: { data: null, error: { message: "insufficient_stock", code: "P0001" } },
        });
        const { baseUrl, close } = await createApp();
        try {
            const response = await post(baseUrl, validBody());
            expect(response.status).toBe(409);
            expect(await response.json()).toEqual({ error: "Not enough stock is available for this order" });
        } finally {
            await close();
        }
    });

    it("rejects before the RPC when the read variant already lacks stock (409)", async () => {
        const lowStock = { ...productFixture, product_variants: [{ id: "v-1", size: "M", color: "#222", sku: "SKU-1", stock: 1 }] };
        setupDb({ products: { data: [lowStock], error: null } });
        const { baseUrl, close } = await createApp();
        try {
            const response = await post(baseUrl, validBody());
            expect(response.status).toBe(409);
            expect(supabase.rpc).not.toHaveBeenCalled();
        } finally {
            await close();
        }
    });

    it("maps coupon_invalid and coupon_usage_exceeded RPC failures to 422", async () => {
        for (const [message, expected] of [
            ["coupon_invalid", "Invalid coupon code"],
            ["coupon_usage_exceeded", "Coupon has reached its usage limit"],
        ] as const) {
            setupDb({
                products: { data: [productFixture], error: null },
                rpc: { data: null, error: { message, code: "P0001" } },
            });
            const { baseUrl, close } = await createApp();
            try {
                const response = await fetch(`${baseUrl}/api/orders`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(validBody()),
                });
                expect(response.status).toBe(422);
                expect(await response.json()).toEqual({ error: expected });
            } finally {
                await close();
            }
        }
    });

    it("maps arithmetic_mismatch / invalid_order_data RPC failures to a safe 400", async () => {
        for (const message of ["arithmetic_mismatch", "invalid_order_data"]) {
            setupDb({
                products: { data: [productFixture], error: null },
                rpc: { data: null, error: { message, code: "P0001" } },
            });
            const { baseUrl, close } = await createApp();
            try {
                const response = await fetch(`${baseUrl}/api/orders`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(validBody()),
                });
                expect(response.status).toBe(400);
                expect(await response.json()).toEqual({ error: "Invalid order data" });
            } finally {
                await close();
            }
        }
    });

    it("never leaks raw DB/RPC internals on unknown errors (generic 500)", async () => {
        setupDb({
            products: { data: [productFixture], error: null },
            rpc: { data: null, error: { message: 'relation "orders" does not exist - DETAIL: error', code: "42P01" } },
        });
        const { baseUrl, close } = await createApp();
        try {
            const response = await post(baseUrl, validBody());
            expect(response.status).toBe(500);
            const body = await response.json();
            expect(body.error).toBe("We could not complete your order. Please try again.");
            expect(body.error).not.toContain("orders");
        } finally {
            await close();
        }
    });

    it("sends invalid client bodies to 400 without calling the RPC", async () => {
        setupDb({ products: { data: [productFixture], error: null } });
        const { baseUrl, close } = await createApp();
        try {
            const bad = { ...validBody(), orderItems: [] };
const response = await post(baseUrl, bad);
            expect(response.status).toBe(400);
            expect(supabase.rpc).not.toHaveBeenCalled();
        } finally {
            await close();
        }
    });

    it("applies a server-verified coupon inside the RPC payload with the correct discount", async () => {
        const coupon = { id: "c-1", code: "SAVE10", discount_percent: 10, max_uses: 100, used_count: 0, starts_at: null, ends_at: null, is_active: true };
        setupDb({
            products: { data: [productFixture], error: null },
            coupons: { data: coupon, error: null },
            rpc: { data: { ...defaultRpcData(), discount_amount: 12, total: 188 }, error: null },
        });
        const { baseUrl, close } = await createApp();
        try {
const response = await post(baseUrl, { ...validBody(), couponCode: "SAVE10" });
            expect(response.status).toBe(201);
            const body = await response.json();
            expect(body.couponCode).toBe("SAVE10");
            expect(body.discountAmount).toBe(12);
            expect(body.total).toBe(188);

            const [, args] = (supabase.rpc as any).mock.calls[0];
            expect(args.payload.coupon_code).toBe("SAVE10");
            expect(args.payload.discount_amount).toBe(12);
        } finally {
            await close();
        }
    });
});