import { Router } from "express";
import { supabase } from "../db";
import {
    computeShipping as orderShipping,
    computeCouponDiscount as orderDiscount,
    computeTotal as orderTotal,
    computeLineTotal,
    resolveProductName,
    resolveUnitPrice,
} from "../../shared/orderMath";
import { createOrderSchema } from "../../shared/orderSchemas";
import { resolveShippingSettings } from "../../shared/orderMath";
import { buildCreateOrderPayload, mapCreateOrderRpcError } from "../orders/rpc-payload";

const router = Router();

async function getShippingDefaults() {
    const { data } = await supabase.from("site_settings").select("key, value_json").eq("key", "siteSettings").limit(1).maybeSingle();
    // إعدادات موثوقة فقط: قيّم صالحة وغير سالبة، وإلا القيم الافتراضية للمشروع
    return resolveShippingSettings((data?.value_json as any) || {});
}

// حد للطلبات العامة: 10 طلبات / دقيقة / عنوان IP
const ORDER_LIMIT_PER_WINDOW = 10;
const orderAttempts = new Map<string, number[]>();
function isOrderRateLimited(key: string) {
    const now = Date.now();
    const recent = (orderAttempts.get(key) || []).filter((t) => now - t < 60 * 1000);
    orderAttempts.set(key, recent);
    return recent.length >= ORDER_LIMIT_PER_WINDOW;
}
function recordOrderAttempt(key: string) {
    orderAttempts.set(key, [...(orderAttempts.get(key) || []), Date.now()].slice(-20));
}

// خطأ يحمل كود حالة HTTP
function httpError(status: number, message: string) {
    const err: any = new Error(message);
    err.status = status;
    return err;
}

