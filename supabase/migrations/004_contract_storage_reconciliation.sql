-- ============================================================================
-- 004_contract_storage_reconciliation.sql
-- PHASE 6B / Step 6B.3  --  STATUS: PREPARED -- NOT EXECUTED
-- ----------------------------------------------------------------------------
-- Represents the existing live private bucket "order-receipts" in the SQL
-- migration history (migration 002 never created it; the bucket already
-- exists in the live project). Purely idempotent and additive:
--   * does NOT drop/recreate the bucket,
--   * does NOT touch any object,
--   * deliberately adds NO storage policies for order-receipts
--     (uploads and reads are server-side via the service role only;
--      admin storefront reads use short-lived signed URLs).
--
-- EXECUTION: Supabase Dashboard -> SQL Editor (or psql/supabase CLI).
--   Run AFTER Step 6B.2A (003) and BEFORE the code switch. Safe to re-run.
--   Can also be run any time independently.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('order-receipts', 'order-receipts', false)
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- Verification:
--   select id, name, public from storage.buckets order by name;
-- Expected: ('order-receipts', 'order-receipts', false) present.
-- ============================================================================