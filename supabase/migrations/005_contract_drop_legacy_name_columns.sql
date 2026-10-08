-- ============================================================================
-- 005_contract_drop_legacy_name_columns.sql
-- PHASE 6B / Step 6B.4  --  STATUS: PREPARED -- NOT EXECUTED
-- ----------------------------------------------------------------------------
-- Removes the legacy English-only columns products.name_en,
-- products.description_en and categories.name_en and enforces NOT NULL on
-- products.name / categories.name.
--
-- RUN ONLY AFTER ALL OF THE FOLLOWING:
--   * 003 executed and backfill verified (with_name_nonempty == total),
--   * 004 executed,
--   * application code switched to products.name / categories.name
--     (Step 6B.2B) and verified in the live environment,
--   * no remaining code references to name_en / description_en (grep).
--
-- This script deliberately ABORTS when a precondition is missing.
-- ============================================================================

-- 0. Dependency check helpers (run these BEFORE this script and record the
--    results as EMPTY):
--    select proname from pg_proc
--      where prosrc ilike '%name_en%' or prosrc ilike '%description_en%';
--    select c.relname || '.' || a.attname
--      from pg_attribute a
--      join pg_class c on c.oid = a.attrelid
--      where a.attname in ('name_en', 'description_en');
--    select event_object_table, trigger_name from information_schema.triggers;
--    select viewname from pg_views
--      where definition ilike '%name_en%' or definition ilike '%description_en%';

-- 1. Preconditions (abort on any failure).
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'products' and column_name = 'name') then
    raise exception 'ABORT: products.name does not exist. Run migration 003 first.';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'categories' and column_name = 'name') then
    raise exception 'ABORT: categories.name does not exist. Run migration 003 first.';
  end if;
  if exists (select 1 from public.products where name is null or btrim(name) = '') then
    raise exception 'ABORT: products.name has null/empty values. Fix before dropping name_en.';
  end if;
  if exists (select 1 from public.categories where name is null or btrim(name) = '') then
    raise exception 'ABORT: categories.name has null/empty values. Fix before dropping name_en.';
  end if;
end $$;

-- 2. Enforce NOT NULL on the contract columns (description stays nullable by design).
alter table only public.products alter column name set not null;
alter table only public.categories alter column name set not null;

-- 3. Drop the legacy columns.
alter table only public.products drop column if exists name_en;
alter table only public.products drop column if exists description_en;
alter table only public.categories drop column if exists name_en;

-- ----------------------------------------------------------------------------
-- Verification:
--   select column_name from information_schema.columns
--    where table_schema='public' and table_name in ('products','categories')
--      and column_name in ('name','name_en','description_en')
--    order by 1;
-- Expected: only 'name' (+ existing Arabic/other columns); no name_en/description_en.
-- ============================================================================