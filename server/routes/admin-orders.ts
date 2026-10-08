import { Router } from "express";
import { z } from "zod";
import { getOrders, supabase } from "../db";
import { sendError } from "../error";

const router = Router();

// قيم الحالة مقيدة بدقة — أي قيمة خارج هذه المجموعات تُرفض 400 ولا تمرر أبداً لمنطق المخزون
const ALLOWED_FULFILLMENT = ["new", "processing", "completed", "cancelled"] as const;
const ALLOWED_PAYMENT = ["pending", "submitted", "verified", "rejected"] as const;

const statusSchema = z
    .object({
        fulfillmentStatus: z.enum(ALLOWED_FULFILLMENT).optional(),
        paymentStatus: z.enum(ALLOWED_PAYMENT).optional(),
        status: z.string().min(1).max(64).optional(),
    })
    .refine((value) => Boolean(value.fulfillmentStatus || value.paymentStatus || value.status), {
        message: "No status provided",
    });

// جلب جميع الطلبات للوحة التحكم
router.get("/", async (_req, res) => {
    try {
        const orders = await getOrders();
        res.json(orders);
    } catch (err: any) {
        sendError(res, err, "Fetch orders error");
    }
});

// تحديث حالة الطلب
router.patch("/:id/status", async (req, res) => {
    try {
        const { id } = req.params;
        const parsed = statusSchema.safeParse(req.body || {});
        if (!parsed.success) {
            return res.status(400).json({ error: "Invalid status payload", details: parsed.error.flatten() });
        }
        const { fulfillmentStatus, paymentStatus, status } = parsed.data;

        // Map Arabic status if provided — وصف القيمة العربية يُعاد التحقق منه ضد القيم المسموحة
        let targetFulfillment = fulfillmentStatus;
        if (!targetFulfillment && status) {
            const mapArabic: Record<string, string> = {
                "جديد": "new",
                "قيد التجهيز": "processing",
                "مكتمل": "completed",
                "ملغي": "cancelled"
            };
            const mapped = mapArabic[status] || status;
            if (!(ALLOWED_FULFILLMENT as readonly string[]).includes(mapped)) {
                return res.status(400).json({ error: "Invalid status payload", details: { fulfillmentStatus: [`Unknown status: ${mapped}`] } });
            }
            targetFulfillment = mapped as (typeof ALLOWED_FULFILLMENT)[number];
        }

        // Fetch current order state before updating
        let { data: existingOrder } = await supabase.from("orders").select("*, order_items(*)").eq("id", id).maybeSingle();
        if (!existingOrder) {
            const { data: fallback } = await supabase.from("orders").select("*, order_items(*)").eq("public_reference", id).maybeSingle();
            existingOrder = fallback;
        }

        if (!existingOrder) {
            return res.status(404).json({ error: "Order not found" });
        }

        const updateData: any = {};
        if (targetFulfillment) updateData.fulfillment_status = targetFulfillment;
        if (parsed.data.paymentStatus) updateData.payment_status = parsed.data.paymentStatus;

        // If transitioning to 'cancelled' from a non-cancelled state -> Restore stock!
        const prevStatus = existingOrder.fulfillment_status;
        if (targetFulfillment === "cancelled" && prevStatus !== "cancelled") {
            const items = existingOrder.order_items || [];
            for (const item of items) {
                let variantId = item.variant_id;
                if (!variantId && item.product_id) {
                    let q = supabase.from("product_variants").select("id").eq("product_id", item.product_id);
                    if (item.size_snapshot) q = q.eq("size", item.size_snapshot);
                    if (item.color_snapshot) q = q.eq("color", item.color_snapshot);
                    const { data: v } = await q.limit(1).maybeSingle();
                    if (v) variantId = v.id;
                }
                if (variantId) {
                    const { data: currentV } = await supabase.from("product_variants").select("stock").eq("id", variantId).single();
                    if (currentV) {
                        await supabase.from("product_variants").update({ stock: (currentV.stock || 0) + Number(item.quantity || 1) }).eq("id", variantId);
                    }
                }
            }
        }
        // If transitioning FROM 'cancelled' back to active -> Deduct stock again!
        else if (prevStatus === "cancelled" && targetFulfillment && targetFulfillment !== "cancelled") {
            const items = existingOrder.order_items || [];
            for (const item of items) {
                let variantId = item.variant_id;
                if (!variantId && item.product_id) {
                    let q = supabase.from("product_variants").select("id").eq("product_id", item.product_id);
                    if (item.size_snapshot) q = q.eq("size", item.size_snapshot);
                    if (item.color_snapshot) q = q.eq("color", item.color_snapshot);
                    const { data: v } = await q.limit(1).maybeSingle();
                    if (v) variantId = v.id;
                }
                if (variantId) {
                    const { data: currentV } = await supabase.from("product_variants").select("stock").eq("id", variantId).single();
                    if (currentV) {
                        await supabase.from("product_variants").update({ stock: Math.max(0, (currentV.stock || 0) - Number(item.quantity || 1)) }).eq("id", variantId);
                    }
                }
            }
        }

        const { data: updatedOrder, error } = await supabase
            .from("orders")
            .update(updateData)
            .eq("id", existingOrder.id)
            .select()
            .single();

        if (error) throw error;
        res.json(updatedOrder);
    } catch (err: any) {
        sendError(res, err, "Update order status error");
    }
});

// رابط إيصال مؤقت موقّع (60 ثانية) لأمر داخل لوحة التحكم
// لا يُرجع أبداً مفتاح التخزين الخام عبر هذا المسار
router.get("/:id/receipt-url", async (req, res) => {
    try {
        const { id } = req.params;
        let { data: order } = await supabase.from("orders").select("receipt_storage_key").eq("id", id).maybeSingle();
        if (!order) {
            const { data: fallback } = await supabase.from("orders").select("receipt_storage_key").eq("public_reference", id).maybeSingle();
            order = fallback;
        }

        if (!order) {
            return res.status(404).json({ error: "Order not found" });
        }

        const key = order.receipt_storage_key;
        if (!key) {
            return res.json({ url: null });
        }

        // إيصالات قديمة (قبل انفصال السلات) كانت تُخزَّن كرابط عام كامل — تُترك كما هي خلال هذه المرحلة
        if (/^https?:\/\//i.test(key)) {
            return res.json({ url: key, legacy: true });
        }

        // المفاتيح الجديدة الخاصة — رابط موقّع قصير الأمد من السلات الخاصة/العامة
        let signedUrl: string | null = null;
        for (const bucket of ["order-receipts", "product-images"]) {
            const { data } = await supabase.storage.from(bucket).createSignedUrl(key, 60);
            if (data?.signedUrl) {
                signedUrl = data.signedUrl;
                break;
            }
        }

        if (!signedUrl) {
            return res.status(404).json({ error: "Receipt not found" });
        }

        res.json({ url: signedUrl });
    } catch (err: any) {
        sendError(res, err, "Receipt signed URL error");
    }
});

export default router;