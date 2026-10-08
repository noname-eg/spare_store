// Pure helpers for the atomic order RPC (public.create_order).
// No DB access, no business logic changes — only payload shaping + error mapping.

export interface OrderItemRpcInput {
    product_id: string;
    variant_id: string | null;
    product_name_snapshot: string;
    sku_snapshot: string | null;
    size_snapshot: string | null;
    color_snapshot: string | null;
    unit_price: number;
    quantity: number;
    line_total: number;
}

export interface BuildOrderPayloadInput {
    idempotencyKey?: string | null;
    customerName: string;
    phone: string;
    address: string;
    notes?: string | null;
    paymentMethod: string;
    couponCode?: string | null;
    transferNumber?: string | null;
    receipt?: string | null;
    subtotal: number;
    discountAmount: number;
    shippingAmount: number;
    total: number;
    items: OrderItemRpcInput[];
}

// The exact input contract of public.create_order(jsonb).
// public_reference is deliberately NEVER here — the DB generates it.
export function buildCreateOrderPayload(input: BuildOrderPayloadInput): Record<string, unknown> {
    return {
        idempotency_key: input.idempotencyKey || null,
        customer_name: input.customerName,
        phone: input.phone,
        address: input.address,
        notes: input.notes || null,
        payment_method: input.paymentMethod,
        coupon_code: input.couponCode || null,
        transfer_number_snapshot: input.transferNumber || null,
        receipt_storage_key: input.receipt || null,
        subtotal: input.subtotal,
        discount_amount: input.discountAmount,
        shipping_amount: input.shippingAmount,
        total: input.total,
        items: input.items.map((item) => ({
            product_id: item.product_id,
            variant_id: item.variant_id,
            product_name_snapshot: item.product_name_snapshot,
            sku_snapshot: item.sku_snapshot,
            size_snapshot: item.size_snapshot,
            color_snapshot: item.color_snapshot,
            unit_price: item.unit_price,
            quantity: item.quantity,
            line_total: item.line_total,
        })),
    };
}

// Shape returned by the RPC (PostgREST jsonb -> object).
export interface CreateOrderRpcData {
    ok: boolean;
    duplicate: boolean;
    order_id: string;
    public_reference: string;
    created_at: string;
    subtotal: number;
    discount_amount: number;
    shipping_amount: number;
    total: number;
}

// Maps the RPC's controlled error messages to safe HTTP responses.
// Returns null for anything else -> caller replies with a generic 500.
export function mapCreateOrderRpcError(error: { message?: string } | null | undefined): { status: number; message: string } | null {
    const message = error?.message || "";
    switch (message) {
        case "insufficient_stock":
            return { status: 409, message: "Not enough stock is available for this order" };
        case "coupon_invalid":
            return { status: 422, message: "Invalid coupon code" };
        case "coupon_usage_exceeded":
            return { status: 422, message: "Coupon has reached its usage limit" };
        case "invalid_order_data":
        case "arithmetic_mismatch":
            return { status: 400, message: "Invalid order data" };
        default:
            return null;
    }
}