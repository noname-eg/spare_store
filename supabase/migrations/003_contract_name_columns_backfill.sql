-- ============================================================================
-- 003_contract_name_columns_backfill.sql
-- PHASE 6B / Step 6B.2A  --  STATUS: PREPARED -- NOT EXECUTED
-- ----------------------------------------------------------------------------
-- Adds the contract columns products.name / products.description and
-- categories.name (nullable) and backfills them from the legacy English /
-- Arabic columns. English is the primary language (fallbacks: Arabic, then
-- placeholder). No column is dropped here; NOT NULL is NOT enforced here.
--
-- EXECUTION: Supabase Dashboard -> SQL Editor (or psql/supabase CLI).
--   Run AFTER approval for Step 6B.2A and BEFORE the application code switch.
--   Idempotent (safe to re-run).
-- ============================================================================

alter table only public.products
  add column if not exists name text,
  add column if not exists description text;

alter table only public.categories
  add column if not exists name text;

-- Backfill products.name (null-safe, trims whitespace).
update public.products p
   set name = coalesce(
         nullif(btrim(p.name_en), ''),
         nullif(btrim(p.name_ar), ''),
         'unnamed'
       )
 where p.name is null;

-- Backfill products.description from the English description (kept in sync
-- with the app default; Arabic description remains authoritative for Arabic).
update public.products p
   set description = p.description_en
 where p.description is null;

-- Backfill categories.name.
update public.categories c
   set name = coalesce(
         nullif(btrim(c.name_en), ''),
         nullif(btrim(c.name_ar), ''),
         c.slug
       )
 where c.name is null;

-- ----------------------------------------------------------------------------
-- Verification (run after successful execution, record these counts):
--   select count(*) as total,
--          count(name) as with_name,
--          count(nullif(btrim(name), '')) as with_name_nonempty
--     from public.products;
--   select count(*) as total,
--          count(nullif(btrim(name), '')) as with_name_nonempty
--     from public.categories;
--   select count(*) as total,
--          count(nullif(btrim(description), '')) as with_description_nonempty
--     from public.products;
-- Expected: with_name_nonempty equals total for both tables.
-- ============================================================================