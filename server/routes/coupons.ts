import { Router } from "express";
import { getPublicCoupons } from "../db";
import { sendError } from "../error";

const router = Router();

// قائمة عامة بالكوبونات النشطة فقط (تُستخدم لعرض الخصم في السلة/الدفع)
// ملاحظة: التحقق الفعلي وصرف الخصم يتم خادمياً عند إنشاء الطلب
router.get("/", async (_req, res) => {
    try {
        const coupons = await getPublicCoupons();
        res.json(coupons);
    } catch (err: any) {
        sendError(res, err, "Public coupons error");
    }
});

export default router;