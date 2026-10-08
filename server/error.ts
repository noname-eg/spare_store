import type { Response } from "express";

// نمط يشير إلى تسريب تفاصيل قاعدة بيانات/بنية داخلية في رسالة خطأ
const LEAK_PATTERN =
    /\b(pgsql|postgres|postgrest|supabase|violates|constraint|duplicate key|syntax\b|relation\b|column\b|0x[0-9a-f]{4}|Npgsql|invalid input syntax|permission denied|policy)\b/i;

// تنسيق آمن لرسالة خطأ موجهة للعميل مع الحفاظ على كود الحالة الصحيح
// - رسائل 4xx الآمنة (المبنية داخل التطبيق) تُمرر كما هي
// - أي رسالة تشبه تفاصيل DB/داخلية تُستبدل برسالة عامة
// - كل ما عدا ذلك يتحول إلى 500 عام
export function sanitizeClientMessage(err: unknown): { status: number; message: string } {
    if (err && typeof err === "object") {
        const candidate = err as { status?: unknown; message?: unknown };
        const status = Number(candidate.status);
        if (Number.isInteger(status) && status >= 400 && status < 500 && typeof candidate.message === "string" && candidate.message.length > 0 && candidate.message.length <= 200) {
            const message = candidate.message.trim();
            if (!LEAK_PATTERN.test(message)) {
                return { status, message };
            }
        }
    }
    return { status: 500, message: "Something went wrong. Please try again." };
}

export function sendError(res: Response, err: unknown, logContext?: string) {
    if (logContext) {
        // تفاصيل كاملة للسجل الخادمي فقط، لا تُرسل أبداً للعميل
        console.error(logContext, err);
    }
    const { status, message } = sanitizeClientMessage(err);
    res.status(status).json({ error: message });
}