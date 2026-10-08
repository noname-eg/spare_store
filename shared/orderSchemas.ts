import { z } from "zod";

// بنود الطلب: العميل يرسل productId + variantId + الكمية فقط.
// أي حقول مالية (price/unitPrice/salePrice/originalPrice/lineTotal...) تُرفض صراحةً.
export const orderItemSchema = z
  .object({
    productId: z.string().min(1),
    variantId: z.string().optional().nullable(),
    size: z.string().optional().nullable(),
    color: z.string().optional().nullable(),
    quantity: z.number().int().min(1).max(99),
  })
  .strict();

// الطلب الكامل: يطلب العميل الأصناف + الكوبون + معلومات الشحن فقط.
// أي subtotal/discount/shipping/total من المتصفح تُرفض — الخادم يحسبها حصرياً.
export const createOrderSchema = z
  .object({
    customerName: z.string().trim().min(2).max(128),
    phone: z.string().trim().min(7).max(20),
    address: z.string().trim().min(5).max(500),
    notes: z.string().trim().max(1000).optional().default(""),
    paymentMethod: z.enum(["cod", "wallet", "instapay"]),
    couponCode: z.string().trim().max(32).nullish().default(""),
    transferNumber: z.string().trim().max(64).nullish().default(""),
    receipt: z.string().trim().max(600).nullish().default(""),
    idempotencyKey: z.string().trim().min(8).max(128).optional(),
    orderItems: z.array(orderItemSchema).min(1),
  })
  .strict();