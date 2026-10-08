import { describe, it, expect } from "vitest";
import { createOrderSchema, orderItemSchema } from "./orderSchemas";

const validItems = [
  { productId: "p-1", variantId: "v-1", size: "M", color: "#222222", quantity: 2 },
];

const validOrder = {
  customerName: "Aya Test",
  phone: "01000000000",
  address: "10 Street, Cairo",
  paymentMethod: "cod",
  orderItems: validItems,
  idempotencyKey: "NN-12345-test",
};

function itemWith(overrides: Record<string, unknown>) {
  return { ...validItems[0], ...overrides };
}

function orderWith(overrides: Record<string, unknown>) {
  return { ...validOrder, ...overrides };
}

describe("createOrderSchema (strict — no client financial values accepted)", () => {
  it("accepts a legitimate order request", () => {
    const parsed = createOrderSchema.safeParse(validOrder);
    expect(parsed.success).toBe(true);
  });

  it("M: rejects a client-injected price on an item", () => {
    const parsed = createOrderSchema.safeParse(orderWith({ orderItems: [itemWith({ price: 1 })] }));
    expect(parsed.success).toBe(false);
  });

  it("M: rejects client-injected unitPrice / salePrice / originalPrice on an item", () => {
    expect(createOrderSchema.safeParse(orderWith({ orderItems: [itemWith({ unitPrice: 1 })] })).success).toBe(false);
    expect(createOrderSchema.safeParse(orderWith({ orderItems: [itemWith({ salePrice: 1 })] })).success).toBe(false);
    expect(createOrderSchema.safeParse(orderWith({ orderItems: [itemWith({ originalPrice: 1 })] })).success).toBe(false);
  });

  it("O: rejects client-injected subtotal", () => {
    expect(createOrderSchema.safeParse(orderWith({ subtotal: 1 })).success).toBe(false);
  });

  it("P: rejects client-injected discount", () => {
    expect(createOrderSchema.safeParse(orderWith({ discount: 9999 })).success).toBe(false);
    expect(createOrderSchema.safeParse(orderWith({ discountAmount: 9999 })).success).toBe(false);
  });

  it("Q: rejects client-injected shipping", () => {
    expect(createOrderSchema.safeParse(orderWith({ shipping: 0 })).success).toBe(false);
    expect(createOrderSchema.safeParse(orderWith({ shippingCost: 0 })).success).toBe(false);
  });

  it("R: rejects client-injected total", () => {
    expect(createOrderSchema.safeParse(orderWith({ total: 1 })).success).toBe(false);
  });

  it("A/B: rejects quantity 0 and negative quantities", () => {
    expect(createOrderSchema.safeParse(orderWith({ orderItems: [itemWith({ quantity: 0 })] })).success).toBe(false);
    expect(createOrderSchema.safeParse(orderWith({ orderItems: [itemWith({ quantity: -1 })] })).success).toBe(false);
  });

  it("C: rejects fractional quantity (clothing units are integers)", () => {
    expect(createOrderSchema.safeParse(orderWith({ orderItems: [itemWith({ quantity: 1.5 })] })).success).toBe(false);
  });

  it("accepts quantity 99 and rejects 100", () => {
    expect(createOrderSchema.safeParse(orderWith({ orderItems: [itemWith({ quantity: 99 })] })).success).toBe(true);
    expect(createOrderSchema.safeParse(orderWith({ orderItems: [itemWith({ quantity: 100 })] })).success).toBe(false);
  });

  it("rejects an order with no items", () => {
    expect(createOrderSchema.safeParse(orderWith({ orderItems: [] })).success).toBe(false);
    expect(createOrderSchema.safeParse(orderWith({ orderItems: undefined })).success).toBe(false);
  });

  it("rejects unknown top-level tricks like a fake sale object", () => {
    expect(createOrderSchema.safeParse(orderWith({ totals: { total: 1 } })).success).toBe(false);
  });
});

describe("orderItemSchema", () => {
  it("requires a product id and a valid quantity", () => {
    expect(orderItemSchema.safeParse({ productId: "", variantId: null, quantity: 1 }).success).toBe(false);
    expect(orderItemSchema.safeParse({ productId: "p", quantity: 0 }).success).toBe(false);
  });

  it("E/G context: keeps the exact-variant contract (variantId, size, color optional)", () => {
    expect(orderItemSchema.safeParse({ productId: "p", quantity: 1 }).success).toBe(true);
    expect(orderItemSchema.safeParse({ productId: "p", variantId: "v", size: "M", color: "#222222", quantity: 1 }).success).toBe(true);
  });
});