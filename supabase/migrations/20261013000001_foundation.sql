-- =============================================================================
-- Qanony — foundation: extensions, private helper schema, enums, identity
-- =============================================================================
-- Conventions
--   * Money is stored as bigint minor units (piasters for EGP) in *_minor columns.
--   * Timestamps are timestamptz. Business timezone defaults to Africa/Cairo.
--   * Every user-facing table has RLS enabled. Helpers used by policies live in
--     the non-exposed `app` schema so they are not callable through the REST API.
--   * "Trusted" writes (security-definer functions owned by postgres, service role)
--     are detected with app.is_trusted() so column guards can allow them.
-- =============================================================================

create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions;

create schema if not exists app;
grant usage on schema app to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.app_role as enum (
  'client', 'lawyer', 'firm_owner', 'firm_staff', 'support', 'admin', 'super_admin'
);

create type public.account_status as enum ('active', 'suspended', 'pending_deletion', 'deleted');

create type public.verification_status as enum ('unverified', 'pending', 'verified', 'rejected', 'suspended');

create type public.consultation_kind as enum ('video', 'voice', 'text', 'in_person', 'written_opinion');

create type public.appointment_status as enum (
  'DRAFT', 'PENDING_PAYMENT', 'PENDING_CONFIRMATION', 'CONFIRMED', 'IN_PROGRESS',
  'COMPLETED', 'CANCELLED', 'EXPIRED', 'NO_SHOW', 'DISPUTED', 'REFUNDED'
);

create type public.matter_status as enum (
  'NEW', 'UNDER_REVIEW', 'ACTIVE', 'WAITING_FOR_CLIENT', 'WAITING_FOR_EXTERNAL_PARTY',
  'ON_HOLD', 'COMPLETED', 'CLOSED', 'ARCHIVED'
);

create type public.priority_level as enum ('low', 'normal', 'high', 'urgent');

create type public.service_order_status as enum (
  'CREATED', 'PENDING_PAYMENT', 'PAID', 'IN_PROGRESS', 'WAITING_FOR_CLIENT', 'DELIVERED',
  'REVISION_REQUESTED', 'COMPLETED', 'CANCELLED', 'DISPUTED', 'REFUNDED'
);

create type public.payment_status as enum (
  'initiated', 'pending', 'succeeded', 'failed', 'cancelled', 'refunded', 'partially_refunded'
);

create type public.payable_type as enum ('appointment', 'service_order', 'subscription', 'invoice');

create type public.refund_status as enum ('requested', 'approved', 'processing', 'succeeded', 'failed', 'rejected');

create type public.settlement_status as enum ('pending', 'processing', 'paid', 'failed', 'on_hold');

create type public.subscription_status as enum ('incomplete', 'trialing', 'active', 'past_due', 'cancelled', 'expired');

create type public.document_category as enum (
  'contract', 'identity', 'legal_notice', 'case_document', 'court_submission', 'evidence',
  'legal_opinion', 'agreement', 'invoice', 'power_of_attorney', 'credential', 'deliverable', 'other'
);

create type public.scan_status as enum ('pending', 'clean', 'infected', 'unscanned', 'error');

create type public.review_status as enum ('pending', 'published', 'hidden', 'rejected');

create type public.dispute_status as enum ('open', 'under_review', 'awaiting_party', 'resolved', 'rejected', 'closed');

create type public.ticket_status as enum ('open', 'pending', 'resolved', 'closed');

create type public.notification_channel as enum ('in_app', 'email', 'sms', 'whatsapp');

create type public.delivery_status as enum ('queued', 'sent', 'failed', 'skipped');

create type public.firm_member_type as enum ('owner', 'lawyer', 'staff');

create type public.membership_status as enum ('invited', 'active', 'suspended', 'removed');

create type public.content_status as enum ('draft', 'published', 'archived');

-- ---------------------------------------------------------------------------
-- Generic helpers
-- ---------------------------------------------------------------------------
create or replace function app.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- True when the statement runs as a privileged/trusted principal: a security
-- definer function owned by postgres, the service role, or a migration.
create or replace function app.is_trusted()
returns boolean language sql stable as $$
  select current_user not in ('anon', 'authenticated');
