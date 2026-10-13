-- =============================================================================
-- Payments, refunds, invoices, commissions, ledger, settlements, subscriptions
-- =============================================================================
-- Financial principles
--   * The client never writes financial rows. Payments are created by
--     public.create_payment() (amount always taken from the database) and
--     resolved by public.record_payment_result() which is service-role only.
--   * Each payment stores an immutable commission snapshot.
--   * financial_ledger_entries is append-only, double-entry (sum(debit) =
--     sum(credit) per txn_id), and is the source for settlements.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Subscriptions (declared first: payments may reference subscriptions)
-- ---------------------------------------------------------------------------
create table public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9_]+$'),
  audience text not null check (audience in ('lawyer', 'firm')),
  name_ar text not null,
  name_en text not null,
  description_ar text,
  description_en text,
  price_monthly_minor bigint not null default 0 check (price_monthly_minor >= 0),
  price_yearly_minor bigint not null default 0 check (price_yearly_minor >= 0),
  trial_days int not null default 0 check (trial_days between 0 and 90),
  is_active boolean not null default true,
  is_public boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger subscription_plans_updated_at before update on public.subscription_plans
  for each row execute function app.set_updated_at();

create table public.plan_features (
  plan_id uuid not null references public.subscription_plans (id) on delete cascade,
  feature_key text not null check (feature_key ~ '^[a-z_]+(\.[a-z_]+)*$'),
  enabled boolean not null default true,
  limit_value int check (limit_value is null or limit_value >= 0),
  primary key (plan_id, feature_key)
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.subscription_plans (id),
  lawyer_id uuid references public.lawyer_profiles (id) on delete cascade,
  firm_id uuid references public.law_firms (id) on delete cascade,
  status public.subscription_status not null default 'trialing',
  billing_cycle text not null default 'monthly' check (billing_cycle in ('monthly', 'yearly')),
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz not null,
  trial_ends_at timestamptz,
  cancel_at_period_end boolean not null default false,
  cancelled_at timestamptz,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((lawyer_id is null) <> (firm_id is null)),
  check (current_period_end > current_period_start)
);
create unique index subscriptions_one_live_lawyer on public.subscriptions (lawyer_id)
  where lawyer_id is not null and status in ('trialing', 'active', 'past_due');
create unique index subscriptions_one_live_firm on public.subscriptions (firm_id)
  where firm_id is not null and status in ('trialing', 'active', 'past_due');
create trigger subscriptions_updated_at before update on public.subscriptions
  for each row execute function app.set_updated_at();

create table public.subscription_events (
  id bigint generated always as identity primary key,
  subscription_id uuid not null references public.subscriptions (id) on delete cascade,
  event_type text not null,
  actor_id uuid references public.profiles (id),
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create trigger subscription_events_append_only before update or delete on public.subscription_events
  for each row execute function app.forbid_mutation();

-- Plan resolution: own subscription -> primary firm's subscription -> 'basic'.
create or replace function app.effective_plan_for_lawyer(p_lawyer_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select s.plan_id from public.subscriptions s
      where s.lawyer_id = p_lawyer_id and s.status in ('trialing', 'active', 'past_due')
        and s.current_period_end > now() - interval '3 days'
      order by s.created_at desc limit 1),
    (select s.plan_id from public.subscriptions s
       join public.lawyer_profiles l on l.primary_firm_id = s.firm_id
      where l.id = p_lawyer_id and s.status in ('trialing', 'active', 'past_due')
        and s.current_period_end > now() - interval '3 days'
      order by s.created_at desc limit 1),
    (select id from public.subscription_plans where code = 'basic')
  );
$$;

