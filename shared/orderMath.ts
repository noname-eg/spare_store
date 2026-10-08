export const orderDefaults = {
  DEFAULT_SHIPPING_COST: 80,
  DEFAULT_FREE_SHIPPING_THRESHOLD: 2500,
};

// آمن للأرقام المالية: يستبعد NaN وغير المحدود والسالبة
export function safeMoney(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === "") return fallback;
  const n = Number(value);
  if (Number.isFinite(n) && n >= 0) return n;
  return fallback;
}

// تقريب موحد لعملة منزلتين عشريتين
export function roundMoney(value: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const doubled = Math.round((n + Number.EPSILON) * 100) / 100;
  return Object.is(doubled, -0) ? 0 : doubled;
}

// سعر الوحدة الموثوق من قاعدة البيانات فقط — أي حقل سعر وهمي من العميل لا يُستخدم إطلاقاً
export function resolveUnitPrice(product: { sale_price?: unknown; original_price?: unknown }): number {
  const sale = safeMoney(product.sale_price, 0);
  if (sale > 0) return sale;
  return safeMoney(product.original_price, 0);
}

export function computeLineTotal(unitPrice: number, quantity: number): number {
  const qty = Number.isInteger(quantity) && quantity > 0 ? quantity : 0;
  return roundMoney(safeMoney(unitPrice, 0) * qty);
}

export function computeSubtotal(lines: { unitPrice: number; quantity: number }[]): number {
  return lines.reduce((sum, line) => sum + computeLineTotal(line.unitPrice, line.quantity), 0);
}

export function resolveProductName(name?: string | null, nameAr?: string | null): string {
  return name || nameAr || "Product";
}

// الخصم يُحسب من سجل الكوبون الموثوق فقط؛ لا يُقبل خصم من العميل
export function computeCouponDiscount(subtotal: number, discountPercent: number): number {
  const base = safeMoney(subtotal, 0);
  if (base === 0) return 0;
  const percent = safeMoney(discountPercent, 0);
  if (percent <= 0 || percent > 100) return 0;
  return roundMoney(Math.min(base, (base * percent) / 100));
}

// نفس القاعدة السابقة (توافق للاستخدام الحالي)
export const computeDiscount = computeCouponDiscount;

// الشحن: رسم موحد، وعتبة شحن مجاني من الإعدادات — دون ثقة بأي مبلغ من المتصفح
export function computeShipping(subtotal: number, shippingCost: number, freeShippingThreshold: number): number {
  const base = safeMoney(subtotal, 0);
  if (base === 0) return 0;
  const cost = safeMoney(shippingCost, 0);
  const threshold = safeMoney(freeShippingThreshold, 0);
  if (cost <= 0 || base >= threshold) return 0;
  return roundMoney(cost);
}

export function computeTotal(subtotal: number, discountAmount: number, shippingAmount: number): number {
  return roundMoney(Math.max(0, safeMoney(subtotal, 0) - safeMoney(discountAmount, 0) + safeMoney(shippingAmount, 0)));
}

// قراءة إعدادات الشحن من site_settings بقيّم سليمة فقط؛ أي قيمة تالفة → الافتراضيات (لا NaN، لا سالبة)
export function resolveShippingSettings(raw: unknown): { shippingCost: number; freeShippingThreshold: number } {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    shippingCost: safeMoney(r.shippingCost, orderDefaults.DEFAULT_SHIPPING_COST),
    freeShippingThreshold: safeMoney(r.freeShippingThreshold, orderDefaults.DEFAULT_FREE_SHIPPING_THRESHOLD),
  };
}

// مخزون متغير: لا سالب، لا كسور، لا صفر/سالب للكمية
export function nextStock(current: number, quantity: number): number | null {
  const stock = Number(current);
  if (!Number.isFinite(stock) || stock < 0) return null;
  if (!Number.isInteger(quantity) || quantity <= 0) return null;
  if (stock < quantity) return null;
  return stock - quantity;
}

// استخدام الكوبون: لا يتجاوز max_uses
export function nextUsedCount(current: number, quantity = 1, maxUses?: number | null): number | null {
  const used = Number(current);
  if (!Number.isFinite(used) || used < 0) return null;
  const inc = Number(quantity);
  if (!Number.isInteger(inc) || inc <= 0) return null;
  const next = used + inc;
  const cap = maxUses != null ? Number(maxUses) : null;
  if (cap != null && Number.isFinite(cap) && next > cap) return null;
  return next;
}