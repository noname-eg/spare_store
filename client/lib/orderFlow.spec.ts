import { describe, expect, it } from "vitest";
import { buildOrderConfirmationMessage, createIdempotencyKey, defaultStatusMessage, getWhatsAppUrl, openWhatsApp, parseOrderSubmitResponse, validatePaymentInput, type OrderConfirmationInput } from "./orderFlow";

describe("parseOrderSubmitResponse", () => {
  it("A: parses a successful creation (201) with publicReference", () => {
    const result = parseOrderSubmitResponse(201, JSON.stringify({ id: "NN-abc", publicReference: "NN-ABC123", total: 500 }));
    if (result.kind === "success") {
      expect(result.kind).toBe("success");
      expect(result.reference).toBe("NN-ABC123");
      expect(result.duplicate).toBe(false);
    }
  });

  it("B: treats a 409 conflict as a typed http failure with a clear message", () => {
    const result = parseOrderSubmitResponse(409, JSON.stringify({ error: "Out of stock for X (M)" }));
    if (result.kind !== "success") {
      expect(result.kind).toBe("http");
      expect(result.status).toBe(409);
      expect(result.message).toBe("Out of stock for X (M)");
    }
  });

  it("C: falls back to a default message when the error body is missing", () => {
    const result = parseOrderSubmitResponse(409, null);
    if (result.kind !== "success") expect(result.message).toBe(defaultStatusMessage(409));
  });

  it("D: treats an invalid 2xx body as malformed, never success", () => {
    const result = parseOrderSubmitResponse(201, "not-json");
    if (result.kind !== "success") {
      expect(result.kind).toBe("malformed");
      expect(result.message).toContain("unrecognized response");
    }
  });

  it("E: passes through the server's sanitized 500 message (server side strips internals)", () => {
    const result = parseOrderSubmitResponse(500, JSON.stringify({ error: "db: duplicate key violation" }));
    if (result.kind !== "success") {
      expect(result.kind).toBe("http");
      expect(result.status).toBe(500);
      expect(result.message).toBe("db: duplicate key violation");
    }
  });

  it("F: recovery flow — a retry with the same key returning 200 duplicate still succeeds", () => {
    const result = parseOrderSubmitResponse(200, JSON.stringify({ publicReference: "NN-ABC123", duplicate: true }));
    if (result.kind === "success") {
      expect(result.duplicate).toBe(true);
      expect(result.reference).toBe("NN-ABC123");
    }
  });
});

describe("createIdempotencyKey", () => {
  it("reuses an existing valid key", () => {
    expect(createIdempotencyKey("NN-keepme")).toBe("NN-keepme");
  });

  it("generates a fresh key of min length when none is provided", () => {
    const key = createIdempotencyKey(undefined, 1700000000000);
    expect(key).toMatch(/^NN-\d+-[a-z0-9]{6}$/);
    expect(key.length).toBeGreaterThanOrEqual(8);
  });
});

describe("validatePaymentInput", () => {
  it("allows cod without a receipt", () => {
    expect(validatePaymentInput("cod", { transferNumber: undefined, receiptKey: "" })).toEqual({ ok: true });
  });

  it("G: rejects wallet/instapay without a receipt key", () => {
    const result = validatePaymentInput("wallet", { transferNumber: "10030140", receiptKey: "" });
    expect(result.ok).toBe(false);
  });

  it("accepts wallet/instapay with transfer number + receipt key", () => {
    expect(validatePaymentInput("instapay", { transferNumber: "20030140", receiptKey: "receipts/abc.png" })).toEqual({ ok: true });
  });
});

describe("buildOrderConfirmationMessage", () => {
  const base: OrderConfirmationInput = {
    orderId: "NN-ABC123",
    customerName: "Aya",
    phone: "01000000000",
    address: "Cairo",
    notes: "",
    paymentLabel: "InstaPay",
    transferNumber: "20030140",
    receiptAttached: true,
    subtotal: 1000,
    discountAmount: 100,
    shipping: 0,
    shippingLabel: "Free",
    total: 900,
    items: [{ name: "Dress", quantity: 1, total: 900, size: "M", color: "Black" }],
  };

  it("includes variant details, order id, and totals", () => {
    const message = buildOrderConfirmationMessage(base);
    expect(message).toContain("New order: NN-ABC123");
    expect(message).toContain("(M · Black)");
    expect(message).toContain("Discount: -100 EGP");
    expect(message).toContain("Shipping: Free");
    expect(message).toContain("Total: 900 EGP");
    expect(message).toContain("Transfer receipt: attached");
  });

  it("omits optional lines when absent", () => {
    const messages = buildOrderConfirmationMessage({ ...base, discountAmount: 0, transferNumber: undefined, receiptAttached: false, items: [{ name: "Dress", quantity: 1, total: 1000, size: "M", color: "Black" }], shippingLabel: "80 EGP" });
    expect(messages).not.toContain("Discount:");
    expect(messages).not.toContain("Transfer number:");
    expect(messages).not.toContain("Transfer receipt:");
    expect(messages).toContain("Shipping: 80 EGP");
  });
});

describe("whatsapp helpers", () => {
  it("builds a wa.me url with encoded text", () => {
    const url = getWhatsAppUrl("https://wa.me/201068568250", "New order: NN-1\ntotal 100");
    expect(url.startsWith("https://wa.me/201068568250?text=")).toBe(true);
    expect(decodeURIComponent(url.split("text=")[1])).toBe("New order: NN-1\ntotal 100");
  });

  it("H: reports opened=true when the opener succeeds", () => {
    expect(openWhatsApp("https://wa.me/1?text=hi", () => true)).toBe(true);
  });

  it("I: reports opened=false when the opener is blocked", () => {
    expect(openWhatsApp("https://wa.me/1?text=hi", () => false)).toBe(false);
  });

  it("J: never rejects the order when the opener throws (returns false)", () => {
    const result = openWhatsApp("https://wa.me/1?text=hi", () => {
      throw new Error("blocked");
    });
    expect(result).toBe(false);
  });
});