$$;

-- Blocks UPDATE/DELETE on append-only tables (ledger, events, audit log).
create or replace function app.forbid_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'Table % is append-only', tg_table_name using errcode = '42501';
end $$;

-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 120),
  phone text check (phone is null or phone ~ '^\+?[0-9]{8,15}$'),
  avatar_url text,
  locale text not null default 'ar' check (locale in ('ar', 'en')),
  timezone text not null default 'Africa/Cairo',
  governorate_id int,
  status public.account_status not null default 'active',
  suspended_reason text,
  terms_accepted_at timestamptz,
  privacy_consent_at timestamptz,
  marketing_consent boolean not null default false,
  deletion_requested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function app.set_updated_at();

create table public.user_roles (
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.app_role not null,
  granted_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);
create index user_roles_role_idx on public.user_roles (role);

create table public.permissions (
  code text primary key check (code ~ '^[a-z_]+\.[a-z_]+$'),
  description text not null
);

create table public.role_permissions (
  role public.app_role not null,
  permission_code text not null references public.permissions (code) on delete cascade,
  primary key (role, permission_code)
);

create table public.user_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  theme text not null default 'system' check (theme in ('light', 'dark', 'system')),
  ai_enabled boolean not null default true,
  ai_document_consent_at timestamptz,
  show_profile_photo_to_lawyers boolean not null default true,
  allow_review_display_name boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger user_settings_updated_at before update on public.user_settings
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- Role & permission helpers (used by RLS policies)
-- ---------------------------------------------------------------------------
create or replace function app.has_role(p_role public.app_role)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_roles ur
    join public.profiles p on p.id = ur.user_id
    where ur.user_id = auth.uid() and ur.role = p_role and p.status = 'active'
  );
$$;

create or replace function app.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_roles ur
    join public.profiles p on p.id = ur.user_id
    where ur.user_id = auth.uid() and ur.role in ('admin', 'super_admin') and p.status = 'active'
  );
$$;

create or replace function app.is_super_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select app.has_role('super_admin');
$$;

-- Support, admin or super admin (platform operations staff).
create or replace function app.is_platform_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_roles ur
    join public.profiles p on p.id = ur.user_id
    where ur.user_id = auth.uid() and ur.role in ('support', 'admin', 'super_admin') and p.status = 'active'
  );
$$;

create or replace function app.has_permission(p_code text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_roles ur
    join public.role_permissions rp on rp.role = ur.role
    join public.profiles p on p.id = ur.user_id
    where ur.user_id = auth.uid() and rp.permission_code = p_code and p.status = 'active'
  ) or app.is_super_admin();
$$;

create or replace function app.is_active_user()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and status = 'active');
$$;

-- ---------------------------------------------------------------------------
-- Profile column guard: only admins / trusted code can change account status.
-- ---------------------------------------------------------------------------
create or replace function app.guard_profile_update()
returns trigger language plpgsql as $$
begin
  if app.is_trusted() or app.is_admin() then
    return new;
  end if;
  if new.status is distinct from old.status
     or new.suspended_reason is distinct from old.suspended_reason
     or new.id is distinct from old.id then
    raise exception 'Not allowed to change account status' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger profiles_guard before update on public.profiles
  for each row execute function app.guard_profile_update();

-- ---------------------------------------------------------------------------
-- RLS — identity
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_settings enable row level security;

create policy profiles_select_own on public.profiles for select to authenticated
  using (id = auth.uid() or app.is_platform_staff());
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid() or app.is_admin()) with check (id = auth.uid() or app.is_admin());

create policy user_roles_select on public.user_roles for select to authenticated
  using (user_id = auth.uid() or app.is_platform_staff());
-- Role grants happen only through public.admin_set_role (security definer).

create policy permissions_read on public.permissions for select to authenticated using (true);
create policy role_permissions_read on public.role_permissions for select to authenticated using (true);

create policy user_settings_own on public.user_settings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
