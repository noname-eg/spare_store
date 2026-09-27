# خطة مراجعة وتجهيز No Name للربط بقاعدة بيانات حقيقية

## النطاق

إعداد تقرير عربي شامل باسم `nonametoshare.workflow` بعد اعتماد الخطة، يوضح حالة المشروع الحالية، المخاطر، ما ينقصه، وخطوات ربط Supabase مع خيار نشر أساسي على Netlify وخطة تشغيل بديلة على Hostinger. لا تُنفّذ تغييرات التطبيق أو النشر ضمن مرحلة التخطيط.

## نتائج التدقيق التي يجب أن ينعكس أثرها في التقرير

- المتجر والمنتجات والإعدادات والكوبونات والطلبات محفوظة حالياً في `localStorage` داخل `client/components/store/StoreLayout.tsx`، والسلة والمفضلة حالات محلية.
- تسجيل الدخول الحالي غير مناسب للإنتاج: بيانات الاعتماد موجودة في `client/pages/AdminLogin.tsx`، والقرار بالسماح لمسار `/admin` يعتمد على `sessionStorage` في `client/App.tsx` ويمكن تجاوزه من أدوات المتصفح.
- لا توجد API حقيقية للمنتجات أو الطلبات أو الإدارة، ولا طبقة قاعدة بيانات أو migrations أو Supabase client.
- السعر والشحن والكوبونات والمخزون تُحسب أو تُدار في العميل؛ يوجد خلل في عدم انتقال خصم السلة إلى Checkout، ولا يتم خصم المخزون أو حفظ المقاس واللون داخل عناصر الطلب.
- إيصالات التحويل تُحوّل إلى Data URL وتُحفظ محلياً بدلاً من تخزين ملفات خاص وآمن.
- `server/index.ts` يحتوي على endpoints تجريبية فقط، وCORS مفتوح، ولا توجد حماية Helmet أو rate limiting أو authorization أو logging مركزي.
- `PING_MESSAGE` يُعاد عبر endpoint عام، ويجب عدم كشف أي قيمة سرية بهذه الطريقة.
- إعداد Netlify يبني الواجهة وFunction فقط ويحتاج اختبار SPA fallback وتوحيد مدير الحزم؛ لا يوجد إعداد Hostinger/PM2/Reverse Proxy موثق.

## النهج الموصى به

اعتماد طبقة Backend/API كحد فاصل بين React وSupabase:

```text
React SPA → API داخل Express/Netlify Function → Supabase Postgres + Private Storage
```

- استخدام Supabase Postgres للمنتجات، المتغيرات، الطلبات، الكوبونات، الإعدادات، المستخدمين وسجل التدقيق.
- استخدام Supabase Storage خاص لإيصالات التحويل والصور، مع Signed URLs قصيرة العمر للإدارة.
- عدم وضع Service Role Key أو أي سر في `VITE_*` أو داخل كود المتصفح.
- استخدام مصادقة خادمية مع جلسة HttpOnly آمنة أو حل Supabase Auth مضبوط، ثم Middleware مركزي للتحقق من الدور.
- اعتماد Netlify كمسار النشر الأساسي عبر Functions، مع توثيق Hostinger كبديل لتشغيل Node دائم.

## مراحل التنفيذ

### 1. تثبيت خط الأساس

- توحيد `pnpm-lock.yaml` و`package-lock.json` إلى مدير حزم واحد، ويفضل PNPM.
- إضافة `.env.example` دون أسرار وتوثيق المتغيرات المطلوبة.
- ضبط TypeScript تدريجياً من `strict: false` إلى تحقق أقوى.
- إضافة اختبارات API وواجهة وتدفق E2E قبل الترحيل.
- التحقق من `pnpm typecheck` و`pnpm test` و`pnpm build` و`pnpm start`.

### 2. بناء أمن الإدارة أولاً

- إزالة `ADMIN_USERNAME` و`ADMIN_PASSWORD` من `client/pages/AdminLogin.tsx` وعدم استخدام `sessionStorage` كدليل صلاحية.
- إنشاء جدول `admin_users` يحتوي على `password_hash` ودور وحالة وتواريخ الدخول.
- إنشاء Login API، Hashing لكلمات المرور، جلسة HttpOnly، انتهاء صلاحية، إلغاء جلسة وLogout.
- إضافة حماية من المحاولات المتكررة وRate Limiting ورسائل عامة لا تكشف وجود الحساب.
- إضافة `requireAdmin`/صلاحيات للأعمال الحساسة، وإرجاع `401/403` من الخادم قبل تنفيذ أي تعديل.
- إضافة Audit Log لتسجيل الدخول وتغيير الأسعار والمخزون والإعدادات والطلبات.
- إبقاء رابط الإدارة مخفياً أو صغيراً بصرياً لا يعني أن المسار مؤمّن؛ الأمن يجب أن يكون خادمياً.

### 3. تصميم Supabase وMigrations

إنشاء migrations للجداول التالية مع المفاتيح والقيود والفهارس:

- `admin_users`, `admin_sessions`
- `categories`
- `products`, `product_variants`, `product_media`
- `orders`, `order_items`
- `coupons`, `coupon_redemptions`
- `site_settings`, `pages`, `sections`
- `uploads`, `audit_logs`

نموذج المنتج يجب أن يدعم `original_price`, `sale_price`, `badge`، والمنتج النشط، بينما يدعم `product_variants` المقاس واللون وSKU والمخزون المحجوز. يجب أن يحتفظ `order_items` بلقطة الاسم والسعر والمقاس واللون وSKU وقت الطلب، لا بالاسم وحده.

### 4. نقل منطق الأعمال إلى API

