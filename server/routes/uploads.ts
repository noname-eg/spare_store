import { Router } from "express";
import { supabase } from "../db";
import { requireAdmin } from "../auth";
import { sendError } from "../error";

const router = Router();

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5MB
export const ALLOWED_MIME: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
};

// فحص توقيع الملف الفعلي (الماجيك بايت) للتحقق من الصورة — لا يُثق بعنوان Content-Type أو البادئة
export function detectImageType(buffer: Buffer): string | null {
    if (!buffer || buffer.length < 12) return null;
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return "image/png";
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) return "image/gif";
    if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "image/webp";
    return null;
}

const uploadAttempts = new Map<string, number[]>();
function isUploadRateLimited(key: string) {
    const now = Date.now();
    const recent = (uploadAttempts.get(key) || []).filter((t) => now - t < 60 * 1000);
    uploadAttempts.set(key, recent);
    return recent.length >= 15;
}

export const KIND_BUCKETS: Record<string, string> = {
    product: "product-images",
    receipt: "order-receipts",
};

async function runUpload(req: any, res: any) {
    try {
        const { image_base64, file_name, kind } = req.body || {};

        if (!image_base64 || !file_name) {
            return res.status(400).json({ error: "Missing image data or file name" });
        }
        if (typeof image_base64 !== "string" || typeof file_name !== "string") {
            return res.status(400).json({ error: "Invalid payload" });
        }

        const uploadKind = typeof kind === "string" ? kind : "product";
        if (uploadKind !== "product" && uploadKind !== "receipt") {
            return res.status(400).json({ error: "Invalid upload kind" });
        }

        const clientKey = req.ip || req.socket.remoteAddress || "unknown";
        if (isUploadRateLimited(clientKey)) {
            return res.status(429).json({ error: "Too many uploads. Try again later." });
        }

        // فك الترميز (بدعم Base64 مع أو بدون بادئة data URL) — لكن المفتاح الفعلي مسار آمن لا يُبنى من العميل
        const match = image_base64.match(/^data:([^;,]+);base64,(.+)$/s);
        const declaredMime = match ? match[1].toLowerCase() : null;
        const buffer = Buffer.from(match ? match[2] : image_base64.replace(/^data:image\/\w+;base64,/, ""), "base64");

        if (!buffer.length) return res.status(400).json({ error: "Empty file" });
        if (buffer.length > MAX_UPLOAD_BYTES) return res.status(413).json({ error: "Image must be 5MB or less" });

        // التحقق من صحة الصورة فعلياً من الماجيك بايت (لا يُقبل سكربت/ملف تنفيذي متخفٍّ)
        const detectedMime = detectImageType(buffer);
        if (!detectedMime) return res.status(400).json({ error: "Only image files (JPEG, PNG, WEBP, GIF) are allowed" });
        if (declaredMime && !ALLOWED_MIME[declaredMime]) return res.status(400).json({ error: "Unsupported image type" });

        uploadAttempts.set(clientKey, [...(uploadAttempts.get(clientKey) || []), Date.now()].slice(-20));

        const extension = ALLOWED_MIME[detectedMime] || "img";
        // اسم آمن: لا يسمح بمسار/تخطي مجلد، ويُقتطع الطول
        const safeName = String(file_name || `upload.${extension}`).replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 60) || `upload.${extension}`;
        const bucket = KIND_BUCKETS[uploadKind];
        // الإيصالات في مسار خاص؛ صور المنتجات في مسار عام. المفتاح يُبنى خادمياً دائماً (لا يُقبل من العميل).
        const storagePrefix = uploadKind === "receipt" ? "receipts" : "public";
        const storageKey = `${storagePrefix}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeName}`;

        // upsert: false — لا يُستبدل أبداً ملف قائم عند تطابق المفتاح (مفتاح عشوائي يجعل التصادم بديعاً)
        const { data, error } = await supabase.storage
            .from(bucket)
            .upload(storageKey, buffer, {
                contentType: detectedMime,
                upsert: false,
            });

        if (error) throw error;

        if (uploadKind === "receipt") {
            // مفتاح خاص فقط — لا يُحمَّل رابط عام أبداً، ولا Base64
            return res.json({ key: data.path });
        }

        const { data: publicUrlData } = supabase.storage
            .from(bucket)
            .getPublicUrl(data.path);

        res.json({ url: publicUrlData.publicUrl });
    } catch (err: any) {
        sendError(res, err, "Upload error");
    }
}

// رفع صورة إلى Supabase Storage
// - kind: "product" => مقيّد بمصادقة أدمن (خادمياً) + bucket عام product-images + رابط عام
// - kind: "receipt" => عام (يحدث قبل إنشاء الطلب) + bucket خاص order-receipts + المفتاح الخاص فقط
router.post("/", (req, res) => {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const uploadKind = typeof body.kind === "string" ? body.kind : "product";

    // حماية رفع صور المنتجات على مستوى النقل — إخفاء الواجهة لا يُعد حماية
    if (uploadKind === "product") {
        requireAdmin(req, res, () => { void runUpload(req, res); });
        return;
    }
    void runUpload(req, res);
});

export default router;