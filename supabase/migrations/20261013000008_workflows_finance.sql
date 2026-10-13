-- =============================================================================
-- Financial workflows, subscriptions, notification queue, search and reports
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Payment creation (client-initiated, amount always from the database)
-- ---------------------------------------------------------------------------
create or replace function public.create_payment(
  p_payable_type public.payable_type, p_payable_id uuid, p_provider text, p_provider_mode text, p_idempotency_key text
)
returns public.payments language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := app.require_user();
  v_amount bigint;
  v_lawyer uuid;
  v_firm uuid;
  v_existing public.payments%rowtype;
  v_row public.payments%rowtype;
begin
  if p_provider !~ '^[a-z_]{2,30}$' or p_provider_mode not in ('live', 'test', 'sandbox') then
    raise exception 'Invalid provider' using errcode = '22023';
  end if;
  if char_length(coalesce(p_idempotency_key, '')) < 16 then
    raise exception 'Idempotency key required' using errcode = '22023';
  end if;
  select * into v_existing from public.payments where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.payer_id <> v_uid then
      raise exception 'Idempotency key conflict' using errcode = '42501';
    end if;
    return v_existing;
  end if;

  if p_payable_type = 'appointment' then
    select a.price_minor, a.lawyer_id, a.firm_id into v_amount, v_lawyer, v_firm
      from public.appointments a
     where a.id = p_payable_id and a.client_id = v_uid and a.status = 'PENDING_PAYMENT' and a.hold_expires_at > now();
    if v_amount is null then
      raise exception 'This booking can no longer be paid; please choose a new slot' using errcode = 'P0001', hint = 'hold_expired';
    end if;
    select * into v_existing from public.payments
     where appointment_id = p_payable_id and status in ('initiated', 'pending') and provider = p_provider
     order by created_at desc limit 1;
  elsif p_payable_type = 'service_order' then
    select o.price_minor, o.lawyer_id, o.firm_id into v_amount, v_lawyer, v_firm
      from public.service_orders o where o.id = p_payable_id and o.client_id = v_uid and o.status = 'PENDING_PAYMENT';
    if v_amount is null then
      raise exception 'Order is not awaiting payment' using errcode = '22023';
    end if;
    select * into v_existing from public.payments
     where service_order_id = p_payable_id and status in ('initiated', 'pending') and provider = p_provider
     order by created_at desc limit 1;
  elsif p_payable_type = 'subscription' then
    select case when s.billing_cycle = 'yearly' then p.price_yearly_minor else p.price_monthly_minor end
      into v_amount
      from public.subscriptions s join public.subscription_plans p on p.id = s.plan_id
     where s.id = p_payable_id and s.status in ('incomplete', 'past_due', 'trialing')
       and (s.lawyer_id = v_uid or (s.firm_id is not null and app.is_firm_owner(s.firm_id)));
    if v_amount is null then
      raise exception 'Subscription is not awaiting payment' using errcode = '22023';
    end if;
    select * into v_existing from public.payments
     where subscription_id = p_payable_id and status in ('initiated', 'pending') and provider = p_provider
     order by created_at desc limit 1;
  elsif p_payable_type = 'invoice' then
    select i.total_minor, i.issuer_lawyer_id, i.issuer_firm_id into v_amount, v_lawyer, v_firm
      from public.invoices i where i.id = p_payable_id and i.bill_to_user_id = v_uid and i.status = 'issued';
    if v_amount is null then
      raise exception 'Invoice is not payable' using errcode = '22023';
    end if;
    select * into v_existing from public.payments
     where invoice_id = p_payable_id and status in ('initiated', 'pending') and provider = p_provider
     order by created_at desc limit 1;
  end if;

  if v_existing.id is not null then
    return v_existing;
  end if;
  if v_amount <= 0 then
    raise exception 'Nothing to pay' using errcode = '22023';
  end if;

  insert into public.payments (payer_id, payable_type, appointment_id, service_order_id, subscription_id, invoice_id,
                               beneficiary_lawyer_id, beneficiary_firm_id, amount_minor, provider, provider_mode, idempotency_key)
  values (v_uid, p_payable_type,
          case when p_payable_type = 'appointment' then p_payable_id end,
          case when p_payable_type = 'service_order' then p_payable_id end,
          case when p_payable_type = 'subscription' then p_payable_id end,
          case when p_payable_type = 'invoice' then p_payable_id end,
          case when v_firm is null then v_lawyer end, v_firm, v_amount, p_provider, p_provider_mode, p_idempotency_key)
  returning * into v_row;
  return v_row;
end $$;