create or replace function app.effective_plan_for_firm(p_firm_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select s.plan_id from public.subscriptions s
   where s.firm_id = p_firm_id and s.status in ('trialing', 'active', 'past_due')
     and s.current_period_end > now() - interval '3 days'
   order by s.created_at desc limit 1;
$$;

-- Returns (enabled, limit). limit null = unlimited. Missing feature = disabled.
create or replace function app.plan_feature(p_plan_id uuid, p_feature text, out enabled boolean, out limit_value int)
language sql stable security definer set search_path = '' as $$
  select coalesce(f.enabled, false), f.limit_value
    from (select 1) one
    left join public.plan_features f on f.plan_id = p_plan_id and f.feature_key = p_feature;
$$;

-- ---------------------------------------------------------------------------
-- Commission rules
-- ---------------------------------------------------------------------------
create table public.commission_rules (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('global', 'firm', 'lawyer', 'service', 'promotion')),
  lawyer_id uuid references public.lawyer_profiles (id) on delete cascade,
  firm_id uuid references public.law_firms (id) on delete cascade,
  service_id uuid references public.legal_services (id) on delete cascade,
  applies_to public.payable_type,            -- null = all payable types
  rate_bps int not null check (rate_bps between 0 and 5000),
  fixed_minor bigint not null default 0 check (fixed_minor >= 0),
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default true,
  description text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at),
  check (
    (scope = 'global' and lawyer_id is null and firm_id is null and service_id is null)
    or (scope = 'firm' and firm_id is not null and lawyer_id is null and service_id is null)
    or (scope = 'lawyer' and lawyer_id is not null and firm_id is null and service_id is null)
    or (scope = 'service' and service_id is not null and lawyer_id is null and firm_id is null)
    or (scope = 'promotion' and starts_at is not null and ends_at is not null)
  )
);
create index commission_rules_active_idx on public.commission_rules (scope, is_active);
create trigger commission_rules_updated_at before update on public.commission_rules
  for each row execute function app.set_updated_at();

-- Precedence (mirrors src/lib/domain/commission.ts):
--   service > lawyer > firm > promotion > global; within a scope the most
--   recently created active rule wins. A promotion may itself be targeted at a
--   lawyer/firm/service, in which case it only matches that target.
create or replace function app.resolve_commission_rule(
  p_payable public.payable_type, p_lawyer_id uuid, p_firm_id uuid, p_service_id uuid, p_at timestamptz default now()
)
returns public.commission_rules language sql stable security definer set search_path = '' as $$
  select r.*
    from public.commission_rules r
   where r.is_active
     and (r.applies_to is null or r.applies_to = p_payable)
     and (r.starts_at is null or r.starts_at <= p_at)
     and (r.ends_at is null or r.ends_at > p_at)
     and (
       (r.scope = 'service' and r.service_id = p_service_id)
       or (r.scope = 'lawyer' and r.lawyer_id = p_lawyer_id)
       or (r.scope = 'firm' and r.firm_id = p_firm_id)
       or (r.scope = 'promotion'
           and (r.service_id is null or r.service_id = p_service_id)
           and (r.lawyer_id is null or r.lawyer_id = p_lawyer_id)
           and (r.firm_id is null or r.firm_id = p_firm_id))
       or r.scope = 'global'
     )
   order by case r.scope when 'service' then 1 when 'lawyer' then 2 when 'firm' then 3 when 'promotion' then 4 else 5 end,
            r.created_at desc
   limit 1;
$$;

create or replace function app.compute_commission_minor(p_amount_minor bigint, p_rate_bps int, p_fixed_minor bigint)
returns bigint language sql immutable as $$
  -- Round half up on the percentage part; never exceed the gross amount.
  select least(p_amount_minor, ((p_amount_minor * p_rate_bps + 5000) / 10000) + coalesce(p_fixed_minor, 0));
$$;

