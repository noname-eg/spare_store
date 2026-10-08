import { Router } from "express";
import { supabase } from "../db";
import { sendError } from "../error";

const router = Router();

function coerceMoney(value: unknown, fallback: number): number {
    const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
    if (typeof n === "number" && Number.isFinite(n) && n >= 0) return n;
    return fallback;
}

function coerceText(value: unknown, max = 4000): string {
    return typeof value === "string" ? value.slice(0, max) : "";
}

// تحقق دفاعي من بيانات المنتج القادمة من لوحة التحكم دون كسر حمولاتها الصالحة
function validateProductBody(body: any): string | null {
    if (!body || typeof body !== "object") return "Invalid product payload";
    // الاسم العربي مطلوب (products.name_ar NOT NULL)؛ الإنجليزي أساسي لكن اختياري حسب الاتفاق
    if (typeof body.nameAr !== "string" || body.nameAr.trim() === "") return "Product name is required";
    if (body.variants !== undefined) {
        if (!Array.isArray(body.variants)) return "Variants must be an array";
        for (const v of body.variants) {
            if (!v || typeof v !== "object") return "Invalid variant entry";
            if (typeof v.size !== "string" || typeof v.color !== "string") return "Each variant needs a size and a color";
        }
    }
    if (body.sizes !== undefined && (!Array.isArray(body.sizes) || body.sizes.some((s: unknown) => typeof s !== "string"))) return "Sizes must be an array of strings";
    if (body.colors !== undefined && (!Array.isArray(body.colors) || body.colors.some((c: unknown) => typeof c !== "string"))) return "Colors must be an array of strings";
    if (body.images !== undefined && !Array.isArray(body.images)) return "Images must be an array";
    return null;
}

// Helper to construct product payload matching the final database contract
const buildProductPayload = (body: any) => {
    const enName = typeof body.name === "string" && body.name.trim() !== "" ? body.name.slice(0, 200) : coerceText(body.nameAr, 200);
    return {
        slug: body.id || (body.name || body.nameAr).trim().toLowerCase().replace(/[^a-z0-9]+/gu, "-"),
        name: enName,
        name_ar: coerceText(body.nameAr, 200),
        description: typeof body.description === "string" ? body.description.slice(0, 4000) : null,
        description_ar: typeof body.descriptionAr === "string" ? body.descriptionAr.slice(0, 4000) : null,
        category_id: typeof body.categoryId === "string" ? body.categoryId.slice(0, 64) : null,
        original_price: coerceMoney(body.originalPrice ?? body.numericPrice, 0),
        sale_price: coerceMoney(body.salePrice, 0) || null,
        badge: typeof body.badge === "string" ? body.badge.slice(0, 100) : null,
        image: coerceText(body.image ?? (Array.isArray(body.images) ? body.images[0] : "")),
        images: Array.isArray(body.images) ? body.images.slice(0, 10).map((img: unknown) => coerceText(img)) : [],
        video: typeof body.video === "string" ? body.video.slice(0, 2000) : null,
        is_active: true
    };
};

// 1. إضافة منتج جديد
router.post("/", async (req, res) => {
    try {
        const invalid = validateProductBody(req.body);
        if (invalid) return res.status(400).json({ error: invalid });
        const payload = buildProductPayload(req.body);

        // Insert Product
        const { data: product, error } = await supabase
            .from("products")
            .insert([payload])
            .select()
            .single();

        if (error) throw error;

        // Insert variants
        const explicitVariants = req.body.variants;
        const variantsToInsert = [];

        if (Array.isArray(explicitVariants) && explicitVariants.length > 0) {
            for (const v of explicitVariants) {
                variantsToInsert.push({
                    product_id: product.id,
                    size: coerceText(v.size, 64) || "M",
                    color: coerceText(v.color, 64) || "#222222",
                    stock: coerceMoney(v.stock, 0)
                });
            }
        } else {
            const sizes = Array.isArray(req.body.sizes) && req.body.sizes.length ? req.body.sizes : ["M"];
            const colors = Array.isArray(req.body.colors) && req.body.colors.length ? req.body.colors : ["#222222"];
            const totalTargetStock = coerceMoney(req.body.stock, 10);
            const totalCount = sizes.length * colors.length;
            const baseStock = Math.max(1, Math.floor(totalTargetStock / totalCount));

            for (const size of sizes) {
                for (const color of colors) {
                    variantsToInsert.push({
                        product_id: product.id,
                        size: coerceText(size, 64),
                        color: coerceText(color, 64),
                        stock: baseStock
                    });
                }
            }
        }

        if (variantsToInsert.length > 0) {
            const { error: variantsError } = await supabase.from("product_variants").insert(variantsToInsert);
            if (variantsError) throw variantsError;
        }

        res.status(201).json(product);
    } catch (err: any) {
        sendError(res, err, "Add Product Error");
    }
});

