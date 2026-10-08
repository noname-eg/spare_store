-- ============================================================================
-- 006_contract_constraints_and_indexes.sql
-- PHASE 6B / Step 6B.5  --  STATUS: PREPARED -- NOT EXECUTED
-- ----------------------------------------------------------------------------
-- Additive hardening per the approved database contract:
--   * coupons.discount_percent within (0, 100],
--   * coupons.used_count non-negative,
--   * index on order_items(variant_id)   -- speeds up admin variant-pruning checks
--   * index on coupon_redemptions(order_id),
--   * site_settings.updated_by -> admin_users(id) ON DELETE SET NULL,
--   * optional parity timestamps on product_variants (created_at/updated_at).
--
-- EXECUTION: Supabase Dashboard -> SQL Editor (or psql/supabase CLI).
--   Additive and idempotent; safe to run at any point after 003 (or standalone).
-- ============================================================================

-- 1. coupons value-range constraints (guarded so re-runs are harmless).
do $$
begin
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.coupons'::regclass and conname = 'coupons_discount_percent_range') then
    alter table only public.coupons
      add constraint coupons_discount_percent_range
      check (discount_percent > 0 and discount_percent <= 100);
  end if;
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.coupons'::regclass and conname = 'coupons_used_count_nonneg') then
    alter table only public.coupons
      add constraint coupons_used_count_nonneg
      check (used_count >= 0);
  end if;
end $$;

-- 2. Indexes.
create index if not exists order_items_variant_idx on public.order_items (variant_id);
create index if not exists coupon_redemptions_order_idx on public.coupon_redemptions (order_id);

-- 3. site_settings.updated_by -> ON DELETE SET NULL.
--    (The FK currently exists without explicit naming from migration 002;
--     drop the default-named one, then re-create with the desired behavior.)
do $$
begin
  if exists (select 1 from pg_constraint
             where conrelid = 'public.site_settings'::regclass and contype = 'f') then
    alter table only public.site_settings
      drop constraint site_settings_updated_by_fkey;
  end if;
end $$;

alter table only public.site_settings
  add constraint site_settings_updated_by_fkey
  foreign key (updated_by) references public.admin_users (id) on delete set null;

-- 4. Optional parity timestamps on product_variants (additive; DEFAULT now()).
alter table only public.product_variants add column if not exists created_at timestamptz not null default now();
alter table only public.product_variants add column if not exists updated_at timestamptz not null default now();

-- ----------------------------------------------------------------------------
-- Verification:
--   select conname, contype, convalidated from pg_constraint
--    where conrelid in ('public.coupons'::regclass, 'public.site_settings'::regclass);
--   \di order_items_variant_idx coupon_redemptions_order_idx   (psql) or
--   select indexname from pg_indexes where tablename in ('order_items','coupon_redemptions');
--   select count(*) from public.product_variants where created_at is not null and updated_at is not null;
-- ============================================================================