-- ---------------------------------------------------------------------------
-- Invoices
-- ---------------------------------------------------------------------------
create sequence public.invoice_number_seq;
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  number text not null unique default ('INV-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.invoice_number_seq')::text, 6, '0')),
  issuer_lawyer_id uuid references public.lawyer_profiles (id),
  issuer_firm_id uuid references public.law_firms (id),
  issued_by_platform boolean not null default false,
  bill_to_user_id uuid references public.profiles (id),
  bill_to_client_record_id uuid references public.practice_clients (id) on delete set null,
  bill_to_name text not null,
  matter_id uuid references public.legal_matters (id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'issued', 'paid', 'void')),
  currency text not null default 'EGP',
  line_items jsonb not null default '[]',
  subtotal_minor bigint not null default 0 check (subtotal_minor >= 0),
  tax_minor bigint not null default 0 check (tax_minor >= 0),
  total_minor bigint not null default 0 check (total_minor >= 0),
  notes text,
  due_date date,
  issued_at timestamptz,
  paid_at timestamptz,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (total_minor = subtotal_minor + tax_minor)
);
create index invoices_bill_to_idx on public.invoices (bill_to_user_id, created_at desc);
create index invoices_issuer_lawyer_idx on public.invoices (issuer_lawyer_id, created_at desc);
create index invoices_issuer_firm_idx on public.invoices (issuer_firm_id, created_at desc);
create trigger invoices_updated_at before update on public.invoices
  for each row execute function app.set_updated_at();

create or replace function app.guard_invoice()
returns trigger language plpgsql as $$
begin
  if app.is_trusted() then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status in ('paid', 'void') then
    raise exception 'Paid or void invoices are immutable' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and old.status = 'issued'
     and (new.line_items, new.subtotal_minor, new.tax_minor, new.total_minor, new.bill_to_name)
         is distinct from (old.line_items, old.subtotal_minor, old.tax_minor, old.total_minor, old.bill_to_name) then
    raise exception 'Issued invoices cannot be edited; void and re-issue instead' using errcode = '42501';
  end if;
  if new.status = 'paid' and (tg_op = 'INSERT' or old.status <> 'paid') then
    new.paid_at := coalesce(new.paid_at, now());
  end if;
  if new.status = 'issued' and (tg_op = 'INSERT' or old.status = 'draft') then
    new.issued_at := now();
  end if;
  new.issued_by_platform := false;
  return new;
end $$;
create trigger invoices_guard before insert or update on public.invoices
  for each row execute function app.guard_invoice();

-- ---------------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------------
create sequence public.payment_ref_seq;
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('PAY-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.payment_ref_seq')::text, 7, '0')),
  payer_id uuid not null references public.profiles (id),
  payable_type public.payable_type not null,
  appointment_id uuid references public.appointments (id),
  service_order_id uuid references public.service_orders (id),
  subscription_id uuid references public.subscriptions (id),
  invoice_id uuid references public.invoices (id),
  beneficiary_lawyer_id uuid references public.lawyer_profiles (id),
  beneficiary_firm_id uuid references public.law_firms (id),
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null default 'EGP',
  status public.payment_status not null default 'initiated',
  provider text not null,
  provider_mode text not null default 'test' check (provider_mode in ('live', 'test', 'sandbox')),
  method text,
  provider_order_id text,
  provider_transaction_id text,
  idempotency_key text not null unique,
  commission_rule_id uuid references public.commission_rules (id),
  commission_rate_bps int,
  commission_minor bigint,
  gateway_fee_minor bigint,
  net_minor bigint,
  refunded_minor bigint not null default 0 check (refunded_minor >= 0),
  failure_reason text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(appointment_id, service_order_id, subscription_id, invoice_id) = 1),
  check (refunded_minor <= amount_minor)
);
create unique index payments_provider_order on public.payments (provider, provider_order_id) where provider_order_id is not null;
create index payments_payer_idx on public.payments (payer_id, created_at desc);
create index payments_appointment_idx on public.payments (appointment_id) where appointment_id is not null;
create index payments_order_idx on public.payments (service_order_id) where service_order_id is not null;
create index payments_beneficiary_lawyer_idx on public.payments (beneficiary_lawyer_id, status);
create index payments_beneficiary_firm_idx on public.payments (beneficiary_firm_id, status);
create index payments_status_idx on public.payments (status, created_at);
create trigger payments_updated_at before update on public.payments
  for each row execute function app.set_updated_at();

