import { Router } from "express";
import { supabase } from "../db";
import { sendError } from "../error";

const router = Router();

// سماحيّ صريح للإعدادات العامة: أي مفتاح جديد يُضاف لاحقاً في site_settings (مثل مفاتيح/إعدادات داخلية)
// لن يُشعَّر للواجهة إلا بعد إضافته هنا عمداً.
export const PUBLIC_SETTINGS_KEYS = ["siteSettings", "sections", "pageSettings"];

export function filterPublicSettings(records: { key: string; value_json: unknown }[]): Record<string, unknown> {
    const response: Record<string, unknown> = {};
    for (const item of records || []) {
        if (PUBLIC_SETTINGS_KEYS.includes(item.key)) {
            response[item.key] = item.value_json;
        }
    }
    return response;
}

// جلب إعدادات المتجر العامة — مقتصرة على قائمة السماح فقط
router.get("/", async (_req, res) => {
    try {
        const { data, error } = await supabase.from("site_settings").select("key, value_json");
        if (error) throw error;
        res.json(filterPublicSettings((data || []) as { key: string; value_json: unknown }[]));
    } catch (err: any) {
        sendError(res, err, "Public settings error");
    }
});

export default router;