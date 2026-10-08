# دليل النشر — No Name (DEPLOYMENT)

> يُستخدَم بعد الانتهاء من المراحل النهائية في [`PRODUCTION_PLAN.md`](./PRODUCTION_PLAN.md).
> مسار النشر الرسمي: **Supabase → GitHub → Hostinger**، مع البناء والنشر التلقائي عند كل push على الفرع `main`.

> [!IMPORTANT]
> لا يبدأ النشر النهائي إلا بعد نجاح `pnpm typecheck` و `pnpm test` و `pnpm build` محليًا.

---

## 1. الترتيب والاعتمادات

```mermaid
graph LR
  A[Supabase DB + Storage] --> B[المهاجرات 001..007]
  B --> C[GitHub Repo]
  C --> D[Hostinger Node App]
  D --> E[النطاق + SSL]
  E --> F[Production Live]
```

| الخطوة | المنصة | الغرض |
|---|---|---|
| 1 | **Supabase** | قاعدة البيانات، التخزين، سياسات RLS، متغيرات البيئة |
| 2 | **GitHub** | مستودع الكود ومصدر البناء التلقائي |
| 3 | **Hostinger** | الاستضافة النهائية (Node App + نطاق + SSL) |

---

## 2. الخطوة الأولى: Supabase

### 2.1 متغيرات البيئة

انسخ ملف المتغيرات واملأ القيم:

```bash
cp .env.example .env
```

| المتغير | القيمة | مكان الحصول |
|---|---|---|
| `SUPABASE_URL` | `https://<project-ref>.supabase.co` | Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | مفتاح `service_role` | نفس الصفحة، قسم `service_role` |

> [!CAUTION]
> `SUPABASE_SERVICE_ROLE_KEY` مفتاح سري يُضبط في الخادم فقط ولا يصل للمتصفح أبدًا. الخادم يرفض الإقلاع بدونه بدل التحوّل تلقائيًا لمفتاح `anon`.

### 2.2 تطبيق المهاجرات

من **Supabase SQL Editor** نفّذ الملفات بالترتيب من `001` إلى `007`:

| الملف | المحتوى |
|---|---|
| `001_admin_security.sql` | الأدمن، الجلسات، سجل التدقيق |
| `002_store_schema.sql` | المنتجات، الفئات، الطلبات، الكوبونات، الإعدادات |
| `003_contract_name_columns_backfill.sql` | تهيئة أعمدة أسماء المنتجات |
| `004_contract_storage_reconciliation.sql` | مواءمة التخزين |
| `005_contract_drop_legacy_name_columns.sql` | حذف الأعمدة القديمة |
| `006_contract_constraints_and_indexes.sql` | قيود وفهارس |
| `007_atomic_order_create_function.sql` | دالة `create_order` الذرّية |

تحقق سريع:

```sql
select table_name from information_schema.tables
where table_schema = 'public' order by table_name;
```

### 2.3 إنشاء أول حساب أدمن

على جهازك المحلي مع `.env` موجود:

```bash
pnpm admin:create <username>
```

يُطلب منك إدخال كلمة مرور (8 أحرف على الأقل) وتأكيدها، ثم يُدرج الحساب في `admin_users` بدور `admin` ويُسجَّل الحدث في `audit_logs`.

لإعادة تعيين كلمة مرور موجودة:

```bash
pnpm admin:reset-password
```

---

## 3. الخطوة الثانية: GitHub

### 3.1 المستودع

المستودع مربوط مباشرة بـ Hostinger، وأي push على `main` يطلق بناءً ونشرًا تلقائيًا. لذلك:

- اعمل كل التغييرات على فرع منفصل، وراجعها قبل الدمج في `main`.
- لا تُدفع مباشرة على `main` إلا بعد اجتياز الفحوص كاملة.

```bash
git checkout -b <branch-name>
# ... 작업 والمراجعة ...
git checkout main
git merge <branch-name>
git push origin main
```

### 3.2 حماية الأسرار

1. تأكد أن `.env` ضمن `.gitignore` — لا يُرفع أبدًا.
2. لا تُكتب الأسرار في ملفات أو تعليقات أو رسائل commit.
3. متغيرات البيئة تُضبط في لوحة Hostinger، ولا تُحفظ في المستودع.

### 3.3 حماية الفرع (اختياري)

فعّل حماية فرع `main` بحيث لا يتم الدفع المباشر إلا عبر Pull Request مع نجاح الفحوص.

---

## 4. الخطوة الثالثة: Hostinger

### 4.1 إعداد Node App

من لوحة Hostinger → **Websites → Node.js → Setup Node.js App**:

| الحقل | القيمة |
|---|---|
| Node version | `22` |
| Build command | `pnpm run build` |
| Output directory | `dist/spa` |
| Application root | جذر المستودع |
| Application startup file | `dist/server/node-build.mjs` |

> إعدادات البناء موجودة أيضًا في `builder.config.json` في جذر المستودع ويجب أن تطابق ما هو مضبوط في اللوحة.

### 4.2 متغيرات البيئة على الخادم

أضف المتغيرات التالية في إعدادات الـNode App (وليس في المستودع):

| المفتاح | القيمة |
|---|---|
| `SUPABASE_URL` | رابط مشروع Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | مفتاح `service_role` |
| `APP_ORIGIN` | النطاق النهائي، مثل `https://www.nonameeg.com` |
| `NODE_ENV` | `production` |
| `PORT` | البورت المخصص للـNode App |

> [!IMPORTANT]
> أي تعديل على المتغيرات يحتاج إعادة تشغيل التطبيق من اللوحة حتى تُقرأ من الخادم.

### 4.3 النطاق و SSL

- فعّل **SSL** (Let's Encrypt) من لوحة Hostinger لتحويل كل الصفحات إلى `https://`.
- اجعل `APP_ORIGIN` مطابقًا للنطاق النهائي، لأن CORS مبني عليه.

### 4.4 التحقق بعد النشر

```bash
curl -i https://www.nonameeg.com/api/ping
```

المتوقع: `200` مع استجابة JSON من نقطة الفحص. إذا رجعت `5xx`، راجع سجل التطبيق (Application/Runtime logs) في لوحة Hostinger — سجل النشر (Deployment logs) يعرض البناء فقط وليس أخطاء التشغيل.

---

## 5. قائمة الفحص قبل النشر

- [ ] `.env` غير مضمَّن في أي commit (Git-ignored)
- [ ] `SUPABASE_SERVICE_ROLE_KEY` غير موجود على العميل ولا في أي `VITE_*`
- [ ] المهاجرات `001..007` منفذة على Supabase الحقيقي
- [ ] تم إنشاء حساب الأدمن الأول (`pnpm admin:create`)
- [ ] `pnpm typecheck` خضراء
- [ ] `pnpm test` خضراء بالكامل
- [ ] `pnpm build` خضراء
- [ ] CORS يسمح فقط بـ `APP_ORIGIN` (لا `*` مع credentials)
- [ ] SSL مفعّل و `APP_ORIGIN` يطابق النطاق النهائي
- [ ] `/api/ping` يرجع `200` بعد النشر

---

## 6. المراجع

- نظرة عامة وتقنيات المشروع: [`README.md`](./README.md)
- خطة الإنتاج ومراحل التنفيذ: [`PRODUCTION_PLAN.md`](./PRODUCTION_PLAN.md)