// 2. تعديل بيانات منتج
router.put("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const invalid = validateProductBody(req.body);
        if (invalid) return res.status(400).json({ error: invalid });
        const payload = buildProductPayload(req.body);

        // Update Product
        let productData;
        const { data: product, error } = await supabase
            .from("products")
            .update(payload)
            .eq("slug", id)
            .select()
            .single();

        if (error) {
            // fallback by UUID
            const { data: fallbackProduct, error: fallbackError } = await supabase
                .from("products")
                .update(payload)
                .eq("id", id)
                .select()
                .single();
            if (fallbackError) throw fallbackError;
            productData = fallbackProduct;
        } else {
            productData = product;
        }

        // Upsert المتغيرات مع الحفاظ على معرفات المتغيرات الحالية
        // (مطابقة على زوج المقاس/اللون بدلاً من حذف وإعادة إنشاء)
        if (productData && req.body.variants && Array.isArray(req.body.variants)) {
            const { data: existingVariants } = await supabase
                .from("product_variants")
                .select("id, size, color")
                .eq("product_id", productData.id);

            const existingById = new Map<string, any>((existingVariants || []).map((ev: any) => [ev.id, ev]));
            const existingByKey = new Map<string, any>();
            for (const ev of existingVariants || []) existingByKey.set(`${ev.size}|${ev.color}`, ev);

            const submittedKeys: string[] = [];
            for (const v of req.body.variants) {
                const size = coerceText(v.size, 64) || "M";
                const color = coerceText(v.color, 64) || "#222222";
                const key = `${size}|${color}`;
                submittedKeys.push(key);

                const vals = {
                    product_id: productData.id,
                    size,
                    color,
                    stock: coerceMoney(v.stock, 0)
                };

                const matched = (v.id && typeof v.id === "string" && existingById.get(v.id)) || existingByKey.get(key);
                if (matched) {
                    const { error } = await supabase.from("product_variants").update(vals).eq("id", matched.id);
                    if (error) throw error;
                } else {
                    const { error } = await supabase.from("product_variants").insert(vals);
                    if (error) throw error;
                }
            }

            // حذف المتغيرات التي أُزيلت من المحرر فقط إذا لم تكن مرتبطة بطلبات سابقة
            for (const ev of existingVariants || []) {
                const key = `${ev.size}|${ev.color}`;
                if (submittedKeys.includes(key)) continue;
                const { data: referenced } = await supabase.from("order_items").select("id").eq("variant_id", ev.id).limit(1).maybeSingle();
                if (!referenced) {
                    await supabase.from("product_variants").delete().eq("id", ev.id);
                }
            }
        }

        res.json(productData);
    } catch (err: any) {
        sendError(res, err, "Update Product Error");
    }
});

// 3. حذف منتج
router.delete("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        let { error } = await supabase.from("products").delete().eq("slug", id);
        if (error) {
            let res2 = await supabase.from("products").delete().eq("id", id);
            if (res2.error) throw res2.error;
        }

        res.json({ message: "Product deleted successfully" });
    } catch (err: any) {
        sendError(res, err, "Delete Product Error");
    }
});

export default router;