create or replace function app.guard_payment()
returns trigger language plpgsql as $$
begin
  if not app.is_trusted() then
    raise exception 'Payments are managed by the platform' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    if old.commission_minor is not null and
       (new.commission_minor, new.commission_rate_bps, new.commission_rule_id, new.net_minor, new.gateway_fee_minor)
       is distinct from (old.commission_minor, old.commission_rate_bps, old.commission_rule_id, old.net_minor, old.gateway_fee_minor) then
      raise exception 'Commission snapshot is immutable' using errcode = '42501';
    end if;
    if (new.amount_minor, new.payer_id, new.currency) is distinct from (old.amount_minor, old.payer_id, old.currency) then
      raise exception 'Payment amount and payer are immutable' using errcode = '42501';
    end if;
    if old.status in ('succeeded', 'refunded', 'partially_refunded')
       and new.status not in ('succeeded', 'refunded', 'partially_refunded') then
      raise exception 'A captured payment cannot return to %', new.status using errcode = '22023';
    end if;
  end if;
  return new;
end $$;
create trigger payments_guard before insert or update on public.payments
  for each row execute function app.guard_payment();

alter table public.invoices add column payment_id uuid unique references public.payments (id);

create table public.payment_events (
  id bigint generated always as identity primary key,
  payment_id uuid references public.payments (id),
  provider text not null,
  provider_event_id text not null,
  event_type text not null,
  signature_valid boolean not null,
  payload jsonb not null default '{}',
  processing_result text,
  received_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);
create index payment_events_payment_idx on public.payment_events (payment_id);
create trigger payment_events_append_only before update or delete on public.payment_events
  for each row execute function app.forbid_mutation();

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments (id),
  amount_minor bigint not null check (amount_minor > 0),
  reason text not null,
  status public.refund_status not null default 'requested',
  policy_snapshot jsonb not null default '{}',
  requested_by uuid references public.profiles (id),
  approved_by uuid references public.profiles (id),
  provider_refund_id text,
  idempotency_key text not null unique,
  failure_reason text,
  attempts int not null default 0,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index refunds_payment_idx on public.refunds (payment_id);
create index refunds_status_idx on public.refunds (status, created_at);
create trigger refunds_updated_at before update on public.refunds
  for each row execute function app.set_updated_at();

create or replace function app.guard_refund()
returns trigger language plpgsql as $$
begin
  if not app.is_trusted() then
    raise exception 'Refunds are managed by the platform' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger refunds_guard before insert or update on public.refunds
  for each row execute function app.guard_refund();

-- ---------------------------------------------------------------------------
-- Settlement accounts, payouts, settlements
-- ---------------------------------------------------------------------------
create table public.settlement_accounts (
  id uuid primary key default gen_random_uuid(),
  lawyer_id uuid references public.lawyer_profiles (id) on delete cascade,
  firm_id uuid references public.law_firms (id) on delete cascade,
  method text not null check (method in ('bank_transfer', 'instapay', 'mobile_wallet')),
  account_holder_name text not null,
  bank_name text,
  -- Full account identifier. Restricted by RLS to the owner and admins; see
  -- docs/security for enabling column encryption with Supabase Vault.
  account_identifier text not null,
  account_last4 text generated always as (right(account_identifier, 4)) stored,
  is_default boolean not null default true,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((lawyer_id is null) <> (firm_id is null))
);
create trigger settlement_accounts_updated_at before update on public.settlement_accounts
  for each row execute function app.set_updated_at();

create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  beneficiary_lawyer_id uuid references public.lawyer_profiles (id),
  beneficiary_firm_id uuid references public.law_firms (id),
  settlement_account_id uuid references public.settlement_accounts (id),
  period_start date not null,
  period_end date not null,
  gross_minor bigint not null default 0,
  commission_minor bigint not null default 0,
  gateway_fee_minor bigint not null default 0,
  refund_adjustments_minor bigint not null default 0,
  net_minor bigint not null check (net_minor >= 0),
  status public.settlement_status not null default 'pending',
  reference text,
  paid_at timestamptz,
  notes text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((beneficiary_lawyer_id is null) <> (beneficiary_firm_id is null)),
  check (period_end >= period_start)
);
create index settlements_lawyer_idx on public.settlements (beneficiary_lawyer_id, created_at desc);
create index settlements_firm_idx on public.settlements (beneficiary_firm_id, created_at desc);
create trigger settlements_updated_at before update on public.settlements
  for each row execute function app.set_updated_at();

