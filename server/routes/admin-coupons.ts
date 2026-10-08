import { Router } from "express";
import { z } from "zod";
import { getCoupons, createCoupon, deleteCoupon } from "../db";
import { sendError } from "../error";

const router = Router();

const createCouponSchema = z.object({
    code: z.string().trim().min(1).max(32).regex(/^[A-Za-z0-9_-]+$/, "Code may contain letters, digits, _ and -"),
    discount: z.number().int().min(1).max(100),
});

// 1. جلب كافة الكوبونات
router.get("/", async (_req, res) => {
    try {
        const coupons = await getCoupons();
        res.json(coupons);
    } catch (err: any) {
        sendError(res, err, "Fetch coupons error");
    }
});

// 2. إنشاء كوبون جديد
router.post("/", async (req, res) => {
    try {
        const parsed = createCouponSchema.safeParse(req.body || {});
        if (!parsed.success) {
            return res.status(400).json({ error: "Invalid coupon payload", details: parsed.error.flatten() });
        }
        const coupon = await createCoupon({
            code: String(parsed.data.code),
            discount: Number(parsed.data.discount),
        });
        res.status(201).json(coupon);
    } catch (err: any) {
        sendError(res, err, "Create coupon error");
    }
});

// 3. حذف كوبون
router.delete("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        await deleteCoupon(id);
        res.json({ message: "Coupon deleted successfully" });
    } catch (err: any) {
        sendError(res, err, "Delete coupon error");
    }
});

export default router;