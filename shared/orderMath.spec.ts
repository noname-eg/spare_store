import { describe, it, expect } from "vitest";
import {
  computeDiscount,
  computeShipping,
  computeTotal,
  resolveProductName,
  orderDefaults,
  resolveUnitPrice,
  computeLineTotal,
  computeSubtotal,
  computeCouponDiscount,
  nextStock,
  nextUsedCount,
  safeMoney,
  roundMoney,
  resolveShippingSettings,
} from "./orderMath";

describe("orderMath", () => {
  it("resolveProductName prefers English name", () => {
    expect(resolveProductName("Black Dress", "فستان أسود")).toBe("Black Dress");
  });

  it("resolveProductName falls back to Arabic when English is missing", () => {
    expect(resolveProductName(undefined, "فستان أسود")).toBe("فستان أسود");
    expect(resolveProductName("", "فستان أسود")).toBe("فستان أسود");
  });

  it("resolveProductName returns fallback when both names are missing", () => {
    expect(resolveProductName(null, null)).toBe("Product");
  });

  it("computeShipping charges flat rate below threshold", () => {
    expect(computeShipping(1000, 80, 2500)).toBe(80);
  });

  it("computeShipping is free above threshold", () => {
    expect(computeShipping(2500, 80, 2500)).toBe(0);
    expect(computeShipping(2600, 80, 2500)).toBe(0);
  });

  it("computeShipping is free for empty carts", () => {
    expect(computeShipping(0, 80, 2500)).toBe(0);
  });

  it("computeDiscount rounds to nearest EGP", () => {
    expect(computeDiscount(2490, 10)).toBe(249);
  });

  it("computeDiscount ignores invalid percentages", () => {
    expect(computeDiscount(2490, 0)).toBe(0);
    expect(computeDiscount(2490, 101)).toBe(0);
  });

  it("computeTotal includes discount and shipping", () => {
    expect(computeTotal(1000, 100, 80)).toBe(980);
  });

  it("defaults match site defaults", () => {
    expect(orderDefaults.DEFAULT_SHIPPING_COST).toBe(80);
    expect(orderDefaults.DEFAULT_FREE_SHIPPING_THRESHOLD).toBe(2500);
  });
});

describe("server-side pricing (authoritative)", () => {
  it("resolveUnitPrice uses sale price when present", () => {
    expect(resolveUnitPrice({ sale_price: 500, original_price: 800 })).toBe(500);
  });

  it("resolveUnitPrice falls back to original price when sale is missing/zero", () => {
    expect(resolveUnitPrice({ sale_price: null, original_price: 800 })).toBe(800);
    expect(resolveUnitPrice({ sale_price: 0, original_price: 800 })).toBe(800);
  });

  it("resolveUnitPrice never uses a client-injected price field", () => {
    expect(resolveUnitPrice({ sale_price: 500, original_price: 800, clientPrice: 1 } as any)).toBe(500);
  });

  it("computeLineTotal multiplies with rounding", () => {
    expect(computeLineTotal(500, 3)).toBe(1500);
    expect(computeLineTotal(99.99, 2)).toBe(199.98);
  });

  it("computeLineTotal treats invalid quantities as zero (never negatives)", () => {
    expect(computeLineTotal(500, 0)).toBe(0);
    expect(computeLineTotal(500, -3)).toBe(0);
    expect(computeLineTotal(500, 1.5)).toBe(0);
  });

  it("computeSubtotal sums authoritative line totals", () => {
    expect(computeSubtotal([{ unitPrice: 2500, quantity: 1 }, { unitPrice: 1200, quantity: 2 }])).toBe(4900);
  });
});

describe("coupon calculation (server-side only)", () => {
  it("applies percent discount and caps at subtotal", () => {
    expect(computeCouponDiscount(1000, 10)).toBe(100);
    expect(computeCouponDiscount(1000, 200)).toBe(0);
  });

  it("discount is capped so final total cannot go negative", () => {
    expect(computeCouponDiscount(100, 50)).toBe(50);
    expect(computeTotal(100, 150, 0)).toBe(0);
    expect(computeTotal(100, 150, 80)).toBe(30);
  });

  it("ignores invalid/negative percent values", () => {
    expect(computeCouponDiscount(1000, 0)).toBe(0);
    expect(computeCouponDiscount(1000, -5)).toBe(0);
    expect(computeCouponDiscount(1000, 101)).toBe(0);
  });

  it("computeDiscount stays compatible with the previous behavior", () => {
    expect(computeDiscount(2490, 10)).toBe(249);
    expect(computeDiscount(2490, 0)).toBe(0);
  });
});