create table public.payout_requests (
  id uuid primary key default gen_random_uuid(),
  lawyer_id uuid references public.lawyer_profiles (id),
  firm_id uuid references public.law_firms (id),
  amount_minor bigint not null check (amount_minor > 0),
  status text not null default 'requested' check (status in ('requested', 'approved', 'rejected', 'paid', 'cancelled')),
  settlement_id uuid references public.settlements (id),
  requested_by uuid not null references public.profiles (id),
  reviewed_by uuid references public.profiles (id),
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((lawyer_id is null) <> (firm_id is null))
);
create trigger payout_requests_updated_at before update on public.payout_requests
  for each row execute function app.set_updated_at();

create table public.financial_ledger_entries (
  id bigint generated always as identity primary key,
  txn_id uuid not null,
  entry_type text not null check (entry_type in ('payment_captured', 'refund', 'settlement_payout', 'adjustment')),
  account text not null check (account in (
    'gateway_clearing', 'platform_revenue', 'gateway_fees', 'gateway_fee_recovery',
    'beneficiary_payable', 'settlement_payouts', 'subscription_revenue')),
  beneficiary_lawyer_id uuid references public.lawyer_profiles (id),
  beneficiary_firm_id uuid references public.law_firms (id),
  payment_id uuid references public.payments (id),
  refund_id uuid references public.refunds (id),
  settlement_id uuid references public.settlements (id),
  debit_minor bigint not null default 0 check (debit_minor >= 0),
  credit_minor bigint not null default 0 check (credit_minor >= 0),
  currency text not null default 'EGP',
  memo text,
  created_at timestamptz not null default now(),
  check ((debit_minor = 0) <> (credit_minor = 0))
);
create index ledger_txn_idx on public.financial_ledger_entries (txn_id);
create index ledger_beneficiary_lawyer_idx on public.financial_ledger_entries (beneficiary_lawyer_id, account, created_at);
create index ledger_beneficiary_firm_idx on public.financial_ledger_entries (beneficiary_firm_id, account, created_at);
create index ledger_payment_idx on public.financial_ledger_entries (payment_id);
create trigger ledger_append_only before update or delete on public.financial_ledger_entries
  for each row execute function app.forbid_mutation();

-- Enforce balanced transactions at commit time.
create or replace function app.check_ledger_balanced()
returns trigger language plpgsql as $$
declare
  v_diff bigint;
begin
  select sum(debit_minor) - sum(credit_minor) into v_diff
    from public.financial_ledger_entries where txn_id = new.txn_id;
  if v_diff <> 0 then
    raise exception 'Unbalanced ledger transaction % (diff %)', new.txn_id, v_diff using errcode = '23514';
  end if;
  return null;
end $$;
create constraint trigger ledger_balanced after insert on public.financial_ledger_entries
  deferrable initially deferred for each row execute function app.check_ledger_balanced();

-- Available balance owed to a beneficiary.
create or replace function app.beneficiary_balance_minor(p_lawyer_id uuid, p_firm_id uuid)
returns bigint language sql stable security definer set search_path = '' as $$
  select coalesce(sum(credit_minor - debit_minor), 0)::bigint
    from public.financial_ledger_entries
   where account = 'beneficiary_payable'
     and ((p_lawyer_id is not null and beneficiary_lawyer_id = p_lawyer_id)
       or (p_firm_id is not null and beneficiary_firm_id = p_firm_id));
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.subscription_plans enable row level security;
alter table public.plan_features enable row level security;
alter table public.subscriptions enable row level security;
alter table public.subscription_events enable row level security;
alter table public.commission_rules enable row level security;
alter table public.invoices enable row level security;
alter table public.payments enable row level security;
alter table public.payment_events enable row level security;
alter table public.refunds enable row level security;
alter table public.settlement_accounts enable row level security;
alter table public.settlements enable row level security;
alter table public.payout_requests enable row level security;
alter table public.financial_ledger_entries enable row level security;