- إضافة Schemas باستخدام Zod عند حدود API.
- إنشاء API عامة للمنتجات والفئات والبحث.
- إنشاء API محمية لإدارة المنتجات، الأسعار، الشارات، الألوان، المقاسات، المخزون والمحتوى.
- إنشاء Checkout API يعيد حساب الأسعار والشحن والكوبون على الخادم ولا يثق في `total` القادم من العميل.
- استخدام Transaction أو آلية ذرية لحجز وخصم المخزون ومنع البيع الزائد.
- إضافة Idempotency Key لمنع إنشاء طلبات مكررة عند الضغط المتكرر.
- فصل `payment_status` عن `fulfillment_status`.
- تمرير وحفظ `productId`, `variantId`, size, color, couponCode, discountAmount وshippingAmount.
- تحديث استخدام الكوبون داخل Transaction بعد نجاح الطلب.

### 5. الإيصالات والملفات

- التحقق الخادمي من MIME والحجم والامتداد، مع حد حجم واضح.
- رفع الإيصال إلى Bucket خاص في Supabase Storage، وليس Data URL داخل الطلب.
- حفظ `storage_key` وبيانات الملف فقط في قاعدة البيانات.
- عرض الإيصال للإدارة عبر Signed URL مؤقت.
- وضع سياسة حذف/احتفاظ للملفات وعدم جعل bucket عاماً.
- تقييد روابط الصور والفيديو إلى HTTPS ومصادر مسموحة عند الحاجة.

### 6. تحديث الواجهة

- استبدال قراءات وكتابات `localStorage` للبيانات التجارية بطلبات API مع حالات loading/error.
- إبقاء `localStorage` فقط لتفضيلات غير حساسة مثل اللغة أو حالة واجهة مؤقتة.
- إصلاح انتقال الكوبون من Cart إلى Checkout والطلب النهائي.
- ربط المقاس واللون بالـ Cart Item والطلب.
- تعطيل الشراء عند نفاد الـ variant وإظهار المخزون الحقيقي.
- إضافة Logout وحالة جلسة واضحة في لوحة الإدارة.
- معالجة المنتج غير الموجود بدلاً من عرضه كأول منتج.
- توحيد حالات الطلب والإيصالات والرسائل، ثم ربط WhatsApp بالبيانات المعتمدة من الخادم.

### 7. ترحيل البيانات المحلية

- إضافة أداة تصدير JSON محلية للمدير.
- التحقق من البيانات المصدرة بـ Zod وتنظيف الأسعار والمعرفات والألوان والمقاسات.
- استيراد المنتجات والإعدادات والكوبونات داخل مسار Admin محمي.
- مراجعة الطلبات القديمة يدوياً لأنها ليست مرجعاً مالياً موثوقاً قبل الترحيل.
- تسجيل العناصر الفاشلة في تقرير استيراد.
- بعد التحقق، إيقاف الكتابة التجارية إلى `localStorage`.

### 8. Netlify

- تشغيل API من `netlify/functions` مع الحفاظ على الأسرار في Environment Variables الخاصة بـ Netlify فقط.
- تقييد CORS إلى النطاقات المسموحة أو الاعتماد على نفس النطاق.
- إضافة SPA fallback صريح إلى `/index.html` لمسارات BrowserRouter، واختبار `/shop`, `/product/:id`, `/checkout`, `/admin/login` و`/order-summary/:id` عند الفتح المباشر.
- جعل `serverless-http` ضمن Dependencies التشغيلية عند الحاجة.
- إضافة Health Check وLogs وError Monitoring.
- اختبار Function محلياً ثم في Preview قبل الإنتاج.

### 9. Hostinger كبديل

- توثيق متطلبات Node 22، `pnpm build`, `pnpm start`, `PORT`، Environment Variables وSSL.
- تشغيل التطبيق عبر PM2 أو Node App، وربطه بـ Reverse Proxy.
- توثيق restart policy وlogs وbackups وrollback.
- اختبار fallback الخاص بـ React Router وصيغة wildcard في Express 5.
- إبقاء Supabase Storage خيار تخزين الملفات بدلاً من filesystem المحلي.

## قائمة قبول قبل الإنتاج

- لا توجد كلمة مرور أو Service Role Key داخل Bundle العميل.
- لا يمكن تجاوز الإدارة بتعديل `sessionStorage` أو رابط مباشر.
- كل API إدارية محمية بـ `401/403` ودور واضح.
- الأسعار والكوبونات والشحن والمخزون تحسب على الخادم.
- المقاس واللون والـ SKU محفوظة في الطلب.
- الإيصال خاص ومتاح Signed URL فقط.
- الطلبات تمنع التكرار والبيع الزائد.
- توجد migrations وRLS/صلاحيات Storage واختبارات استعادة.
- يعمل `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm start`.
- تعمل SPA fallback وNetlify Functions أو Hostinger مباشرة دون 404.
- توجد سجلات تدقيق، rate limiting، CORS مقيد، health check وbackup.

## مخرجات التقرير النهائي `nonametoshare.workflow`

- ملخص تنفيذي يوضح أن المشروع Prototype محلي وليس جاهزاً لبيانات العملاء.
- جدول الملفات الحالية ووظيفة كل ملف.
- قائمة المخاطر مرتبة P0/P1/P2.
- توضيح صريح لمشكلة اسم المستخدم وكلمة المرور الحالية وكيفية إزالتها.
- مخطط قاعدة البيانات المقترح.
- خطة Supabase وStorage وRLS.
- خطة Netlify الأساسية وخطة Hostinger البديلة.
- خطة ترحيل `localStorage`.
- قائمة القبول قبل الإنتاج.
- قائمة قرارات التشغيل التي يجب اعتمادها قبل بدء التنفيذ.
