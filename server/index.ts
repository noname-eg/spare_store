import "dotenv/config";
import express from "express";
import type { ErrorRequestHandler } from "express";
import cors from "cors";
import { handleDemo } from "./routes/demo";
import { registerAuthRoutes, requireAdmin } from "./auth";
import { buildCorsOptions } from "./cors";
import productsRouter from './routes/products';
import adminProductsRouter from './routes/admin-products';
import ordersRouter from './routes/orders';
import adminOrdersRouter from './routes/admin-orders';
import couponsRouter from './routes/coupons';
import adminCouponsRouter from './routes/admin-coupons';
import settingRouter from './routes/setting';
import adminSettingsRouter from './routes/admin-settings';
import uploadsRouter from './routes/uploads';

// معالج أخطاء موحد: JSON دائماً (لا صفحات HTML خام) + لا تسريب تفاصيل داخلية
const apiErrorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (err && typeof err === "object" && (err as any).type === "entity.too.large") {
    res.status(413).json({ error: "Payload too large. Files must be 5MB or less." });
    return;
  }
  if (err && (err as any)?.message === "Not allowed by CORS") {
    res.status(403).json({ error: "Origin not allowed by CORS." });
    return;
  }
  if (res.headersSent) {
    next(err);
    return;
  }
  res.status(500).json({ error: "Something went wrong. Please try again." });
};

export function createServer() {
  const app = express();

  app.disable("x-powered-by");
  // CORS: عند ضبط APP_ORIGIN يُسمح بالأصول المذكورة فقط مع credentials (لا "*" أبداً مع credentials)
  app.use(cors(buildCorsOptions(process.env.APP_ORIGIN, process.env.NODE_ENV === "production" ? "production" : "development")));
  // حد النقل يغطي ترميز Base64، بينما حد الملف بعد الفك يبقى 5MB في /api/uploads
  app.use(express.json({ limit: "8mb" }));
  app.use(express.urlencoded({ extended: true, limit: "8mb" }));
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    next();
  });

// لا تخزين مؤقت لبيانات API (حماية الإيصالات والحساسية من التخزين المؤقت على الفروع/الخوادم الوسيطة)
app.use("/api", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
});

app.get("/api/ping", (_req, res) => {
    res.json({ message: "ok" });
});

app.get("/api/demo", handleDemo);
registerAuthRoutes(app);

// Public Routes
app.use('/api/products', productsRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/coupons', couponsRouter);
app.use('/api/settings', settingRouter);
app.use('/api/uploads', uploadsRouter);

// Admin Routes (protected)
app.use('/api/admin/products', requireAdmin, adminProductsRouter);
app.use('/api/admin/orders', requireAdmin, adminOrdersRouter);
app.use('/api/admin/coupons', requireAdmin, adminCouponsRouter);
app.use('/api/admin/settings', requireAdmin, adminSettingsRouter);

// معالج أخطاء JSON الموحد في نهاية السلسلة
app.use(apiErrorHandler);
return app;
}
