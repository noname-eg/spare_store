import { Router } from "express";
import { z } from "zod";
import { supabase } from "../db";
import { sendError } from "../error";

const router = Router();

const settingsSchema = z.object({
    type: z.string().min(1).max(64),
    data: z.record(z.unknown()).refine((value) => JSON.stringify(value).length <= 200000, {
        message: "Settings payload too large",
    }),
});

// Save settings by key
router.post("/", async (req, res) => {
    try {
        const parsed = settingsSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: "Invalid settings payload", details: parsed.error.flatten() });
        }
        const { type, data } = parsed.data;

        const { error } = await supabase
            .from("site_settings")
            .upsert(
                { key: type, value_json: data },
                { onConflict: 'key' }
            );

        if (error) {
            // fallback if site_settings table does not properly exist or is named differently
            // let's try if it works first
            throw error;
        }

        res.json({ success: true, [type]: data });
    } catch (err: any) {
        sendError(res, err, "Save settings error");
    }
});

// We need a GET route to load all of them easily for StoreLayout
router.get("/", async (req, res) => {
    try {
        const { data, error } = await supabase.from("site_settings").select("key, value_json");
        if (error) throw error;
        
        const response: any = {};
        for (const item of data || []) {
            response[item.key] = item.value_json;
        }
        res.json(response);
    } catch (err: any) {
        res.json({}); // safe fallback empty
    }
});

export default router;