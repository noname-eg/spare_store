import { describe, expect, it } from "vitest";
import { addCartLine, cartLineKey, canAddLine } from "./cart";

const variantProduct = { productId: "p1", hasVariants: true } as const;

describe("cartLineKey", () => {
  it("keeps one key per product for products without variants", () => {
    expect(cartLineKey({ productId: "p1", hasVariants: false })).toBe(cartLineKey({ productId: "p1", hasVariants: false }));
    expect(cartLineKey({ productId: "p1", hasVariants: false })).not.toBe(cartLineKey({ productId: "p2", hasVariants: false }));
  });

  it("makes different variants of the same product separate keys", () => {
    const mBlack = cartLineKey({ ...variantProduct, variantId: "v-m-black" });
    const lRed = cartLineKey({ ...variantProduct, variantId: "v-l-red" });
    expect(mBlack).not.toBe(lRed);
    expect(cartLineKey({ ...variantProduct, variantId: "v-m-black" })).toBe(mBlack);
  });
});

describe("canAddLine", () => {
  it("allows products without variants", () => {
    expect(canAddLine({ productId: "p1", hasVariants: false })).toBe(true);
  });

  it("rejects variant products without a selected variant", () => {
    expect(canAddLine({ productId: "p1", hasVariants: true })).toBe(false);
  });

  it("accepts variant products once a variant is selected", () => {
    expect(canAddLine({ ...variantProduct, variantId: "v1" })).toBe(true);
  });
});

describe("addCartLine", () => {
  it("merges same product + same variant into a single line", () => {
    const first = addCartLine([], { ...variantProduct, variantId: "v-m-black", size: "M", color: "#222222" });
    expect(cartLineKey(first[0])).toBe("v:p1:v-m-black");

    const merged = addCartLine(first, { ...variantProduct, variantId: "v-m-black", size: "M", color: "#222222" });
    expect(merged).toHaveLength(1);
    expect(merged[0].quantity).toBe(2);
  });

  it("keeps M+Black and L+Red as two separate lines", () => {
    const first = addCartLine([], { ...variantProduct, variantId: "v-m-black", size: "M", color: "#222222", quantity: 1 });
    const second = addCartLine(first, { ...variantProduct, variantId: "v-l-red", size: "L", color: "Red", quantity: 2 });

    expect(second).toHaveLength(2);
    expect(second[0].quantity).toBe(1);
    expect(second[1].quantity).toBe(2);
    expect(second[0].size).toBe("M");
    expect(second[0].color).toBe("#222222");
    expect(second[1].size).toBe("L");
    expect(second[1].color).toBe("Red");
  });

  it("does nothing when a variant product has no variant selected", () => {
    const cart = addCartLine([], { productId: "p1", hasVariants: true });
    expect(cart).toHaveLength(0);
  });

  it("merges multiple adds of a product without variants into one line", () => {
    const first = addCartLine([], { productId: "p2", hasVariants: false });
    const second = addCartLine(first, { productId: "p2", hasVariants: false });
    const third = addCartLine(second, { productId: "p2", hasVariants: false });
    expect(third).toHaveLength(1);
    expect(third[0].quantity).toBe(3);
  });
});