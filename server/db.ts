import { createClient } from "@supabase/supabase-js";
import type { StoreProduct, Coupon, Order, SiteSettings, ProductVariant } from "../shared/api";

const supabaseUrl = process.env.SUPABASE_URL || "";
// أمنية: لا توجد بدائل مجهولة لمفاتيح الخادم. العمليات الصلاحية في الخادم تتطلب مفتاح خدمة حصرياً.
// عدم وجود المفتاح = فشل آمن عند بدء التشغيل بدلاً من الهبوط الصامت إلى عميل مجهول.
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!supabaseUrl || !supabaseKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required on the server. Refusing to fall back to an anonymous key.");
}

export const supabase = createClient(supabaseUrl, supabaseKey);

// --- Products ---
export async function getProducts(): Promise<StoreProduct[]> {
    const { data: products, error } = await supabase
        .from("products")
        .select("*, product_variants(*), categories(id, slug, name_ar, name)")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

    if (error) {
        console.error("Error fetching products:", error);
        return [];
    }

    return (products || []).map((p: any) => {
        const variants = p.product_variants || [];
        const sizes = Array.from(new Set(variants.map((v: any) => v.size))).filter(Boolean) as string[];
        const colors = Array.from(new Set(variants.map((v: any) => v.color))).filter(Boolean) as string[];
        const totalStock = variants.reduce((acc: number, v: any) => acc + (v.stock || 0), 0);

        const orig = Number(p.original_price || 0);
        const sale = p.sale_price ? Number(p.sale_price) : undefined;
        const finalPrice = sale || orig;

        return {
            id: p.id,
            slug: p.slug,
            name: p.name || p.name_ar || "",
            nameAr: p.name_ar,
            price: `${finalPrice.toLocaleString("en-US")} ج.م`,
            numericPrice: finalPrice,
            originalPrice: orig,
            salePrice: sale,
            badge: p.badge || undefined,
            category: p.categories?.name || p.category_id || "Dresses",
            descriptionAr: p.description_ar,
            description: p.description,
            image: p.image || (p.images && p.images[0]) || "",
            images: p.images || [],
            video: p.video || undefined,
            stock: totalStock,
            colors: colors.length ? colors : ["#222222"],
            sizes: sizes.length ? sizes : ["S", "M", "L"],
            variants: variants,
            isActive: p.is_active,
        };
    });
}

// --- Coupons ---
export async function getCoupons(): Promise<Coupon[]> {
    const { data, error } = await supabase.from("coupons").select("*").order("created_at", { ascending: false });
    if (error) return [];
    return data.map((c: any) => ({
        id: c.id,
        code: c.code,
        discount: Number(c.discount_percent),
        uses: c.used_count,
        active: c.is_active,
    }));
}

// كوبونات عامة: فقط النشطة وغير المنتهية، بدون أي بيانات حساسة
export async function getPublicCoupons(): Promise<Coupon[]> {
    const now = new Date().toISOString();
    const { data, error } = await supabase
        .from("coupons")
        .select("code, discount_percent, used_count, is_active, max_uses, ends_at")
        .eq("is_active", true)
        .order("created_at", { ascending: false });

    if (error) return [];
    return (data || [])
        .filter((c: any) => (c.ends_at ? c.ends_at > now : true))
        .filter((c: any) => (c.max_uses ? (c.used_count || 0) < c.max_uses : true))
        .map((c: any) => ({
            code: c.code,
            discount: Number(c.discount_percent),
            uses: c.used_count || 0,
            active: true,
        }));
}