create policy plans_read on public.subscription_plans for select to anon, authenticated
  using ((is_active and is_public) or app.is_admin());
create policy plans_admin on public.subscription_plans for all to authenticated
  using (app.is_admin()) with check (app.is_admin());
create policy plan_features_read on public.plan_features for select to anon, authenticated using (true);
create policy plan_features_admin on public.plan_features for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

create policy subscriptions_read on public.subscriptions for select to authenticated
  using (lawyer_id = auth.uid() or (firm_id is not null and app.is_firm_owner(firm_id)) or app.is_admin());
create policy subscription_events_read on public.subscription_events for select to authenticated
  using (exists (select 1 from public.subscriptions s where s.id = subscription_id
                 and (s.lawyer_id = auth.uid() or (s.firm_id is not null and app.is_firm_owner(s.firm_id)) or app.is_admin())));

create policy commission_rules_admin on public.commission_rules for all to authenticated
  using (app.is_admin()) with check (app.is_admin());
create policy commission_rules_own_read on public.commission_rules for select to authenticated
  using (lawyer_id = auth.uid() or (firm_id is not null and app.firm_has_permission(firm_id, 'reports.financial')));

create policy invoices_read on public.invoices for select to authenticated
  using (bill_to_user_id = auth.uid() or issuer_lawyer_id = auth.uid()
         or (issuer_firm_id is not null and app.firm_has_permission(issuer_firm_id, 'invoices.view'))
         or app.is_admin());
create policy invoices_write on public.invoices for all to authenticated
  using (payment_id is null and (issuer_lawyer_id = auth.uid()
         or (issuer_firm_id is not null and app.firm_has_permission(issuer_firm_id, 'invoices.manage'))))
  with check (payment_id is null and created_by = auth.uid() and (
         (issuer_lawyer_id = auth.uid() and issuer_firm_id is null)
         or (issuer_firm_id is not null and issuer_lawyer_id is null and app.firm_has_permission(issuer_firm_id, 'invoices.manage'))));

create policy payments_read on public.payments for select to authenticated
  using (payer_id = auth.uid() or beneficiary_lawyer_id = auth.uid()
         or (beneficiary_firm_id is not null and app.firm_has_permission(beneficiary_firm_id, 'reports.financial'))
         or app.is_admin());
create policy payment_events_admin on public.payment_events for select to authenticated using (app.is_admin());

create policy refunds_read on public.refunds for select to authenticated
  using (app.is_admin() or exists (select 1 from public.payments p where p.id = payment_id
         and (p.payer_id = auth.uid() or p.beneficiary_lawyer_id = auth.uid()
              or (p.beneficiary_firm_id is not null and app.firm_has_permission(p.beneficiary_firm_id, 'reports.financial')))));

create policy settlement_accounts_rw on public.settlement_accounts for all to authenticated
  using (lawyer_id = auth.uid() or (firm_id is not null and app.is_firm_owner(firm_id)) or app.is_admin())
  with check (lawyer_id = auth.uid() or (firm_id is not null and app.is_firm_owner(firm_id)));

create policy settlements_read on public.settlements for select to authenticated
  using (beneficiary_lawyer_id = auth.uid()
         or (beneficiary_firm_id is not null and app.firm_has_permission(beneficiary_firm_id, 'reports.financial'))
         or app.is_admin());

create policy payout_requests_read on public.payout_requests for select to authenticated
  using (lawyer_id = auth.uid() or (firm_id is not null and app.is_firm_owner(firm_id)) or app.is_admin());

create policy ledger_read on public.financial_ledger_entries for select to authenticated
  using (beneficiary_lawyer_id = auth.uid()
         or (beneficiary_firm_id is not null and app.firm_has_permission(beneficiary_firm_id, 'reports.financial'))
         or app.is_admin());
