-- ============================================================================
-- 007_atomic_order_create_function.sql
-- PHASE 7B / Step 7B.2  --  STATUS: 7B.2 (atomic order creation RPC)
-- ----------------------------------------------------------------------------
-- Creates public.create_order(jsonb): the entire order flow runs inside ONE
-- PostgreSQL transaction (order + line items + variant stock + coupon usage),
-- replacing the previous application-level compensation pattern.
--
--   * public_reference is generated INSIDE the function ('ORD-' + 40 bits),
--     never accepted from the caller.
--   * Idempotency: INSERT ... ON CONFLICT (idempotency_key) DO NOTHING.
--     A duplicate returns the stored order with zero side effects.
--   * Stock: conditional UPDATE ... WHERE stock >= quantity; failure -> 409.
--   * Coupon: re-validated inside the transaction, conditional increment,
--     then a single coupon_redemptions row (UNIQUE(coupon_id, order_id)).
--   * Arithmetic re-verification: per-line line_total == unit_price x qty,
--     SUM(line_total) == subtotal, subtotal - discount + shipping == total.
--   * SECURITY DEFINER + fixed search_path; EXECUTE granted to service_role
--     only (anon/authenticated/public cannot call it).
--
-- RAISE messages (mapped by the Node server):
--   insufficient_stock        -> 409
--   coupon_invalid            -> 422
--   coupon_usage_exceeded     -> 422
--   invalid_order_data        -> 400
--   arithmetic_mismatch       -> 400
--   order_creation_failed     -> 500 (should never happen)
--
-- EXECUTION: Supabase Dashboard -> SQL Editor. Additive; touches no data.
-- ============================================================================

-- Resistance — drops only the function definition, never data/schema.
drop function if exists public.create_order(jsonb);

