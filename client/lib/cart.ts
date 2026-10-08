// Pure cart-line-merge helpers shared between the store provider and its tests.
// A "cart line" keeps its variant identity: two different variants of the same
// product are separate lines, the same product+variant merges into one line.

export type StoredCartLine = {
  productId: string;
  hasVariants: boolean;
  variantId?: string;
  size?: string;
  color?: string;
  quantity: number;
};

export type CartLineInput = {
  productId: string;
  hasVariants: boolean;
  variantId?: string;
  size?: string;
  color?: string;
  quantity?: number;
};

// خط سلعة ذات متغيرات لا يُضاف بدون معرّف متغير محدد — لا اختيار صامت
export function canAddLine(input: CartLineInput): boolean {
  if (!input.hasVariants) return true;
  return Boolean(input.variantId);
}

// مفتاح الخط: بدون متغيرات = المنتج فقط، مع متغيرات = المنتج + المتغير
export function cartLineKey(line: { productId: string; hasVariants: boolean; variantId?: string }): string {
  if (!line.hasVariants) return `p:${line.productId}`;
  return line.variantId ? `v:${line.productId}:${line.variantId}` : `p:${line.productId}`;
}

export function addCartLine(current: StoredCartLine[], next: CartLineInput): StoredCartLine[] {
  if (!canAddLine(next)) return current;
  const quantity = Math.max(1, next.quantity ?? 1);

  const existingIndex = current.findIndex((line) => {
    if (line.hasVariants !== next.hasVariants) return false;
    if (line.productId !== next.productId) return false;
    if (!next.hasVariants) return true;
    return line.variantId === next.variantId;
  });

  if (existingIndex >= 0) {
    return current.map((line, index) =>
      index === existingIndex
        ? {
            ...line,
            quantity: line.quantity + quantity,
            size: next.size ?? line.size,
            color: next.color ?? line.color,
          }
        : line
    );
  }

  return [
    ...current,
    {
      productId: next.productId,
      hasVariants: next.hasVariants,
      variantId: next.variantId,
      size: next.size,
      color: next.color,
      quantity,
    },
  ];
}