export async function createCoupon(coupon: { code: string; discount: number }) {
    const { data, error } = await supabase
        .from("coupons")
        .insert([{ code: coupon.code.toUpperCase(), discount_percent: coupon.discount }])
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function deleteCoupon(code: string) {
    const { error } = await supabase.from("coupons").delete().eq("code", code.toUpperCase());
    if (error) throw error;
}

// --- Orders ---
export async function getOrders(): Promise<any[]> {
    const { data, error } = await supabase.from("orders").select("*, order_items(*)").order("created_at", { ascending: false });
    if (error) return [];

    const statusMap: Record<string, string> = {
        new: "جديد",
        processing: "قيد التجهيز",
        completed: "مكتمل",
        cancelled: "ملغي",
    };

    return data.map((o: any) => ({
        id: o.public_reference || o.id,
        dbId: o.id,
        publicReference: o.public_reference,
        customerName: o.customer_name,
        phone: o.phone,
        address: o.address,
        notes: o.notes,
        paymentMethod: o.payment_method,
        paymentStatus: o.payment_status || "pending",
        fulfillmentStatus: o.fulfillment_status || "new",
        status: statusMap[o.fulfillment_status] || o.fulfillment_status || "جديد",
        subtotal: Number(o.subtotal || 0),
        discountAmount: Number(o.discount_amount || 0),
        shippingAmount: Number(o.shipping_amount || 0),
        total: Number(o.total || 0),
        couponCode: o.coupon_code,
        transferNumber: o.transfer_number_snapshot,
        hasReceipt: Boolean(o.receipt_storage_key),
        date: o.created_at,
        createdAt: o.created_at,
        items: (o.order_items || []).reduce((acc: number, i: any) => acc + Number(i.quantity || 1), 0),
        orderItems: (o.order_items || []).map((i: any) => ({
            id: i.id,
            name: i.product_name_snapshot,
            productName: i.product_name_snapshot,
            size: i.size_snapshot,
            color: i.color_snapshot,
            unitPrice: Number(i.unit_price || 0),
            quantity: Number(i.quantity || 1),
            total: Number(i.line_total || 0),
            lineTotal: Number(i.line_total || 0),
            variantId: i.variant_id,
            productId: i.product_id,
        })),
    }));
}

// طلب واحد للعميل عبر المرجع العام (بيانات عامة آمنة)
export async function getOrderByReference(reference: string) {
    const { data: order, error } = await supabase
        .from("orders")
        .select("*, order_items(*)")
        .eq("public_reference", reference)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error || !order) return null;

    return {
        id: order.public_reference || order.id,
        publicReference: order.public_reference,
        date: order.created_at,
        total: Number(order.total || 0),
        subtotal: Number(order.subtotal || 0),
        discountAmount: Number(order.discount_amount || 0),
        shippingAmount: Number(order.shipping_amount || 0),
        couponCode: order.coupon_code,
        customerName: order.customer_name,
        phone: order.phone,
        address: order.address,
        notes: order.notes,
        paymentMethod: order.payment_method,
        paymentStatus: order.payment_status,
        fulfillmentStatus: order.fulfillment_status,
        transferNumber: order.transfer_number_snapshot,
        hasReceipt: Boolean(order.receipt_storage_key),
        items: (order.order_items || []).reduce((acc: number, i: any) => acc + Number(i.quantity || 1), 0),
        orderItems: (order.order_items || []).map((i: any) => ({
            id: i.id,
            name: i.product_name_snapshot,
            productName: i.product_name_snapshot,
            size: i.size_snapshot,
            color: i.color_snapshot,
            unitPrice: Number(i.unit_price || 0),
            quantity: Number(i.quantity || 1),
            total: Number(i.line_total || 0),
            lineTotal: Number(i.line_total || 0),
            variantId: i.variant_id,
            productId: i.product_id,
        })),
    };
}

// منتج واحد مباشرةً من قاعدة البيانات قبل التنسيق العام
export async function getProductBySlug(slug: string) {
    const { data: product, error } = await supabase
        .from("products")
        .select("*, product_variants(*), categories(id, slug, name_ar, name)")
        .or(`slug.eq.${slug},id.eq.${slug}`)
        .limit(1)
        .maybeSingle();

    if (error || !product) return null;
    return product;
}

// الأقسام النشطة
export async function getCategories() {
    const { data, error } = await supabase
        .from("categories")
        .select("id, slug, name_ar, name, sort_order")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

    if (error) return [];
    return (data || []).map((c: any) => ({
        id: c.id,
        slug: c.slug,
        nameAr: c.name_ar,
        name: c.name,
    }));
}