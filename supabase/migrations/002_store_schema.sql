-- ============================================================
-- 002_store_schema.sql — جداول المتجر التجارية
-- نفّذها كاملة في Supabase SQL Editor (أو عبر Supabase CLI)
-- ============================================================

-- 1) الأقسام
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name_ar text not null,
  name_en text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 2) المنتجات
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name_ar text not null,
  name_en text,
  description_ar text,
  description_en text,
  category_id uuid references public.categories(id),
  original_price numeric(12,2) not null,
  sale_price numeric(12,2),
  badge text,
  image text,
  images text[] default '{}',
  video text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3) متغيرات المنتج (مقاس + لون + مخزون)
create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  size text not null,
  color text not null,
  sku text unique,
  stock integer not null default 0 check (stock >= 0),
  reserved_stock integer not null default 0 check (reserved_stock >= 0),
  unique (product_id, size, color)
);

-- 4) الطلبات
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  public_reference text unique not null,
  customer_name text not null,
  phone text not null,
  address text not null,
  notes text,
  payment_method text check (payment_method in ('cod','wallet','instapay')),
  payment_status text not null default 'pending'
    check (payment_status in ('pending','submitted','verified','rejected')),
  fulfillment_status text not null default 'new'
    check (fulfillment_status in ('new','processing','completed','cancelled')),
  subtotal numeric(12,2) not null,
  discount_amount numeric(12,2) not null default 0,
  shipping_amount numeric(12,2) not null default 0,
  total numeric(12,2) not null,
  coupon_code text,
  transfer_number_snapshot text,
  receipt_storage_key text,
  idempotency_key text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 5) بنود الطلبات
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid,
  variant_id uuid,
  product_name_snapshot text not null,
  sku_snapshot text,
  size_snapshot text,
  color_snapshot text,
  unit_price numeric(12,2) not null,
  quantity integer not null check (quantity > 0),
  line_total numeric(12,2) not null
);

-- 6) الكوبونات
create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  discount_percent numeric(5,2) not null,
  max_uses integer,
  used_count integer not null default 0,
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons(id),
  order_id uuid not null references public.orders(id),
  unique (coupon_id, order_id)
);

-- 7) إعدادات الموقع
create table if not exists public.site_settings (
  key text primary key,
  value_json jsonb not null,
  updated_by uuid references public.admin_users(id),
  updated_at timestamptz not null default now()
);

-- 8) سجل الملفات المرفوعة
create table if not exists public.uploads (
  id uuid primary key default gen_random_uuid(),
  storage_key text unique not null,
  owner_type text not null,
  owner_id uuid not null,
  mime_type text not null,
  size_bytes integer not null,
  created_at timestamptz not null default now()
);

-- 9) الفهارس
create index if not exists products_category_idx on public.products (category_id);
create index if not exists products_active_sort_idx on public.products (is_active, sort_order);
create index if not exists variants_product_idx on public.product_variants (product_id);
create index if not exists orders_created_idx on public.orders (created_at desc);
create index if not exists order_items_order_idx on public.order_items (order_id);
create index if not exists coupons_code_idx on public.coupons (code) where is_active;

-- 10) RLS (يتم الوصول عبر service_role من الخادم، RLS بلا policies تمنع الوصول المباشر للعموم)
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.coupons enable row level security;
alter table public.coupon_redemptions enable row level security;
alter table public.site_settings enable row level security;
alter table public.uploads enable row level security;

-- ============================================================
-- Bucket صور المنتجات + سياسات القراءة/الرفع
-- ============================================================
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

create policy "product-images-public-read"
  on storage.objects for select
  using (bucket_id = 'product-images');

create policy "product-images-public-insert"
  on storage.objects for insert
  with check (bucket_id = 'product-images');