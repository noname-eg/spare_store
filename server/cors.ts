import type { CorsOptions } from "cors";

// بناء إعدادات CORS من متغير APP_ORIGIN
// - يدعم عدة أصول مفصولة بفواصل
// - بمجرد ضبط الأصول: لا يُستخدم "*" أبداً مع credentials، ويعكس الأصل الوارد فقط إذا كان مسموحاً
// - إذا لم يُضبط APP_ORIGIN (أثناء التطوير): يُترك cors افتراضياً دون credentials
export function buildCorsOptions(originEnv: string | undefined, effectiveMode: "development" | "production" = "development"): CorsOptions | undefined {
    const origins = (originEnv || "")
        .split(",")
        .map((origin) => origin.trim().replace(/\/$/, ""))
        .filter(Boolean);

    if (origins.length) {
        return { origin: origins, credentials: true };
    }

    if (effectiveMode === "production") {
        // في الإنتاج يجب ضبط APP_ORIGIN؛ وإن غاب، نرفض الطلبات عبر المجالات (يعمل للمصدر نفسه فقط)
        return { origin: false, credentials: true };
    }

    // تطوير: يُرجع undefined فيُفعَّل السلوك الافتراضي الواسع لسهولة العمل المحلي
    return undefined;
}