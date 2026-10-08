import { describe, it, expect, vi, afterEach } from "vitest";
import express from "express";
import ordersRouter from "./routes/orders";
import { supabase } from "./db";

vi.mock("./db", () => {
    return { supabase: { from: vi.fn() } };
});

const fakeOrder = {
    id: "dashboard-internal-uuid",
    public_reference: "ORD-DEADBEEF",
    created_at: "2026-01-02T03:04:05Z",
    subtotal: 120,
    discount_amount: 12,
    shipping_amount: 9,
    total: 117,
    customer_name: "العميل",
    phone: "+962",
    address: "عمان",
    notes: "note",
    payment_method: "cod",
    transfer_number_snapshot: "TR-123",
    coupon_code: "SECRET-COUPON",
    receipt_storage_key: "order-receipts/receipts/private_key.png",
    order_items: [
        {
            id: "internal-item-uuid",
            product_id: "internal-product-uuid",
            variant_id: "internal-variant-uuid",
            product_name_snapshot: "قميص",
            sku_snapshot: "SKU-1",
            size_snapshot: "M",
            color_snapshot: "#222",
            unit_price: 60,
            quantity: 2,
            line_total: 120,
        },
    ],
};

async function getOrder(reference: string) {
    const app = express();
    app.use("/api/orders", ordersRouter);
    const server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address() as { port: number };
    try {
        return await fetch(`http://127.0.0.1:${address.port}/api/orders/${reference}`);
    } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
    }
}

afterEach(() => {
    vi.clearAllMocks();
});

describe("public order lookup privacy (G)", () => {
    it("exposes order summary fields but never internal keys, payment/receipt secrets", async () => {
        (supabase.from as any).mockImplementation((table: string) => {
            if (table === "orders") {
                return {
                    select: vi.fn().mockReturnThis(),
                    eq: vi.fn().mockReturnThis(),
                    limit: vi.fn().mockReturnThis(),
                    maybeSingle: vi.fn().mockResolvedValue({ data: fakeOrder, error: null }),
                };
            }
            return { select: vi.fn().mockResolvedValue({ data: null, error: null }) };
        });

        const response = await getOrder("ORD-DEADBEEF");
        expect(response.status).toBe(200);
        const body = await response.json();

        // حقول العمل 🛍 مطلوبة لواجهة المتابعة
        expect(body.id).toBe("ORD-DEADBEEF");
        expect(body.customerName).toBe("العميل");
        expect(body.phone).toBe("+962");
        expect(body.address).toBe("عمان");
        expect(body.transferNumber).toBe("TR-123");
        expect(body.orderItems[0]).toMatchObject({ name: "قميص", size: "M", color: "#222", unitPrice: 60, quantity: 2, total: 120 });

        // كل المسارات الداخلية/السرية محجوبة
        expect(body.receipt_storage_key).toBeUndefined();
        expect(body.couponCode).toBeUndefined();
        expect(body.orderItems[0].id).toBeUndefined();
        expect(body.orderItems[0].product_id).toBeUndefined();
        expect(body.orderItems[0].variant_id).toBeUndefined();
        expect(body.orderItems[0].sku_snapshot).toBeUndefined();
    });

    it("returns 404 for unknown references instead of leaking details", async () => {
        (supabase.from as any).mockImplementation((table: string) => {
            if (table === "orders") {
                return {
                    select: vi.fn().mockReturnThis(),
                    eq: vi.fn().mockReturnThis(),
                    limit: vi.fn().mockReturnThis(),
                    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                };
            }
            return { select: vi.fn().mockResolvedValue({ data: null, error: null }) };
        });
        const response = await getOrder("ORD-NOTEXIST");
        expect(response.status).toBe(404);
    });
});