create or replace function public.create_order(payload jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $function$
declare
  -- order fields
  v_customer_name    text;
  v_phone            text;
  v_address          text;
  v_notes            text;
  v_payment_method   text;
  v_payment_status   text;
  v_coupon_code      text;
  v_transfer_number  text;
  v_receipt_key      text;
  v_idempotency_key  text;

  -- money fields
  v_subtotal         numeric;
  v_discount         numeric;
  v_shipping         numeric;
  v_total            numeric;

  -- inserted order / output
  v_order_id         uuid;
  v_public_reference text;
  v_created_at       timestamptz;

  -- line items
  v_items_json          jsonb := '[]'::jsonb;
  v_item                jsonb;
  v_sum_line_totals     numeric := 0;

  -- per-item extracted/validated values
  c_product_id       uuid;
  c_variant_id       uuid;
  c_qty              int;
  c_unit             numeric;
  c_line             numeric;
  c_line_provided    numeric;
  c_name             text;
  c_sku              text;
  c_size             text;
  c_color            text;

  -- coupon
  v_coupon           record;

  -- misc / affected-row tracking
  v_stock_affected   int;
  v_coupon_affected  int;
  retry              int;
begin

  -- (1) structural validation -------------------------------------------------
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception 'invalid_order_data';
  end if;

  v_customer_name := nullif(btrim(concat(payload->>'customer_name')), '');
  v_phone         := nullif(btrim(concat(payload->>'phone')), '');
  v_address       := nullif(btrim(concat(payload->>'address')), '');
  if v_customer_name is null or v_phone is null or v_address is null then
    raise exception 'invalid_order_data';
  end if;

  v_payment_method := payload->>'payment_method';
  if v_payment_method is null or v_payment_method not in ('cod', 'wallet', 'instapay') then
    raise exception 'invalid_order_data';
  end if;
  v_payment_status := case when v_payment_method = 'cod' then 'pending' else 'submitted' end;

  if jsonb_typeof(payload->'items') <> 'array' then
    raise exception 'invalid_order_data';
  end if;
  if coalesce(jsonb_array_length(payload->'items'), 0) = 0 then
    raise exception 'invalid_order_data';
  end if;

  v_idempotency_key := nullif(concat(payload->>'idempotency_key'), '');
  v_notes           := nullif(concat(payload->>'notes'), '');
  v_coupon_code     := nullif(concat(payload->>'coupon_code'), '');
  v_transfer_number := nullif(concat(payload->>'transfer_number_snapshot'), '');
  v_receipt_key     := nullif(concat(payload->>'receipt_storage_key'), '');

  -- (2) money casts (malformed/absent -> invalid_order_data, never a raw leak) --
  begin
    v_subtotal := round((payload->>'subtotal')::numeric, 2);
    v_discount := round(coalesce((payload->>'discount_amount')::numeric, 0), 2);
    v_shipping := round(coalesce((payload->>'shipping_amount')::numeric, 0), 2);
    v_total    := round((payload->>'total')::numeric, 2);
  exception when others then
    raise exception 'invalid_order_data';
  end;
  if v_subtotal is null or v_discount is null or v_shipping is null or v_total is null
     or v_subtotal < 0 or v_discount < 0 or v_shipping < 0 or v_total < 0 then
    raise exception 'invalid_order_data';
  end if;

  -- (3) idempotent order creation ---------------------------------------------
  -- Attempted FIRST so a duplicate can return with zero side effects. The whole
  -- body is one transaction, so ANY later failure rolls this insert back.
  for retry in 1..5 loop
    v_public_reference := 'ORD-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
    begin
      insert into public.orders (
        public_reference, idempotency_key, customer_name, phone, address, notes,
        payment_method, payment_status, fulfillment_status,
        subtotal, discount_amount, shipping_amount, total,
        coupon_code, transfer_number_snapshot, receipt_storage_key
      )
      values (
        v_public_reference, v_idempotency_key, v_customer_name, v_phone, v_address, v_notes,
        v_payment_method, v_payment_status, 'new',
        v_subtotal, v_discount, v_shipping, v_total,
        v_coupon_code, v_transfer_number, v_receipt_key
      )
      on conflict (idempotency_key) do nothing
      returning id, public_reference, created_at
        into v_order_id, v_public_reference, v_created_at;
      exit;
    exception
      when unique_violation then
        -- astronomically rare collision on public_reference: retry fresh
        v_order_id := null;
        continue;
    end;
  end loop;

  if v_order_id is null then
    -- duplicate path (or exhausted retries): resolve against idempotency_key
    select o.id, o.public_reference, o.created_at,
           o.subtotal, o.discount_amount, o.shipping_amount, o.total
      into v_order_id, v_public_reference, v_created_at,
           v_subtotal, v_discount, v_shipping, v_total
      from public.orders o
     where o.idempotency_key = v_idempotency_key
     order by o.created_at asc
     limit 1;

    if v_order_id is not null then
      return jsonb_build_object(
        'ok', true,
        'duplicate', true,
        'order_id', v_order_id,
        'public_reference', v_public_reference,
        'created_at', v_created_at,
        'subtotal', v_subtotal,
        'discount_amount', v_discount,
        'shipping_amount', v_shipping,
        'total', v_total
      );
    end if;

    -- five consecutive reference collisions with no matching order: give up
    raise exception 'order_creation_failed' using errcode = '55000';
  end if;

  -- (4) line items: per-line arithmetic re-validation + conditional stock ----
  for v_item in select * from jsonb_array_elements(payload->'items') loop
    -- guarded block: malformed item values -> invalid_order_data
    begin
      c_qty              := (v_item->>'quantity')::int;
      c_unit             := round((v_item->>'unit_price')::numeric, 2);
      c_line             := round(c_unit * c_qty, 2);
      c_line_provided    := round((v_item->>'line_total')::numeric, 2);
      c_product_id       := nullif(concat(v_item->>'product_id'), '')::uuid;
      c_variant_id       := nullif(concat(v_item->>'variant_id'), '')::uuid;
      c_name             := nullif(concat(v_item->>'product_name_snapshot'), '');
      c_sku              := nullif(concat(v_item->>'sku_snapshot'), '');
      c_size             := nullif(concat(v_item->>'size_snapshot'), '');
      c_color            := nullif(concat(v_item->>'color_snapshot'), '');
    exception when others then
      raise exception 'invalid_order_data';
    end;

    -- numeric/required fields must be strictly valid (NULL comparisons are NOT truthy)
    if c_qty is null or c_qty <= 0
       or c_unit is null or c_unit < 0
       or c_line is null or c_line_provided is null
       or c_name is null or c_product_id is null then
      raise exception 'invalid_order_data';
    end if;
    -- the provided line_total must exactly equal price x quantity
    if c_line <> c_line_provided then
      raise exception 'invalid_order_data';
    end if;

    v_sum_line_totals := v_sum_line_totals + c_line;

    -- conditional, in-transaction stock decrement (variant products only)
    if c_variant_id is not null then
      update public.product_variants
         set stock = stock - c_qty,
             updated_at = now()
       where id = c_variant_id
         and stock >= c_qty;
      get diagnostics v_stock_affected := row_count;
      if v_stock_affected = 0 then
        raise exception 'insufficient_stock';
      end if;
    end if;

    v_items_json := v_items_json || jsonb_build_array(jsonb_build_object(
      'product_id', c_product_id,
      'variant_id', c_variant_id,
      'product_name_snapshot', c_name,
      'sku_snapshot', c_sku,
      'size_snapshot', c_size,
      'color_snapshot', c_color,
      'unit_price', round(c_unit, 2),
      'quantity', c_qty,
      'line_total', c_line
    ));
  end loop;

  -- (5) sum of line totals must equal the server-computed subtotal -----------
  if round(v_sum_line_totals, 2) <> round(v_subtotal, 2) then
    raise exception 'arithmetic_mismatch';
  end if;

  -- (6) insert line items ----------------------------------------------------
  insert into public.order_items (
    order_id, product_id, variant_id,
    product_name_snapshot, sku_snapshot, size_snapshot, color_snapshot,
    unit_price, quantity, line_total
  )
  select
    v_order_id, x.product_id, x.variant_id,
    x.product_name_snapshot, x.sku_snapshot, x.size_snapshot, x.color_snapshot,
    x.unit_price, x.quantity, x.line_total
  from jsonb_to_recordset(v_items_json) as x(
    product_id uuid,
    variant_id uuid,
    product_name_snapshot text,
    sku_snapshot text,
    size_snapshot text,
    color_snapshot text,
    unit_price numeric,
    quantity int,
    line_total numeric
  );

  -- (7) coupon: in-transaction re-validation + conditional increment ---------
  if v_coupon_code is not null then
    select c.id, c.code, c.max_uses, c.used_count, c.starts_at, c.ends_at, c.is_active
      into v_coupon
      from public.coupons c
     where c.code = upper(v_coupon_code)
     order by c.created_at asc
     limit 1;

    if v_coupon.id is null
       or v_coupon.is_active is not true
       or (v_coupon.ends_at is not null and v_coupon.ends_at < now())
       or (v_coupon.starts_at is not null and v_coupon.starts_at > now()) then
      raise exception 'coupon_invalid';
    end if;

    update public.coupons
       set used_count = used_count + 1
     where id = v_coupon.id
       and (v_coupon.max_uses is null or used_count < v_coupon.max_uses);
    get diagnostics v_coupon_affected := row_count;
    if v_coupon_affected = 0 then
      raise exception 'coupon_usage_exceeded';
    end if;

    insert into public.coupon_redemptions (coupon_id, order_id)
    values (v_coupon.id, v_order_id);
  end if;

  -- (8) final arithmetic reconciliation --------------------------------------
  if round(v_subtotal - v_discount + v_shipping, 2) <> round(v_total, 2) then
    raise exception 'arithmetic_mismatch';
  end if;

  -- (9) success --------------------------------------------------------------
  return jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'order_id', v_order_id,
    'public_reference', v_public_reference,
    'created_at', v_created_at,
    'subtotal', v_subtotal,
    'discount_amount', v_discount,
    'shipping_amount', v_shipping,
    'total', v_total
  );
end;
$function$;

-- (10) execution restricted to the service role only --------------------------
revoke all on function public.create_order(jsonb) from public;
revoke all on function public.create_order(jsonb) from anon;
revoke all on function public.create_order(jsonb) from authenticated;
grant execute on function public.create_order(jsonb) to service_role;

comment on function public.create_order(jsonb) is 'Atomic single-transaction order creation (orders + order_items + stock + coupon). Raises: insufficient_stock -> 409, coupon_invalid/coupon_usage_exceeded -> 422, invalid_order_data/arithmetic_mismatch -> 400, order_creation_failed -> 500.';

-- ----------------------------------------------------------------------------
-- Verification (run in SQL Editor AFTER executing this migration):
--   select p.proname, p.prosecdef, p.proconfig
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname = 'create_order';
--   select has_function_privilege('anon',            'public.create_order(jsonb)', 'execute'),
--          has_function_privilege('authenticated',   'public.create_order(jsonb)', 'execute'),
--          has_function_privilege('service_role',    'public.create_order(jsonb)', 'execute'),
--          has_function_privilege('postgres',        'public.create_order(jsonb)', 'execute');
-- ============================================================================