describe("shipping calculation (authoritative settings)", () => {
  it("charges flat rate below the free-shipping threshold", () => {
    expect(computeShipping(2000, 80, 2500)).toBe(80);
  });

  it("free shipping at or above the threshold", () => {
    expect(computeShipping(2500, 80, 2500)).toBe(0);
    expect(computeShipping(3200, 80, 2500)).toBe(0);
  });

  it("empty cart has zero shipping", () => {
    expect(computeShipping(0, 80, 2500)).toBe(0);
  });

  it("malformed/negative settings cannot produce NaN or negative shipping", () => {
    // NaN/السالب يُعامل كنتيجة صفر في الدالة النقية؛ الضمانة الفعليّة في resolveShippingSettings بالافتراضات
    expect(computeShipping(1000, Number.NaN, 2500)).toBe(0);
    expect(computeShipping(1000, -5, 2500)).toBe(0);
    expect(computeShipping(1000, 80, Number.NaN)).toBe(0);
    expect(Number.isFinite(computeShipping(1, 2, 3))).toBe(true);
  });

  it("12: resolveShippingSettings falls back to project defaults on malformed input", () => {
    const r = resolveShippingSettings({ shippingCost: "abc", freeShippingThreshold: null });
    expect(r).toEqual({ shippingCost: 80, freeShippingThreshold: 2500 });
    expect(resolveShippingSettings({ shippingCost: undefined, freeShippingThreshold: undefined })).toEqual({ shippingCost: 80, freeShippingThreshold: 2500 });
    expect(resolveShippingSettings({ shippingCost: "abc", freeShippingThreshold: "abc" })).toEqual({ shippingCost: 80, freeShippingThreshold: 2500 });
  });

  it("12: resolveShippingSettings keeps valid explicit zeros and valid values", () => {
    expect(resolveShippingSettings({ shippingCost: 0, freeShippingThreshold: 0 })).toEqual({ shippingCost: 0, freeShippingThreshold: 0 });
    expect(resolveShippingSettings({ shippingCost: 60, freeShippingThreshold: 3000 })).toEqual({ shippingCost: 60, freeShippingThreshold: 3000 });
  });
});

describe("final total formula", () => {
  it("subtotal - discount + shipping = total", () => {
    expect(computeTotal(4900, 490, 0)).toBe(4410);
    expect(computeTotal(2000, 200, 80)).toBe(1880);
  });

  it("reconciles a multi-item order with coupon and shipping", () => {
    const subtotal = computeSubtotal([
      { unitPrice: 2500, quantity: 1 },
      { unitPrice: 1200, quantity: 2 },
    ]);
    const discount = computeCouponDiscount(subtotal, 10);
    const shipping = computeShipping(subtotal, 80, 2500);
    expect(discount).toBe(490);
    expect(shipping).toBe(0);
    expect(computeTotal(subtotal, discount, shipping)).toBe(subtotal - discount + shipping);
  });

  it("never returns a negative total via rounding surprises", () => {
    expect(computeTotal(1, 9999, 0)).toBe(0);
    expect(computeTotal(0, 0, 0)).toBe(0);
  });
});

describe("safeMoney / roundMoney", () => {
  it("safeMoney rejects NaN, infinite and negative values", () => {
    expect(safeMoney(Number.NaN, 42)).toBe(42);
    expect(safeMoney(Number.POSITIVE_INFINITY, 42)).toBe(42);
    expect(safeMoney(-3, 42)).toBe(42);
    expect(safeMoney("80", 42)).toBe(80);
    expect(safeMoney("abc", 42)).toBe(42);
    expect(safeMoney(0, 42)).toBe(0);
  });

  it("roundMoney gives consistent 2-decimal output", () => {
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
    expect(roundMoney(123.456)).toBe(123.46);
    expect(roundMoney(Number.NaN)).toBe(0);
  });
});

describe("stock / coupon usage control", () => {
  it("nextStock deducts only from sufficient stock", () => {
    expect(nextStock(5, 2)).toBe(3);
    expect(nextStock(5, 5)).toBe(0);
    expect(nextStock(5, 6)).toBeNull();
  });

  it("nextStock rejects fractional, zero or negative quantities", () => {
    expect(nextStock(5, 0)).toBeNull();
    expect(nextStock(5, -1)).toBeNull();
    expect(nextStock(5, 1.5)).toBeNull();
  });

  it("nextStock never allows negative stock", () => {
    expect(nextStock(0, 1)).toBeNull();
    expect(nextStock(0, 0)).toBeNull();
    expect(nextStock(Number.NaN, 1)).toBeNull();
    expect(nextStock(-4, 1)).toBeNull();
  });

  it("nextUsedCount increments within max_uses", () => {
    expect(nextUsedCount(3, 1, 10)).toBe(4);
    expect(nextUsedCount(9, 1, 10)).toBe(10);
    expect(nextUsedCount(10, 1, 10)).toBeNull();
    expect(nextUsedCount(5, 1, null)).toBe(6);
  });
});