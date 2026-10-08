import { describe, it, expect } from "vitest";
import { buildCreateOrderPayload, mapCreateOrderRpcError } from "./rpc-payload";

describe("buildCreateOrderPayload", () => {
    const input = {
        idempotencyKey: "idem-12345",
        customerName: "أحمد",
        phone: "+201234567890",
        address: "عنوان كامل",
        notes: "ملاحظة",
        paymentMethod: "cod",
        couponCode: "SAVE10",
        transferNumber: "TR-1",
        receipt: "order-receipts/x.png",
        subtotal: 120,
        discountAmount: 12,
        shippingAmount: 80,
        total: 188,
        items: [
            {
                product_id: "p-1",
                variant_id: "v-1",
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

    it("maps server fields to the RPC contract (snake_case) with snapshots intact", () => {
        const payload = buildCreateOrderPayload(input);
        expect(payload).toEqual({
            idempotency_key: "idem-12345",
            customer_name: "أحمد",
            phone: "+201234567890",
            address: "عنوان كامل",
            notes: "ملاحظة",
            payment_method: "cod",
            coupon_code: "SAVE10",
            transfer_number_snapshot: "TR-1",
            receipt_storage_key: "order-receipts/x.png",
            subtotal: 120,
            discount_amount: 12,
            shipping_amount: 80,
            total: 188,
            items: [
                {
                    product_id: "p-1",
                    variant_id: "v-1",
                    product_name_snapshot: "قميص",
                    sku_snapshot: "SKU-1",
                    size_snapshot: "M",
                    color_snapshot: "#222",
                    unit_price: 60,
                    quantity: 2,
                    line_total: 120,
                },
            ],
        });
    });

    it("never includes public_reference — the DB generates it", () => {
        const payload = buildCreateOrderPayload(input);
        expect((payload as Record<string, unknown>).public_reference).toBeUndefined();
        expect((payload.items as Record<string, unknown>[])[0].public_reference).toBeUndefined();
    });

    it("nulls optional fields when not provided, and does not ignore monetary details", () => {
        const payload = buildCreateOrderPayload({
            idempotencyKey: null,
            customerName: "أحمد",
            phone: "+201234567890",
            address: "عنوان كامل",
            paymentMethod: "wallet",
            subtotal: 100,
            discountAmount: 0,
            shippingAmount: 80,
            total: 180,
            items: [],
        });
        expect(payload).toMatchObject({
            idempotency_key: null,
            coupon_code: null,
            transfer_number_snapshot: null,
            receipt_storage_key: null,
            notes: null,
            subtotal: 100,
            discount_amount: 0,
            total: 180,
        });
    });
});

describe("mapCreateOrderRpcError", () => {
    it("maps controlled RPC failures to safe client responses", () => {
        expect(mapCreateOrderRpcError({ message: "insufficient_stock" })).toEqual({
            status: 409,
            message: "Not enough stock is available for this order",
        });
        expect(mapCreateOrderRpcError({ message: "coupon_invalid" })).toEqual({
            status: 422,
            message: "Invalid coupon code",
        });
        expect(mapCreateOrderRpcError({ message: "coupon_usage_exceeded" })).toEqual({
            status: 422,
            message: "Coupon has reached its usage limit",
        });
        expect(mapCreateOrderRpcError({ message: "invalid_order_data" })).toEqual({
            status: 400,
            message: "Invalid order data",
        });
        expect(mapCreateOrderRpcError({ message: "arithmetic_mismatch" })).toEqual({
            status: 400,
            message: "Invalid order data",
        });
    });

    it("returns null for anything uncontrolled so the server replies with a generic 500", () => {
        expect(mapCreateOrderRpcError({ message: 'duplicate key value violates unique constraint "orders_public_reference_key"' })).toBeNull();
        expect(mapCreateOrderRpcError({ message: "connection terminated unexpectedly" })).toBeNull();
        expect(mapCreateOrderRpcError(undefined)).toBeNull();
        expect(mapCreateOrderRpcError(null)).toBeNull();
    });
});