-- Service role: store the gateway's order id after creating the checkout session.
create or replace function public.attach_provider_order(p_payment_id uuid, p_provider_order_id text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.payments set provider_order_id = p_provider_order_id, status = 'pending'
   where id = p_payment_id and status in ('initiated', 'pending');
  if not found then
    raise exception 'Payment not in a payable state' using errcode = '22023';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Ledger helpers
-- ---------------------------------------------------------------------------
create or replace function app.ledger(
  p_txn uuid, p_type text, p_account text, p_debit bigint, p_credit bigint, p_payment uuid, p_refund uuid,
  p_settlement uuid, p_lawyer uuid, p_firm uuid, p_memo text
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(p_debit, 0) = 0 and coalesce(p_credit, 0) = 0 then
    return;
  end if;
  insert into public.financial_ledger_entries (txn_id, entry_type, account, debit_minor, credit_minor, payment_id, refund_id,
                                               settlement_id, beneficiary_lawyer_id, beneficiary_firm_id, memo)
  values (p_txn, p_type, p_account, coalesce(p_debit, 0), coalesce(p_credit, 0), p_payment, p_refund, p_settlement,
          case when p_account = 'beneficiary_payable' then p_lawyer end,
          case when p_account = 'beneficiary_payable' then p_firm end, p_memo);
end $$;

-- ---------------------------------------------------------------------------
-- Payment result — the ONLY way a payment becomes successful. Service role only.
-- Idempotent on (provider, provider_event_id). Returns a processing outcome.
-- ---------------------------------------------------------------------------
create or replace function public.record_payment_result(
  p_provider text,
  p_event_id text,
  p_payment_ref text,               -- our payment id (uuid text) or reference
  p_provider_order_id text,
  p_transaction_id text,
  p_success boolean,
  p_amount_minor bigint,
  p_currency text,
  p_gateway_fee_minor bigint,
  p_signature_valid boolean,
  p_payload jsonb
)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_event_id bigint;
  v_p public.payments%rowtype;
  v_rule public.commission_rules%rowtype;
  v_commission bigint;
  v_fee bigint;
  v_fee_bearer text := app.setting('payments', 'gateway_fee_bearer', 'platform');
  v_fee_b bigint;
  v_net bigint;
  v_txn uuid := gen_random_uuid();
  v_service uuid;
  v_appt public.appointments%rowtype;
  v_result text;
  v_sub public.subscriptions%rowtype;
  v_cycle interval;
begin
  insert into public.payment_events (provider, provider_event_id, event_type, signature_valid, payload)
  values (p_provider, p_event_id, case when p_success then 'transaction.succeeded' else 'transaction.failed' end,
          p_signature_valid, coalesce(p_payload, '{}'))
  on conflict (provider, provider_event_id) do nothing
  returning id into v_event_id;
  if v_event_id is null then
    return 'duplicate';
  end if;
  if not p_signature_valid then
    return 'invalid_signature';
  end if;

  select * into v_p from public.payments
   where provider = p_provider
     and ((p_payment_ref is not null and (id::text = p_payment_ref or reference = p_payment_ref))
          or (p_provider_order_id is not null and provider_order_id = p_provider_order_id))
   for update;
  if not found then
    return 'unknown_payment';
  end if;
  -- payment_events is append-only; link it by inserting the outcome context in the result instead.

  if v_p.status in ('succeeded', 'refunded', 'partially_refunded') then
    return 'already_captured';
  end if;

  if not p_success then
    update public.payments set status = 'failed', failure_reason = left(coalesce(p_payload ->> 'failure_reason', 'declined'), 200),
           provider_transaction_id = coalesce(p_transaction_id, provider_transaction_id)
     where id = v_p.id;
    perform app.notify(v_p.payer_id, 'payment.failed', jsonb_build_object('reference', v_p.reference), '/client/payments', 'pay-failed:' || v_p.id || ':' || p_event_id);
    return 'failed';
  end if;

  if p_amount_minor is distinct from v_p.amount_minor or upper(coalesce(p_currency, 'EGP')) <> v_p.currency then
    update public.payments set status = 'failed', failure_reason = 'amount_mismatch' where id = v_p.id;
    perform app.audit('payment.amount_mismatch', 'payment', v_p.id::text,
                      jsonb_build_object('expected', v_p.amount_minor, 'received', p_amount_minor, 'currency', p_currency));
    return 'amount_mismatch';
  end if;

  -- Commission snapshot.
  if v_p.payable_type = 'subscription' then
    v_commission := v_p.amount_minor;  -- subscriptions are platform revenue
    v_rule := null;
  else
    v_service := (select service_id from public.service_orders where id = v_p.service_order_id);
    v_rule := app.resolve_commission_rule(v_p.payable_type, v_p.beneficiary_lawyer_id, v_p.beneficiary_firm_id, v_service, now());
    if v_p.beneficiary_lawyer_id is null and v_p.beneficiary_firm_id is not null and v_rule.id is null then
      v_rule := app.resolve_commission_rule(v_p.payable_type, null, v_p.beneficiary_firm_id, v_service, now());
    end if;
    v_commission := app.compute_commission_minor(v_p.amount_minor, coalesce(v_rule.rate_bps, 0), coalesce(v_rule.fixed_minor, 0));
  end if;
  v_fee := greatest(0, coalesce(p_gateway_fee_minor, 0));
  v_fee_b := case when v_p.payable_type <> 'subscription' and v_fee_bearer = 'beneficiary' then least(v_fee, v_p.amount_minor - v_commission) else 0 end;
  v_net := case when v_p.payable_type = 'subscription' then 0 else v_p.amount_minor - v_commission - v_fee_b end;

  update public.payments set status = 'succeeded', paid_at = now(), provider_transaction_id = p_transaction_id,
         provider_order_id = coalesce(provider_order_id, p_provider_order_id),
         commission_rule_id = v_rule.id, commission_rate_bps = coalesce(v_rule.rate_bps, case when v_p.payable_type = 'subscription' then 10000 else 0 end),
         commission_minor = v_commission, gateway_fee_minor = v_fee, net_minor = v_net
   where id = v_p.id;

  -- Double-entry ledger.
  perform app.ledger(v_txn, 'payment_captured', 'gateway_clearing', v_p.amount_minor - v_fee, 0, v_p.id, null, null, null, null, v_p.reference);
  perform app.ledger(v_txn, 'payment_captured', 'gateway_fees', v_fee, 0, v_p.id, null, null, null, null, 'gateway fee');
  if v_p.payable_type = 'subscription' then
    perform app.ledger(v_txn, 'payment_captured', 'subscription_revenue', 0, v_p.amount_minor, v_p.id, null, null, null, null, 'subscription');
  else
    perform app.ledger(v_txn, 'payment_captured', 'platform_revenue', 0, v_commission, v_p.id, null, null, null, null, 'commission');
    perform app.ledger(v_txn, 'payment_captured', 'beneficiary_payable', 0, v_net, v_p.id, null, null,
                       v_p.beneficiary_lawyer_id, v_p.beneficiary_firm_id, 'net payable');
    perform app.ledger(v_txn, 'payment_captured', 'gateway_fee_recovery', 0, v_fee_b, v_p.id, null, null, null, null, 'fee recovered from beneficiary');
  end if;

  -- Invoice / receipt.
  if v_p.payable_type <> 'invoice' then
    insert into public.invoices (issuer_lawyer_id, issuer_firm_id, issued_by_platform, bill_to_user_id, bill_to_name, status,
                                 line_items, subtotal_minor, tax_minor, total_minor, issued_at, paid_at, payment_id)
    values (v_p.beneficiary_lawyer_id, v_p.beneficiary_firm_id, v_p.payable_type = 'subscription', v_p.payer_id,
            coalesce((select full_name from public.profiles where id = v_p.payer_id), ''), 'paid',
            jsonb_build_array(jsonb_build_object('description', v_p.payable_type::text, 'reference', v_p.reference,
                                                 'quantity', 1, 'unit_minor', v_p.amount_minor)),
            v_p.amount_minor, 0, v_p.amount_minor, now(), now(), v_p.id);
  else
    update public.invoices set status = 'paid', paid_at = now() where id = v_p.invoice_id;
  end if;

  v_result := 'captured';
  -- Fulfil the payable.
  if v_p.payable_type = 'appointment' then
    select * into v_appt from public.appointments where id = v_p.appointment_id for update;
    if v_appt.status in ('PENDING_PAYMENT', 'EXPIRED') then
      begin
        update public.appointments
           set status = case when (select auto_confirm from public.lawyer_profiles where id = v_appt.lawyer_id)
                             then 'CONFIRMED'::public.appointment_status else 'PENDING_CONFIRMATION'::public.appointment_status end,
               confirmed_at = case when (select auto_confirm from public.lawyer_profiles where id = v_appt.lawyer_id) then now() end,
               hold_expires_at = null
         where id = v_appt.id
           and (v_appt.status = 'PENDING_PAYMENT' or v_appt.starts_at > now() or not v_appt.occupies_slot);
        if not found then
          raise exclusion_violation;
        end if;
        perform app.log_appointment_event(v_appt.id, 'payment_captured', v_appt.status,
                                          (select status from public.appointments where id = v_appt.id), jsonb_build_object('payment_id', v_p.id));
        perform app.on_appointment_booked(v_appt.id);
      exception when exclusion_violation then
        -- Late payment for a slot that is gone: refund in full automatically.
        perform app.create_refund(v_p.id, v_p.amount_minor, 'slot_no_longer_available', null, '{"auto":true}');
        v_result := 'captured_refund_required';
      end;
    else
      -- Appointment was cancelled while payment was in flight.
      perform app.create_refund(v_p.id, v_p.amount_minor, 'appointment_' || lower(v_appt.status::text), null, '{"auto":true}');
      v_result := 'captured_refund_required';
    end if;
  elsif v_p.payable_type = 'service_order' then
    if exists (select 1 from public.service_orders where id = v_p.service_order_id and status = 'PENDING_PAYMENT') then
      update public.service_orders set status = 'PAID' where id = v_p.service_order_id;
      perform app.notify(v_p.beneficiary_lawyer_id, 'service_order.created',
                         jsonb_build_object('reference', (select reference from public.service_orders where id = v_p.service_order_id)),
                         '/lawyer/orders/' || v_p.service_order_id, 'order-paid:' || v_p.service_order_id);
    else
      perform app.create_refund(v_p.id, v_p.amount_minor, 'order_not_payable', null, '{"auto":true}');
      v_result := 'captured_refund_required';
    end if;
  elsif v_p.payable_type = 'subscription' then
    select * into v_sub from public.subscriptions where id = v_p.subscription_id for update;
    v_cycle := case when v_sub.billing_cycle = 'yearly' then interval '1 year' else interval '1 month' end;
    -- Switching plans: end any other live subscription of the same subscriber.
    update public.subscriptions set status = 'cancelled', cancelled_at = now()
     where id <> v_sub.id and status in ('trialing', 'active', 'past_due')
       and ((v_sub.lawyer_id is not null and lawyer_id = v_sub.lawyer_id) or (v_sub.firm_id is not null and firm_id = v_sub.firm_id));
    update public.subscriptions
       set status = 'active',
           current_period_start = case when status = 'past_due' then current_period_end else now() end,
           current_period_end = case when status = 'past_due' then current_period_end + v_cycle else now() + v_cycle end,
           cancel_at_period_end = false
     where id = v_sub.id;
    insert into public.subscription_events (subscription_id, event_type, details)
    values (v_sub.id, 'payment_succeeded', jsonb_build_object('payment_id', v_p.id));
    perform app.notify(v_p.payer_id, 'subscription.activated', '{}', '/lawyer/subscription', 'sub-paid:' || v_p.id);
  end if;

  perform app.notify(v_p.payer_id, 'payment.succeeded',
                     jsonb_build_object('reference', v_p.reference, 'amount', to_char(v_p.amount_minor / 100.0, 'FM999G999G990D00')),
                     '/client/payments', 'pay-ok:' || v_p.id);
  return v_result;
end $$;

-- Payer abandons checkout / gateway reports cancellation.
create or replace function public.cancel_pending_payment(p_payment_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.payments set status = 'cancelled'
   where id = p_payment_id and payer_id = auth.uid() and status in ('initiated', 'pending');
end $$;

-- ---------------------------------------------------------------------------
-- Refunds
-- ---------------------------------------------------------------------------
create or replace function app.create_refund(p_payment_id uuid, p_amount bigint, p_reason text, p_actor uuid, p_policy jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_p public.payments%rowtype;
  v_pending bigint;
  v_id uuid;
  v_amount bigint;
begin
  select * into v_p from public.payments where id = p_payment_id for update;
  if not found or v_p.status not in ('succeeded', 'partially_refunded') then
    return null;
  end if;
  select coalesce(sum(amount_minor), 0) into v_pending from public.refunds
   where payment_id = p_payment_id and status in ('requested', 'approved', 'processing');
  v_amount := least(p_amount, v_p.amount_minor - v_p.refunded_minor - v_pending);
  if v_amount <= 0 then
    return null;
  end if;
  insert into public.refunds (payment_id, amount_minor, reason, status, policy_snapshot, requested_by, approved_by, idempotency_key)
  values (p_payment_id, v_amount, p_reason, 'approved', coalesce(p_policy, '{}'), p_actor, p_actor,
          'refund:' || p_payment_id || ':' || gen_random_uuid())
  returning id into v_id;
  return v_id;
end $$;

create or replace function app.refund_appointment_payment(p_appointment_id uuid, p_percent int, p_reason text, p_actor uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_p public.payments%rowtype;
begin
  if coalesce(p_percent, 0) <= 0 then
    return null;
  end if;
  select * into v_p from public.payments
   where appointment_id = p_appointment_id and status in ('succeeded', 'partially_refunded')
   order by paid_at desc limit 1;
  if not found then
    return null;
  end if;
  return app.create_refund(v_p.id, (v_p.amount_minor * least(p_percent, 100)) / 100, p_reason, p_actor,
                           jsonb_build_object('percent', p_percent));
end $$;

create or replace function app.refund_service_order_payment(p_order_id uuid, p_percent int, p_reason text, p_actor uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_p public.payments%rowtype;
begin
  if coalesce(p_percent, 0) <= 0 then
    return null;
  end if;
  select * into v_p from public.payments
   where service_order_id = p_order_id and status in ('succeeded', 'partially_refunded')
   order by paid_at desc limit 1;
  if not found then
    return null;
  end if;
  return app.create_refund(v_p.id, (v_p.amount_minor * least(p_percent, 100)) / 100, p_reason, p_actor,
                           jsonb_build_object('percent', p_percent));
end $$;

create or replace function public.admin_create_refund(p_payment_id uuid, p_amount_minor bigint, p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform app.require_user();
  if not app.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if coalesce(trim(p_reason), '') = '' or p_amount_minor <= 0 then
    raise exception 'Amount and reason are required' using errcode = '22023';
  end if;
  v_id := app.create_refund(p_payment_id, p_amount_minor, p_reason, auth.uid(), '{"manual":true}');
  if v_id is null then
    raise exception 'Nothing refundable on this payment' using errcode = '22023';
  end if;
  return v_id;
end $$;

-- Worker (service role): claim approved refunds for processing with the provider.
create or replace function public.claim_refunds(p_limit int default 10)
returns setof public.refunds language sql security definer set search_path = '' as $$
  update public.refunds r set status = 'processing', attempts = attempts + 1
   where r.id in (select id from public.refunds
                   where status = 'approved' or (status = 'failed' and attempts < 5 and updated_at < now() - interval '10 minutes')
                   order by created_at limit p_limit for update skip locked)
  returning r.*;
$$;

-- Worker (service role): apply the provider's refund result.
create or replace function public.complete_refund(p_refund_id uuid, p_success boolean, p_provider_refund_id text, p_error text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_r public.refunds%rowtype;
  v_p public.payments%rowtype;
  v_txn uuid := gen_random_uuid();
  v_benef_part bigint;
  v_total_refunded bigint;
begin
  select * into v_r from public.refunds where id = p_refund_id for update;
  if not found or v_r.status = 'succeeded' then
    return;
  end if;
  if not p_success then
    update public.refunds set status = 'failed', failure_reason = left(p_error, 500) where id = p_refund_id;
    return;
  end if;
  select * into v_p from public.payments where id = v_r.payment_id for update;
  update public.refunds set status = 'succeeded', provider_refund_id = p_provider_refund_id, processed_at = now(), failure_reason = null
   where id = p_refund_id;
  v_total_refunded := v_p.refunded_minor + v_r.amount_minor;
  update public.payments set refunded_minor = v_total_refunded,
         status = case when v_total_refunded >= amount_minor then 'refunded'::public.payment_status else 'partially_refunded'::public.payment_status end
   where id = v_p.id;

  -- Reverse proportionally: beneficiary share first, remainder from platform revenue.
  if v_p.payable_type = 'subscription' then
    perform app.ledger(v_txn, 'refund', 'subscription_revenue', v_r.amount_minor, 0, v_p.id, v_r.id, null, null, null, v_r.reason);
  else
    v_benef_part := (v_r.amount_minor * coalesce(v_p.net_minor, 0)) / v_p.amount_minor;
    perform app.ledger(v_txn, 'refund', 'beneficiary_payable', v_benef_part, 0, v_p.id, v_r.id, null,
                       v_p.beneficiary_lawyer_id, v_p.beneficiary_firm_id, v_r.reason);
    perform app.ledger(v_txn, 'refund', 'platform_revenue', v_r.amount_minor - v_benef_part, 0, v_p.id, v_r.id, null, null, null, v_r.reason);
  end if;
  perform app.ledger(v_txn, 'refund', 'gateway_clearing', 0, v_r.amount_minor, v_p.id, v_r.id, null, null, null, v_r.reason);

  if v_total_refunded >= v_p.amount_minor then
    if v_p.appointment_id is not null then
      update public.appointments set status = 'REFUNDED'
       where id = v_p.appointment_id and status in ('CANCELLED', 'EXPIRED', 'NO_SHOW', 'DISPUTED');
    elsif v_p.service_order_id is not null then
      update public.service_orders set status = 'REFUNDED' where id = v_p.service_order_id and status in ('CANCELLED', 'DISPUTED');
    end if;
  end if;
  perform app.notify(v_p.payer_id, 'refund.processed',
                     jsonb_build_object('reference', v_p.reference, 'amount', to_char(v_r.amount_minor / 100.0, 'FM999G999G990D00')),
                     '/client/payments', 'refund:' || v_r.id);
end $$;

-- ---------------------------------------------------------------------------
-- Settlements and payouts
-- ---------------------------------------------------------------------------
create or replace function public.request_payout(p_amount_minor bigint, p_firm_id uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := app.require_user();
  v_balance bigint;
  v_pending bigint;
  v_id uuid;
  v_min bigint := app.setting('payments', 'min_payout_minor', '50000')::bigint;
begin
  if p_firm_id is not null then
    if not app.is_firm_owner(p_firm_id) then
      raise exception 'Only the firm owner can request payouts' using errcode = '42501';
    end if;
    v_balance := app.beneficiary_balance_minor(null, p_firm_id);
    select coalesce(sum(amount_minor), 0) into v_pending from public.payout_requests where firm_id = p_firm_id and status in ('requested', 'approved');
  else
    if not app.has_role('lawyer') then
      raise exception 'Lawyer account required' using errcode = '42501';
    end if;
    v_balance := app.beneficiary_balance_minor(v_uid, null);
    select coalesce(sum(amount_minor), 0) into v_pending from public.payout_requests where lawyer_id = v_uid and status in ('requested', 'approved');
  end if;
  if p_amount_minor < v_min then
    raise exception 'Minimum payout is % EGP', v_min / 100 using errcode = '22023', hint = 'below_minimum';
  end if;
  if p_amount_minor > v_balance - v_pending then
    raise exception 'Amount exceeds available balance' using errcode = '22023', hint = 'insufficient_balance';
  end if;
  if not exists (select 1 from public.settlement_accounts where (lawyer_id = v_uid and p_firm_id is null) or firm_id = p_firm_id) then
    raise exception 'Add a settlement account first' using errcode = '22023', hint = 'no_account';
  end if;
  insert into public.payout_requests (lawyer_id, firm_id, amount_minor, requested_by)
  values (case when p_firm_id is null then v_uid end, p_firm_id, p_amount_minor, v_uid) returning id into v_id;
  return v_id;
end $$;

create or replace function public.admin_create_settlement(p_lawyer_id uuid, p_firm_id uuid, p_period_start date, p_period_end date, p_payout_request_id uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_gross bigint;
  v_comm bigint;
  v_fee bigint;
  v_refunds bigint;
  v_net bigint;
  v_account uuid;
begin
  perform app.require_user();
  if not app.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if num_nonnulls(p_lawyer_id, p_firm_id) <> 1 then
    raise exception 'Specify a lawyer or a firm' using errcode = '22023';
  end if;
  select coalesce(sum(amount_minor), 0), coalesce(sum(commission_minor), 0), coalesce(sum(gateway_fee_minor), 0)
    into v_gross, v_comm, v_fee
    from public.payments
   where status in ('succeeded', 'partially_refunded', 'refunded') and payable_type <> 'subscription'
     and ((p_lawyer_id is not null and beneficiary_lawyer_id = p_lawyer_id) or (p_firm_id is not null and beneficiary_firm_id = p_firm_id))
     and (paid_at at time zone 'Africa/Cairo')::date between p_period_start and p_period_end;
  select coalesce(sum(r.amount_minor), 0) into v_refunds
    from public.refunds r join public.payments p on p.id = r.payment_id
   where r.status = 'succeeded'
     and ((p_lawyer_id is not null and p.beneficiary_lawyer_id = p_lawyer_id) or (p_firm_id is not null and p.beneficiary_firm_id = p_firm_id))
     and (r.processed_at at time zone 'Africa/Cairo')::date between p_period_start and p_period_end;
  -- What is actually owed comes from the ledger, never from recomputation.
  v_net := greatest(0, app.beneficiary_balance_minor(p_lawyer_id, p_firm_id)
           - coalesce((select sum(net_minor) from public.settlements
                        where status in ('pending', 'processing')
                          and ((p_lawyer_id is not null and beneficiary_lawyer_id = p_lawyer_id) or (p_firm_id is not null and beneficiary_firm_id = p_firm_id))), 0));
  if p_payout_request_id is not null then
    v_net := least(v_net, (select amount_minor from public.payout_requests where id = p_payout_request_id and status = 'requested'));
  end if;
  if coalesce(v_net, 0) <= 0 then
    raise exception 'No payable balance' using errcode = '22023';
  end if;
  select id into v_account from public.settlement_accounts
   where (lawyer_id = p_lawyer_id or firm_id = p_firm_id) order by is_default desc, created_at limit 1;
  insert into public.settlements (beneficiary_lawyer_id, beneficiary_firm_id, settlement_account_id, period_start, period_end,
                                  gross_minor, commission_minor, gateway_fee_minor, refund_adjustments_minor, net_minor, created_by)
  values (p_lawyer_id, p_firm_id, v_account, p_period_start, p_period_end, v_gross, v_comm, v_fee, v_refunds, v_net, auth.uid())
  returning id into v_id;
  if p_payout_request_id is not null then
    update public.payout_requests set status = 'approved', settlement_id = v_id, reviewed_by = auth.uid() where id = p_payout_request_id;
  end if;
  return v_id;
end $$;

create or replace function public.admin_mark_settlement_paid(p_settlement_id uuid, p_reference text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_s public.settlements%rowtype;
  v_txn uuid := gen_random_uuid();
begin
  perform app.require_user();
  if not app.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  select * into v_s from public.settlements where id = p_settlement_id for update;
  if not found or v_s.status not in ('pending', 'processing') then
    raise exception 'Settlement is not payable' using errcode = '22023';
  end if;
  if coalesce(trim(p_reference), '') = '' then
    raise exception 'A transfer reference is required' using errcode = '22023';
  end if;
  if v_s.net_minor > app.beneficiary_balance_minor(v_s.beneficiary_lawyer_id, v_s.beneficiary_firm_id) then
    raise exception 'Balance changed since the settlement was prepared (refunds); recreate it' using errcode = '22023';
  end if;
  update public.settlements set status = 'paid', paid_at = now(), reference = p_reference where id = p_settlement_id;
  perform app.ledger(v_txn, 'settlement_payout', 'beneficiary_payable', v_s.net_minor, 0, null, null, v_s.id,
                     v_s.beneficiary_lawyer_id, v_s.beneficiary_firm_id, p_reference);
  perform app.ledger(v_txn, 'settlement_payout', 'settlement_payouts', 0, v_s.net_minor, null, null, v_s.id, null, null, p_reference);
  update public.payout_requests set status = 'paid' where settlement_id = p_settlement_id;
  perform app.notify(coalesce(v_s.beneficiary_lawyer_id, (select owner_id from public.law_firms where id = v_s.beneficiary_firm_id)),
                     'settlement.paid', jsonb_build_object('amount', to_char(v_s.net_minor / 100.0, 'FM999G999G990D00'), 'reference', p_reference),
                     '/lawyer/finance', 'settlement:' || v_s.id);
end $$;

-- ---------------------------------------------------------------------------
-- Subscriptions
-- ---------------------------------------------------------------------------
create or replace function public.start_subscription(p_plan_code text, p_billing_cycle text, p_firm_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := app.require_user();
  v_plan public.subscription_plans%rowtype;
  v_price bigint;
  v_id uuid;
  v_status public.subscription_status;
  v_had_trial boolean;
  v_cycle interval := case when p_billing_cycle = 'yearly' then interval '1 year' else interval '1 month' end;
begin
  if p_billing_cycle not in ('monthly', 'yearly') then
    raise exception 'Invalid billing cycle' using errcode = '22023';
  end if;
  select * into v_plan from public.subscription_plans where code = p_plan_code and is_active;
  if not found then
    raise exception 'Plan not available' using errcode = '22023';
  end if;
  if p_firm_id is not null then
    if v_plan.audience <> 'firm' or not app.is_firm_owner(p_firm_id) then
      raise exception 'Not allowed' using errcode = '42501';
    end if;
  elsif v_plan.audience <> 'lawyer' or not app.has_role('lawyer') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  v_price := case when p_billing_cycle = 'yearly' then v_plan.price_yearly_minor else v_plan.price_monthly_minor end;
  select exists (select 1 from public.subscriptions where (lawyer_id = v_uid and p_firm_id is null) or firm_id = p_firm_id) into v_had_trial;

  -- Abandon earlier incomplete checkouts.
  update public.subscriptions set status = 'expired'
   where status = 'incomplete' and ((p_firm_id is null and lawyer_id = v_uid) or firm_id = p_firm_id);

  if v_price = 0 then
    v_status := 'active';
  elsif v_plan.trial_days > 0 and not v_had_trial then
    v_status := 'trialing';
  else
    v_status := 'incomplete';
  end if;

  if v_status in ('active', 'trialing') then
    update public.subscriptions set status = 'cancelled', cancelled_at = now()
     where status in ('trialing', 'active', 'past_due') and ((p_firm_id is null and lawyer_id = v_uid) or firm_id = p_firm_id);
  end if;

  insert into public.subscriptions (plan_id, lawyer_id, firm_id, status, billing_cycle, current_period_start, current_period_end, trial_ends_at, created_by)
  values (v_plan.id, case when p_firm_id is null then v_uid end, p_firm_id, v_status, p_billing_cycle, now(),
          case when v_status = 'trialing' then now() + make_interval(days => v_plan.trial_days) else now() + v_cycle end,
          case when v_status = 'trialing' then now() + make_interval(days => v_plan.trial_days) end, v_uid)
  returning id into v_id;
  insert into public.subscription_events (subscription_id, event_type, actor_id, details)
  values (v_id, 'created', v_uid, jsonb_build_object('plan', p_plan_code, 'status', v_status));
  return jsonb_build_object('subscription_id', v_id, 'status', v_status, 'requires_payment', v_status = 'incomplete');
end $$;

create or replace function public.cancel_subscription(p_subscription_id uuid, p_immediately boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_s public.subscriptions%rowtype;
begin
  perform app.require_user();
  select * into v_s from public.subscriptions where id = p_subscription_id for update;
  if not found or not (v_s.lawyer_id = auth.uid() or (v_s.firm_id is not null and app.is_firm_owner(v_s.firm_id)) or app.is_admin()) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_immediately or v_s.status in ('trialing', 'incomplete', 'past_due') then
    update public.subscriptions set status = 'cancelled', cancelled_at = now() where id = p_subscription_id;
  else
    update public.subscriptions set cancel_at_period_end = true where id = p_subscription_id;
  end if;
  insert into public.subscription_events (subscription_id, event_type, actor_id, details)
  values (p_subscription_id, 'cancel_requested', auth.uid(), jsonb_build_object('immediately', p_immediately));
end $$;

create or replace function public.resume_subscription(p_subscription_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.subscriptions set cancel_at_period_end = false
   where id = p_subscription_id and status = 'active'
     and (lawyer_id = auth.uid() or (firm_id is not null and app.is_firm_owner(firm_id)));
  if not found then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
end $$;

-- Cron: period roll-over. Paid renewals require a new payment (no stored cards).
create or replace function public.process_subscription_renewals()
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_count int := 0;
  r record;
  v_owner uuid;
  v_grace int := app.setting('subscriptions', 'grace_days', '7')::int;
begin
  for r in select s.*, p.price_monthly_minor, p.price_yearly_minor from public.subscriptions s
             join public.subscription_plans p on p.id = s.plan_id
            where s.status in ('trialing', 'active', 'past_due') and s.current_period_end < now()
            for update of s skip locked loop
    v_owner := coalesce(r.lawyer_id, (select owner_id from public.law_firms where id = r.firm_id));
    if r.cancel_at_period_end then
      update public.subscriptions set status = 'cancelled', cancelled_at = now() where id = r.id;
    elsif r.status = 'past_due' and r.current_period_end < now() - make_interval(days => v_grace) then
      update public.subscriptions set status = 'expired' where id = r.id;
      perform app.notify(v_owner, 'subscription.expired', '{}', '/lawyer/subscription', 'sub-expired:' || r.id);
    elsif r.status in ('trialing', 'active') then
      if (case when r.billing_cycle = 'yearly' then r.price_yearly_minor else r.price_monthly_minor end) = 0 then
        update public.subscriptions set current_period_start = current_period_end,
               current_period_end = current_period_end + case when billing_cycle = 'yearly' then interval '1 year' else interval '1 month' end
         where id = r.id;
      else
        update public.subscriptions set status = 'past_due' where id = r.id;
        perform app.notify(v_owner, 'subscription.renewal_due', '{}', '/lawyer/subscription', 'sub-due:' || r.id || ':' || r.current_period_end::date);
      end if;
    end if;
    insert into public.subscription_events (subscription_id, event_type, details) values (r.id, 'period_processed', '{}');
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- Entitlements for the UI (enforcement stays in the database).
create or replace function public.my_entitlements(p_firm_id uuid default null)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'plan', (select jsonb_build_object('code', p.code, 'name_ar', p.name_ar, 'name_en', p.name_en) from public.subscription_plans p where p.id = x.plan_id),
    'features', coalesce((select jsonb_object_agg(f.feature_key, jsonb_build_object('enabled', f.enabled, 'limit', f.limit_value))
                            from public.plan_features f where f.plan_id = x.plan_id), '{}'))
  from (select case when p_firm_id is not null and (app.is_firm_member(p_firm_id))
                    then app.effective_plan_for_firm(p_firm_id)
                    else app.effective_plan_for_lawyer(auth.uid()) end as plan_id) x;
$$;

create or replace function app.enforce_service_listing_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_feat record;
  v_count int;
begin
  if new.status not in ('pending_review', 'active') or (tg_op = 'UPDATE' and old.status in ('pending_review', 'active')) then
    return new;
  end if;
  select * into v_feat from app.plan_feature(app.effective_plan_for_lawyer(new.lawyer_id), 'services.listings');
  select count(*) into v_count from public.legal_services where lawyer_id = new.lawyer_id and id <> new.id and status in ('pending_review', 'active');
  if not v_feat.enabled or (v_feat.limit_value is not null and v_count >= v_feat.limit_value) then
    raise exception 'Service listing limit reached for your plan' using errcode = 'P0001', hint = 'plan_limit';
  end if;
  return new;
end $$;
create trigger legal_services_plan_limit before insert or update of status on public.legal_services
  for each row execute function app.enforce_service_listing_limit();

create or replace function app.enforce_branch_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_feat record;
begin
  select * into v_feat from app.plan_feature(app.effective_plan_for_firm(new.firm_id), 'firm.branches');
  if not coalesce(v_feat.enabled, false) or (v_feat.limit_value is not null and
     (select count(*) from public.law_firm_branches where firm_id = new.firm_id) >= v_feat.limit_value) then
    raise exception 'Branch limit reached for your plan' using errcode = 'P0001', hint = 'plan_limit';
  end if;
  return new;
end $$;
create trigger law_firm_branches_plan_limit before insert on public.law_firm_branches
  for each row execute function app.enforce_branch_limit();

-- ---------------------------------------------------------------------------
-- Notification delivery queue (service role worker)
-- ---------------------------------------------------------------------------
create or replace function public.claim_notification_deliveries(p_limit int default 50)
returns table (delivery_id uuid, channel public.notification_channel, attempts int, user_id uuid, email text, phone text,
               locale text, event_type text, title text, body text, link text, params jsonb)
language sql security definer set search_path = '' as $$
  with claimed as (
    update public.notification_deliveries d
       set attempts = d.attempts + 1,
           next_attempt_at = now() + make_interval(mins => (power(2, least(d.attempts, 6)))::int * 5)
     where d.id in (select id from public.notification_deliveries
                     where status = 'queued' and next_attempt_at <= now()
                     order by next_attempt_at limit p_limit for update skip locked)
    returning d.*
  )
  select c.id, c.channel, c.attempts, n.user_id, u.email::text, p.phone, p.locale, n.event_type, n.title, n.body, n.link, n.params
    from claimed c
    join public.notifications n on n.id = c.notification_id
    join public.profiles p on p.id = n.user_id
    join auth.users u on u.id = n.user_id;
$$;

create or replace function public.complete_notification_delivery(p_delivery_id uuid, p_status public.delivery_status, p_provider text, p_message_id text, p_error text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.notification_deliveries
     set status = case when p_status = 'failed' and attempts < 5 then 'queued'::public.delivery_status else p_status end,
         provider = p_provider, provider_message_id = p_message_id, last_error = left(p_error, 500),
         sent_at = case when p_status = 'sent' then now() end
   where id = p_delivery_id;
end $$;

-- ---------------------------------------------------------------------------
-- Search
-- ---------------------------------------------------------------------------
create or replace function public.search_lawyers(
  p_query text default null,
  p_category_slug text default null,
  p_governorate_id int default null,
  p_city_id int default null,
  p_consultation_type public.consultation_kind default null,
  p_min_price_minor bigint default null,
  p_max_price_minor bigint default null,
  p_min_experience int default null,
  p_language text default null,
  p_min_rating numeric default null,
  p_firm_id uuid default null,
  p_gender text default null,
  p_available_on date default null,
  p_time_of_day text default null,         -- morning | afternoon | evening
  p_online_only boolean default false,
  p_sort text default 'relevance',
  p_limit int default 12,
  p_offset int default 0
)
returns table (
  id uuid, slug text, display_name_ar text, display_name_en text, title_ar text, title_en text, photo_url text,
  years_experience int, governorate_id int, city_id int, languages text[], rating_avg numeric, rating_count int,
  completed_consultations int, next_available_at timestamptz, min_price_minor bigint, primary_firm_id uuid,
  consultation_types text[], specializations jsonb, is_sponsored boolean, total_count bigint
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_q text := nullif(lower(trim(p_query)), '');
begin
  return query
  with base as (
    select l.*
      from public.lawyer_profiles l
      join public.profiles p on p.id = l.id and p.status = 'active'
     where l.is_published and l.verification_status = 'verified'
       and (v_q is null or l.search_text like '%' || v_q || '%'
            or exists (select 1 from public.lawyer_specializations ls join public.legal_categories c on c.id = ls.category_id
                        where ls.lawyer_id = l.id and (lower(c.name_ar) like '%' || v_q || '%' or lower(c.name_en) like '%' || v_q || '%')))
       and (p_category_slug is null or exists (select 1 from public.lawyer_specializations ls join public.legal_categories c on c.id = ls.category_id
                                               where ls.lawyer_id = l.id and c.slug = p_category_slug))
       and (p_governorate_id is null or l.governorate_id = p_governorate_id)
       and (p_city_id is null or l.city_id = p_city_id)
       and (p_min_experience is null or l.years_experience >= p_min_experience)
       and (p_language is null or p_language = any (l.languages))
       and (p_min_rating is null or l.rating_avg >= p_min_rating)
       and (p_firm_id is null or l.primary_firm_id = p_firm_id)
       and (p_gender is null or l.gender = p_gender)
       and (p_consultation_type is null or exists (select 1 from public.lawyer_consultation_offerings o
                                                    where o.lawyer_id = l.id and o.is_active and o.consultation_type = p_consultation_type
                                                      and (p_max_price_minor is null or o.price_minor <= p_max_price_minor)
                                                      and (p_min_price_minor is null or o.price_minor >= p_min_price_minor)))
       and (p_consultation_type is not null or ((p_max_price_minor is null or l.min_price_minor <= p_max_price_minor)
                                                and (p_min_price_minor is null or l.min_price_minor >= p_min_price_minor)))
       and (not coalesce(p_online_only, false) or exists (select 1 from public.lawyer_consultation_offerings o
                                                           where o.lawyer_id = l.id and o.is_active and o.consultation_type in ('video', 'voice', 'text')))
       and (p_available_on is null or exists (
             select 1 from public.lawyer_consultation_offerings o
              cross join lateral public.get_available_slots(l.id, o.consultation_type, p_available_on, p_available_on) s
              where o.lawyer_id = l.id and o.is_active
                and (p_consultation_type is null or o.consultation_type = p_consultation_type)
                and (p_time_of_day is null or
                     (p_time_of_day = 'morning' and extract(hour from s.starts_at at time zone l.timezone) < 12) or
                     (p_time_of_day = 'afternoon' and extract(hour from s.starts_at at time zone l.timezone) between 12 and 16) or
                     (p_time_of_day = 'evening' and extract(hour from s.starts_at at time zone l.timezone) >= 17))))
  ),
  counted as (select count(*) as n from base)
  select b.id, b.slug, b.display_name_ar, b.display_name_en, b.title_ar, b.title_en, b.photo_url, b.years_experience,
         b.governorate_id, b.city_id, b.languages, b.rating_avg, b.rating_count, b.completed_consultations,
         b.next_available_at, b.min_price_minor, b.primary_firm_id,
         coalesce((select array_agg(o.consultation_type::text order by o.consultation_type) from public.lawyer_consultation_offerings o
                    where o.lawyer_id = b.id and o.is_active), '{}'),
         coalesce((select jsonb_agg(jsonb_build_object('slug', c.slug, 'name_ar', c.name_ar, 'name_en', c.name_en) order by ls.is_primary desc, c.sort_order)
                     from public.lawyer_specializations ls join public.legal_categories c on c.id = ls.category_id
                    where ls.lawyer_id = b.id), '[]'),
         coalesce(b.sponsored_until > now(), false),
         (select n from counted)
    from base b
   order by
     case when p_sort = 'soonest' then b.next_available_at end asc nulls last,
     case when p_sort = 'price_asc' then b.min_price_minor end asc nulls last,
     case when p_sort = 'price_desc' then b.min_price_minor end desc nulls last,
     case when p_sort = 'experience' then b.years_experience end desc,
     case when p_sort = 'rating' then b.rating_avg end desc,
     -- relevance: text match on name, then Bayesian-smoothed rating, then activity
     case when p_sort = 'relevance' and v_q is not null and b.search_text like v_q || '%' then 0 else 1 end,
     ((b.rating_avg * b.rating_count + 4.0 * 5) / (b.rating_count + 5)) desc,
     b.completed_consultations desc,
     b.id
   limit least(greatest(p_limit, 1), 50) offset greatest(p_offset, 0);
end $$;

-- ---------------------------------------------------------------------------
-- Dashboards & reports
-- ---------------------------------------------------------------------------
create or replace function public.lawyer_dashboard_stats()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_tz text;
begin
  if v_uid is null or not app.has_role('lawyer') then
    raise exception 'Lawyer access required' using errcode = '42501';
  end if;
  select timezone into v_tz from public.lawyer_profiles where id = v_uid;
  return jsonb_build_object(
    'today', (select count(*) from public.appointments where lawyer_id = v_uid and status in ('CONFIRMED', 'IN_PROGRESS', 'COMPLETED')
                and (starts_at at time zone v_tz)::date = (now() at time zone v_tz)::date and occupies_slot),
    'upcoming', (select count(*) from public.appointments where lawyer_id = v_uid and status = 'CONFIRMED' and starts_at > now()),
    'pending_requests', (select count(*) from public.appointments where lawyer_id = v_uid and status = 'PENDING_CONFIRMATION'),
    'completed', (select count(*) from public.appointments where lawyer_id = v_uid and status = 'COMPLETED'),
    'active_matters', (select count(*) from public.legal_matters m where (m.owner_lawyer_id = v_uid or exists (
                         select 1 from public.matter_members mm where mm.matter_id = m.id and mm.user_id = v_uid))
                         and m.status not in ('CLOSED', 'ARCHIVED', 'COMPLETED')),
    'revenue_month_minor', (select coalesce(sum(net_minor), 0) from public.payments where beneficiary_lawyer_id = v_uid
                              and status in ('succeeded', 'partially_refunded') and paid_at >= date_trunc('month', now())),
    'balance_minor', app.beneficiary_balance_minor(v_uid, null),
    'outstanding_invoices_minor', (select coalesce(sum(total_minor), 0) from public.invoices where issuer_lawyer_id = v_uid and status = 'issued'),
    'rating_avg', (select rating_avg from public.lawyer_profiles where id = v_uid),
    'rating_count', (select rating_count from public.lawyer_profiles where id = v_uid),
    'unread_messages', (select coalesce(sum(unread), 0) from public.get_unread_counts()),
    'open_orders', (select count(*) from public.service_orders where lawyer_id = v_uid and status in ('PAID', 'IN_PROGRESS', 'REVISION_REQUESTED', 'WAITING_FOR_CLIENT'))
  );
end $$;

create or replace function public.lawyer_report(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not app.has_role('lawyer') then
    raise exception 'Lawyer access required' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'bookings_by_day', coalesce((select jsonb_agg(jsonb_build_object('day', d, 'count', c) order by d) from (
        select (created_at at time zone 'Africa/Cairo')::date d, count(*) c from public.appointments
         where lawyer_id = v_uid and status not in ('DRAFT', 'EXPIRED')
           and (created_at at time zone 'Africa/Cairo')::date between p_from and p_to group by 1) x), '[]'),
    'revenue_by_type', coalesce((select jsonb_agg(jsonb_build_object('type', t, 'net_minor', n)) from (
        select coalesce(a.consultation_type::text, 'service') t, sum(p.net_minor) n from public.payments p
          left join public.appointments a on a.id = p.appointment_id
         where p.beneficiary_lawyer_id = v_uid and p.status in ('succeeded', 'partially_refunded')
           and (p.paid_at at time zone 'Africa/Cairo')::date between p_from and p_to group by 1) x), '[]'),
    'status_breakdown', coalesce((select jsonb_object_agg(s, c) from (
        select status::text s, count(*) c from public.appointments where lawyer_id = v_uid
           and (starts_at at time zone 'Africa/Cairo')::date between p_from and p_to group by 1) x), '{}'),
    'types', coalesce((select jsonb_object_agg(t, c) from (
        select consultation_type::text t, count(*) c from public.appointments where lawyer_id = v_uid and status not in ('DRAFT', 'EXPIRED')
           and (starts_at at time zone 'Africa/Cairo')::date between p_from and p_to group by 1) x), '{}'),
    'ratings', coalesce((select jsonb_object_agg(r, c) from (
        select rating::text r, count(*) c from public.reviews where lawyer_id = v_uid and status = 'published'
           and (created_at at time zone 'Africa/Cairo')::date between p_from and p_to group by 1) x), '{}'),
    'services', coalesce((select jsonb_agg(jsonb_build_object('title', s.title_ar, 'orders', x.c, 'net_minor', x.n)) from (
        select o.service_id, count(*) c, coalesce(sum(p.net_minor), 0) n from public.service_orders o
          left join public.payments p on p.service_order_id = o.id and p.status in ('succeeded', 'partially_refunded')
         where o.lawyer_id = v_uid and (o.created_at at time zone 'Africa/Cairo')::date between p_from and p_to group by 1) x
         join public.legal_services s on s.id = x.service_id), '[]')
  );
end $$;

create or replace function public.firm_report(p_firm_id uuid, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_fin boolean;
begin
  if not app.is_firm_member(p_firm_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  v_fin := app.firm_has_permission(p_firm_id, 'reports.financial');
  return jsonb_build_object(
    'active_matters', (select count(*) from public.legal_matters where firm_id = p_firm_id and status not in ('CLOSED', 'ARCHIVED', 'COMPLETED')),
    'closed_matters', (select count(*) from public.legal_matters where firm_id = p_firm_id and status in ('CLOSED', 'ARCHIVED', 'COMPLETED')
                         and (closed_at at time zone 'Africa/Cairo')::date between p_from and p_to),
    'overdue_tasks', (select count(*) from public.matter_tasks t join public.legal_matters m on m.id = t.matter_id
                       where m.firm_id = p_firm_id and t.status not in ('done', 'cancelled') and t.due_at < now()),
    'workload', coalesce((select jsonb_agg(jsonb_build_object('user_id', x.uid, 'name', p.full_name, 'open_tasks', x.c, 'matters', x.m)) from (
        select fm.user_id uid,
               (select count(*) from public.matter_tasks t join public.legal_matters m on m.id = t.matter_id
                 where m.firm_id = p_firm_id and t.assignee_id = fm.user_id and t.status not in ('done', 'cancelled')) c,
               (select count(*) from public.matter_members mm join public.legal_matters m on m.id = mm.matter_id
                 where m.firm_id = p_firm_id and mm.user_id = fm.user_id and m.status not in ('CLOSED', 'ARCHIVED')) m
          from public.law_firm_members fm where fm.firm_id = p_firm_id and fm.status = 'active') x
          join public.profiles p on p.id = x.uid), '[]'),
    'revenue_by_lawyer', case when v_fin then coalesce((select jsonb_agg(jsonb_build_object('lawyer', l.display_name_ar, 'gross_minor', x.g, 'net_minor', x.n)) from (
        select coalesce(a.lawyer_id, o.lawyer_id) lid, sum(p.amount_minor) g, sum(p.net_minor) n
          from public.payments p
          left join public.appointments a on a.id = p.appointment_id
          left join public.service_orders o on o.id = p.service_order_id
         where p.beneficiary_firm_id = p_firm_id and p.status in ('succeeded', 'partially_refunded')
           and (p.paid_at at time zone 'Africa/Cairo')::date between p_from and p_to group by 1) x
         join public.lawyer_profiles l on l.id = x.lid), '[]') end,
    'revenue_by_branch', case when v_fin then coalesce((select jsonb_agg(jsonb_build_object('branch', coalesce(b.name_ar, '—'), 'net_minor', x.n)) from (
        select fm.branch_id bid, sum(p.net_minor) n
          from public.payments p
          left join public.appointments a on a.id = p.appointment_id
          left join public.service_orders o on o.id = p.service_order_id
          left join public.law_firm_members fm on fm.firm_id = p_firm_id and fm.user_id = coalesce(a.lawyer_id, o.lawyer_id)
         where p.beneficiary_firm_id = p_firm_id and p.status in ('succeeded', 'partially_refunded')
           and (p.paid_at at time zone 'Africa/Cairo')::date between p_from and p_to group by 1) x
         left join public.law_firm_branches b on b.id = x.bid), '[]') end,
    'outstanding_invoices_minor', case when app.firm_has_permission(p_firm_id, 'invoices.view') then
        (select coalesce(sum(total_minor), 0) from public.invoices where issuer_firm_id = p_firm_id and status = 'issued') end,
    'balance_minor', case when v_fin then app.beneficiary_balance_minor(null, p_firm_id) end,
    'upcoming_appointments', (select count(*) from public.appointments where firm_id = p_firm_id and status = 'CONFIRMED' and starts_at > now())
  );
end $$;

create or replace function public.admin_overview_stats()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_platform_staff() then
    raise exception 'Staff access required' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'clients', (select count(*) from public.user_roles where role = 'client'),
    'lawyers', (select count(*) from public.lawyer_profiles),
    'verified_lawyers', (select count(*) from public.lawyer_profiles where verification_status = 'verified'),
    'pending_verifications', (select count(*) from public.lawyer_verification_requests where status = 'pending'),
    'active_firms', (select count(*) from public.law_firms where verification_status = 'verified'),
    'bookings', (select count(*) from public.appointments where status not in ('DRAFT', 'EXPIRED')),
    'completed_consultations', (select count(*) from public.appointments where status = 'COMPLETED'),
    'gross_volume_minor', case when app.is_admin() then (select coalesce(sum(amount_minor), 0) from public.payments where status in ('succeeded', 'partially_refunded', 'refunded')) end,
    'commission_minor', case when app.is_admin() then (select coalesce(sum(credit_minor - debit_minor), 0) from public.financial_ledger_entries where account = 'platform_revenue') end,
    'subscription_revenue_minor', case when app.is_admin() then (select coalesce(sum(credit_minor - debit_minor), 0) from public.financial_ledger_entries where account = 'subscription_revenue') end,
    'refunds_minor', case when app.is_admin() then (select coalesce(sum(amount_minor), 0) from public.refunds where status = 'succeeded') end,
    'pending_refunds', (select count(*) from public.refunds where status in ('approved', 'processing', 'failed')),
    'open_disputes', (select count(*) from public.disputes where status not in ('resolved', 'rejected', 'closed')),
    'open_tickets', (select count(*) from public.support_tickets where status in ('open', 'pending')),
    'active_subscriptions', (select count(*) from public.subscriptions where status in ('active', 'trialing')),
    'pending_services', (select count(*) from public.legal_services where status = 'pending_review'),
    'reported_reviews', (select count(*) from public.review_reports where status = 'open')
  );
end $$;

create or replace function public.admin_report(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'signups_by_day', coalesce((select jsonb_agg(jsonb_build_object('day', d, 'clients', c, 'lawyers', l) order by d) from (
        select (p.created_at at time zone 'Africa/Cairo')::date d,
               count(*) filter (where exists (select 1 from public.user_roles r where r.user_id = p.id and r.role = 'client')) c,
               count(*) filter (where exists (select 1 from public.user_roles r where r.user_id = p.id and r.role = 'lawyer')) l
          from public.profiles p where (p.created_at at time zone 'Africa/Cairo')::date between p_from and p_to group by 1) x), '[]'),
    'revenue_by_day', coalesce((select jsonb_agg(jsonb_build_object('day', d, 'gross_minor', g, 'commission_minor', c) order by d) from (
        select (paid_at at time zone 'Africa/Cairo')::date d, sum(amount_minor) g, sum(commission_minor) c
          from public.payments where status in ('succeeded', 'partially_refunded', 'refunded')
           and (paid_at at time zone 'Africa/Cairo')::date between p_from and p_to group by 1) x), '[]'),
    'booking_funnel', jsonb_build_object(
        'created', (select count(*) from public.appointments where (created_at at time zone 'Africa/Cairo')::date between p_from and p_to),
        'paid_or_confirmed', (select count(*) from public.appointments where (created_at at time zone 'Africa/Cairo')::date between p_from and p_to
                                and status in ('PENDING_CONFIRMATION', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'DISPUTED', 'NO_SHOW')),
        'completed', (select count(*) from public.appointments where (created_at at time zone 'Africa/Cairo')::date between p_from and p_to and status = 'COMPLETED'),
        'expired', (select count(*) from public.appointments where (created_at at time zone 'Africa/Cairo')::date between p_from and p_to and status = 'EXPIRED'),
        'cancelled', (select count(*) from public.appointments where (created_at at time zone 'Africa/Cairo')::date between p_from and p_to and status in ('CANCELLED', 'REFUNDED'))),
    'payment_failures', (select count(*) from public.payments where status = 'failed' and (created_at at time zone 'Africa/Cairo')::date between p_from and p_to),
    'payments_total', (select count(*) from public.payments where (created_at at time zone 'Africa/Cairo')::date between p_from and p_to),
    'refund_rate', (select case when count(*) = 0 then 0 else round(count(*) filter (where refunded_minor > 0)::numeric / count(*), 4) end
                      from public.payments where status in ('succeeded', 'partially_refunded', 'refunded')
                       and (paid_at at time zone 'Africa/Cairo')::date between p_from and p_to),
    'active_lawyers', (select count(distinct lawyer_id) from public.appointments where status = 'COMPLETED'
                        and (completed_at at time zone 'Africa/Cairo')::date between p_from and p_to),
    'subscriptions_by_plan', coalesce((select jsonb_object_agg(p.code, x.c) from (
        select plan_id, count(*) c from public.subscriptions where status in ('active', 'trialing') group by 1) x
        join public.subscription_plans p on p.id = x.plan_id), '{}'),
    'repeat_clients', (select count(*) from (select client_id from public.appointments where status = 'COMPLETED' group by 1 having count(*) > 1) x),
    'clients_with_completed', (select count(distinct client_id) from public.appointments where status = 'COMPLETED')
  );
end $$;