// جلب طلب واحد للعميل عبر المرجع العام (بيانات عامة آمنة — لا تُكشف بيانات الدفع أو الإيصالات)
router.get("/:reference", async (req, res) => {
    try {
        const reference = String(req.params.reference || "").trim();
        if (!reference) return res.status(400).json({ error: "Missing order reference" });

        const { data: order } = await supabase
            .from("orders")
            .select("*, order_items(*)")
            .eq("public_reference", reference)
            .limit(1)
            .maybeSingle();

        if (!order) return res.status(404).json({ error: "Order not found" });

        res.json({
            id: order.public_reference || order.id,
            publicReference: order.public_reference,
            date: order.created_at,
            total: Number(order.total || 0),
            subtotal: Number(order.subtotal || 0),
            discountAmount: Number(order.discount_amount || 0),
            shippingAmount: Number(order.shipping_amount || 0),
            customerName: order.customer_name,
            phone: order.phone,
            address: order.address,
            notes: order.notes,
            paymentMethod: order.payment_method,
            transferNumber: order.transfer_number_snapshot,
            orderItems: (order.order_items || []).map((i: any) => ({
                name: i.product_name_snapshot,
                size: i.size_snapshot,
                color: i.color_snapshot,
                unitPrice: Number(i.unit_price || 0),
                quantity: Number(i.quantity || 1),
                total: Number(i.line_total || 0),
            })),
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// إنشاء طلب جديد من العميل — كل الحسابات تتم خادمياً، ثم يُنفَّذ الحفظ الذرّي
// داخل معاملة DB واحدة عبر RPC public.create_order (order + items + stock + coupon).
// عند أي فشل داخل الـ RPC يتم rollback كامل؛ لا يوجد تعويض على مستوى التطبيق بعد الآن.
router.post("/", async (req, res) => {
    try {
        const parsed = createOrderSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: "Invalid order data", details: parsed.error.flatten() });
        }
        const data = parsed.data;

        // منع تجاوز حد الطلبات
        const clientKey = req.ip || req.socket.remoteAddress || "unknown";
        if (isOrderRateLimited(clientKey)) {
            return res.status(429).json({ error: "Too many orders. Please try again later." });
        }
        recordOrderAttempt(clientKey);

        // منع التكرار عبر idempotency key (فحص سريع قبل الـ RPC)
        if (data.idempotencyKey) {
            const { data: existing } = await supabase.from("orders").select("public_reference,total").eq("idempotency_key", data.idempotencyKey).limit(1).maybeSingle();
            if (existing) {
                return res.status(200).json({ duplicate: true, publicReference: existing.public_reference, total: Number(existing.total || 0) });
            }
        }

        // إيصال الدفع إلزامي لطرق الدفع الإلكتروني، ويُرفع قبل إنشاء الطلب
        if (data.paymentMethod !== "cod" && (!data.receipt || !data.receipt.trim())) {
            return res.status(400).json({ error: "A transfer receipt is required for this payment method" });
        }

        // 1) قراءة المنتجات النشطة والمتغيرات من قاعدة البيانات
        const productIds = [...new Set(data.orderItems.map((item) => item.productId))];
        const { data: products, error: productsError } = await supabase
            .from("products")
            .select("*, product_variants(*)")
            .in("id", productIds)
            .eq("is_active", true);

        if (productsError) {
            // معرّف منتج وهمي (ليس UUID) يسبب خطأ تحويل في Postgres — يُعامل كمنتج غير موجود لا كخطأ داخلي
            if ((productsError as any).code === "22P02") {
                return res.status(400).json({ error: "A product is no longer available" });
            }
            throw productsError;
        }

        // أي منتج مطلوب غير موجود أو معطّل => رفض الطلب
        if ((products || []).length !== productIds.length) {
            return res.status(400).json({ error: "A product is no longer available" });
        }
        const productById = new Map((products || []).map((p: any) => [p.id, p]));

        // 2) بناء بنود الطلب بأسعار من الخادم واختيار المتغير المناسب
        const orderItems: any[] = [];
        let subtotal = 0;

        for (const item of data.orderItems) {
            const product = productById.get(item.productId);
            if (!product) return res.status(400).json({ error: "Product no longer available" });

            const unitPrice = resolveUnitPrice(product);
            const variants: any[] = product.product_variants || [];
            const productName = resolveProductName(product.name, product.name_ar);
            let variant: any = null;

            if (variants.length > 0) {
                // المنتجات ذات المتغيرات: المتغير إجباري، ولا يُختار افتراضياً أبداً
                if (!item.variantId) {
                    return res.status(400).json({ error: `Please select a size and color for ${productName}` });
                }
                // المتغير يجب أن يوجد وأن ينتمي للمنتج نفسه (البحث كان داخل متغيرات هذا المنتج)
                variant = variants.find((v: any) => v.id === item.variantId) || null;
                if (!variant) {
                    return res.status(400).json({ error: `Invalid variant for ${productName}` });
                }
                // عند إرسال المقاس/اللون يجب أن يطابقا المتغير المُحدد بالضبط
                if (item.size && item.size !== variant.size) {
                    return res.status(400).json({ error: `Size mismatch for ${productName}` });
                }
                if (item.color && item.color !== variant.color) {
                    return res.status(400).json({ error: `Color mismatch for ${productName}` });
                }
                // التحقق من الكمية على المتغير المحدد بالذات (لا تخمين ولا بديل)
                if (Number(variant.stock ?? 0) < item.quantity) {
                    throw httpError(409, `This variant of ${productName} does not have enough stock`);
                }
            } else if (item.variantId) {
                // منتج بلا متغيرات لكنه أُرسل بمعرّف متغير => بند غير صالح
                return res.status(400).json({ error: `Invalid variant for ${productName}` });
            }
            // منتج بلا متغيرات: يُحافظ على سلوك المخزون الحالي (لا خصم على المتغيرات)

            const lineTotal = computeLineTotal(unitPrice, item.quantity);
            subtotal += lineTotal;

            orderItems.push({
                product_id: product.id,
                variant_id: variant?.id || null,
                product_name_snapshot: productName,
                sku_snapshot: variant?.sku || null,
                size_snapshot: variant?.size || item.size || null,
                color_snapshot: variant?.color || item.color || null,
                unit_price: unitPrice,
                quantity: item.quantity,
                line_total: lineTotal,
            });
        }

        // 3) تطبيق الكوبون (تحقق خادمي كامل؛ الـ RPC يعيد التحقق داخل المعاملة)
        let discountAmount = 0;
        let couponCode: string | null = data.couponCode || null;

        if (couponCode) {
            const normalized = couponCode.toUpperCase();
            const { data: coupon, error: couponError } = await supabase
                .from("coupons")
                .select("*")
                .eq("code", normalized)
                .limit(1)
                .maybeSingle();

            if (!couponError && coupon) {
                const now = new Date().toISOString();
                const notStarted = coupon.starts_at ? coupon.starts_at > now : false;
                const notExpired = coupon.ends_at ? coupon.ends_at >= now : true;
                const hasUses = coupon.max_uses ? (coupon.used_count || 0) < coupon.max_uses : true;
                if (!coupon.is_active || notExpired === false) {
                    throw httpError(422, "Coupon is expired or no longer valid");
                }
                if (notStarted) {
                    throw httpError(422, "Coupon is not active yet");
                }
                if (!hasUses) {
                    throw httpError(422, "Coupon has reached its usage limit");
                }
                discountAmount = orderDiscount(subtotal, Number(coupon.discount_percent || 0));
            } else {
                throw httpError(422, "Invalid coupon code");
            }
        }

        // 4) حساب الشحن من الإعدادات (رسم موحد + عتبة الشحن المجاني)
        const { shippingCost, freeShippingThreshold } = await getShippingDefaults();
        const shippingAmount = orderShipping(subtotal, shippingCost, freeShippingThreshold);

        // 5) الإجمالي النهائي
        const total = orderTotal(subtotal, discountAmount, shippingAmount);

        // 6) التنفيذ الذرّي: order + items + stock + coupon في معاملة DB واحدة.
        //    public_reference يولَّد داخل الـ DB — لا يُرسل من الخادم أو المتصفح.
        const { data: rpcData, error: rpcError } = await supabase.rpc("create_order", {
            payload: buildCreateOrderPayload({
                idempotencyKey: data.idempotencyKey || null,
                customerName: data.customerName,
                phone: data.phone,
                address: data.address,
                notes: data.notes || null,
                paymentMethod: data.paymentMethod,
                couponCode,
                transferNumber: data.transferNumber || null,
                receipt: data.receipt || null,
                subtotal,
                discountAmount,
                shippingAmount,
                total,
                items: orderItems,
            }),
        });

        if (rpcError) {
            const mapped = mapCreateOrderRpcError(rpcError);
            if (mapped) {
                console.error("Create order RPC rejected:", rpcError.message);
                return res.status(mapped.status).json({ error: mapped.message });
            }
            throw rpcError;
        }

        if (!rpcData || !rpcData.ok) {
            throw new Error("Order RPC returned an unexpected result");
        }

        // طلب مكرر وصل حتى الـ RPC (سباق بين فحصين): عودة آمنة بدون أي أثر جانبي
        if (rpcData.duplicate) {
            return res.status(200).json({
                duplicate: true,
                publicReference: rpcData.public_reference,
                total: Number(rpcData.total || 0),
            });
        }

        res.status(201).json({
            id: rpcData.public_reference,
            publicReference: rpcData.public_reference,
            total: Number(rpcData.total || total),
            subtotal: Number(rpcData.subtotal ?? subtotal),
            discountAmount: Number(rpcData.discount_amount ?? discountAmount),
            shippingAmount: Number(rpcData.shipping_amount ?? shippingAmount),
            couponCode,
        });
    } catch (err: any) {
        console.error("Create order error:", err);
        const status = Number(err?.status);
        if (status >= 400 && status < 500) {
            return res.status(status).json({ error: err.message || "Order could not be completed" });
        }
        res.status(500).json({ error: "We could not complete your order. Please try again." });
    }
});

export default router;