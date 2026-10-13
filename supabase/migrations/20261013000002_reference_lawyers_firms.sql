-- =============================================================================
-- Reference data, legal categories, lawyers and law firms
-- =============================================================================

create table public.governorates (
  id serial primary key,
  code text not null unique,
  name_ar text not null,
  name_en text not null,
  sort_order int not null default 0,
  is_active boolean not null default true
);

create table public.cities (
  id serial primary key,
  governorate_id int not null references public.governorates (id) on delete cascade,
  name_ar text not null,
  name_en text not null,
  slug text not null,
  is_active boolean not null default true,
  unique (governorate_id, slug)
);
create index cities_governorate_idx on public.cities (governorate_id);

alter table public.profiles
  add constraint profiles_governorate_fk foreign key (governorate_id) references public.governorates (id);

create table public.legal_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  parent_id uuid references public.legal_categories (id) on delete set null,
  name_ar text not null,
  name_en text not null,
  description_ar text,
  description_en text,
  icon text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger legal_categories_updated_at before update on public.legal_categories
  for each row execute function app.set_updated_at();

create table public.consultation_types (
  code public.consultation_kind primary key,
  name_ar text not null,
  name_en text not null,
  description_ar text,
  description_en text,
  requires_meeting_room boolean not null default false,
  is_scheduled boolean not null default true,
  default_duration_minutes int not null default 30 check (default_duration_minutes between 10 and 240),
  sort_order int not null default 0,
  is_active boolean not null default true
);

-- ---------------------------------------------------------------------------
-- Law firms (declared before lawyers because lawyers reference a primary firm)
-- ---------------------------------------------------------------------------
create table public.law_firms (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name_ar text not null,
  name_en text,
  description_ar text,
  description_en text,
  logo_url text,
  website text,
  email text,
  phone text,
  commercial_registration text,          -- private; never exposed publicly
  founded_year int check (founded_year between 1800 and 2100),
  governorate_id int references public.governorates (id),
  city_id int references public.cities (id),
  owner_id uuid not null references public.profiles (id),
  verification_status public.verification_status not null default 'unverified',
  verified_at timestamptz,
  is_published boolean not null default false,
  ai_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index law_firms_owner_idx on public.law_firms (owner_id);
create trigger law_firms_updated_at before update on public.law_firms
  for each row execute function app.set_updated_at();

create table public.law_firm_branches (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.law_firms (id) on delete cascade,
  name_ar text not null,
  name_en text,
  address_ar text not null,
  address_en text,
  governorate_id int references public.governorates (id),
  city_id int references public.cities (id),
  phone text,
  is_headquarters boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index law_firm_branches_firm_idx on public.law_firm_branches (firm_id);
create trigger law_firm_branches_updated_at before update on public.law_firm_branches
  for each row execute function app.set_updated_at();

create table public.law_firm_departments (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.law_firms (id) on delete cascade,
  name_ar text not null,
  name_en text,
  created_at timestamptz not null default now(),
  unique (firm_id, name_ar)
);

-- Firm-scoped roles. Permissions are codes from app.firm_permission_codes().
create table public.law_firm_roles (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.law_firms (id) on delete cascade,
  name text not null,
  permissions text[] not null default '{}',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (firm_id, name)
);
create trigger law_firm_roles_updated_at before update on public.law_firm_roles
  for each row execute function app.set_updated_at();

create table public.law_firm_members (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.law_firms (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete cascade,
  invited_email text,
  member_type public.firm_member_type not null,
  role_id uuid references public.law_firm_roles (id) on delete set null,
  branch_id uuid references public.law_firm_branches (id) on delete set null,
  department_id uuid references public.law_firm_departments (id) on delete set null,
  status public.membership_status not null default 'invited',
  title text,
  invited_by uuid references public.profiles (id),
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (user_id is not null or invited_email is not null)
);
create unique index law_firm_members_unique_user on public.law_firm_members (firm_id, user_id) where user_id is not null;
create unique index law_firm_members_unique_invite on public.law_firm_members (firm_id, lower(invited_email)) where user_id is null;
create index law_firm_members_user_idx on public.law_firm_members (user_id) where status = 'active';
create trigger law_firm_members_updated_at before update on public.law_firm_members
  for each row execute function app.set_updated_at();

-- Per-member permission overrides (grant or revoke on top of the role).
create table public.law_firm_member_permissions (
  member_id uuid not null references public.law_firm_members (id) on delete cascade,
  permission text not null,
  granted boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (member_id, permission)
);

create or replace function app.firm_permission_codes()
returns text[] language sql immutable as $$
  select array[
    'matters.view', 'matters.edit', 'matters.assign', 'documents.view', 'documents.upload',
    'invoices.view', 'invoices.manage', 'clients.manage', 'appointments.manage',
    'reports.financial', 'members.manage', 'firm.settings'
  ];
$$;

create or replace function app.validate_firm_role_permissions()
returns trigger language plpgsql as $$
begin
  if not (new.permissions <@ app.firm_permission_codes()) then
    raise exception 'Unknown firm permission in %', new.permissions using errcode = '22023';
  end if;
  return new;
end $$;
create trigger law_firm_roles_validate before insert or update on public.law_firm_roles
  for each row execute function app.validate_firm_role_permissions();

create or replace function app.validate_member_permission()
returns trigger language plpgsql as $$
begin
  if not (new.permission = any (app.firm_permission_codes())) then
    raise exception 'Unknown firm permission %', new.permission using errcode = '22023';
  end if;
  return new;
end $$;
create trigger law_firm_member_permissions_validate before insert or update on public.law_firm_member_permissions
  for each row execute function app.validate_member_permission();

-- ---------------------------------------------------------------------------
-- Firm authorization helpers
-- ---------------------------------------------------------------------------
create or replace function app.is_firm_member(p_firm_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.law_firm_members m
    where m.firm_id = p_firm_id and m.user_id = auth.uid() and m.status = 'active'
  );
$$;

create or replace function app.is_firm_owner(p_firm_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.law_firms f where f.id = p_firm_id and f.owner_id = auth.uid()
  ) or exists (
    select 1 from public.law_firm_members m
    where m.firm_id = p_firm_id and m.user_id = auth.uid() and m.status = 'active' and m.member_type = 'owner'
  );
$$;

-- Effective firm permission for the current user = owner OR (role perms ∪ granted overrides) − revoked overrides.
create or replace function app.firm_has_permission(p_firm_id uuid, p_permission text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  v_member public.law_firm_members%rowtype;
  v_override boolean;
  v_role_perms text[];
begin
  if p_firm_id is null or auth.uid() is null then
    return false;
  end if;
  if app.is_firm_owner(p_firm_id) then
    return true;
  end if;
  select * into v_member from public.law_firm_members
   where firm_id = p_firm_id and user_id = auth.uid() and status = 'active';
  if not found then
    return false;
  end if;
  select granted into v_override from public.law_firm_member_permissions
   where member_id = v_member.id and permission = p_permission;
  if found then
    return v_override;
  end if;
  select permissions into v_role_perms from public.law_firm_roles where id = v_member.role_id;
  return coalesce(p_permission = any (v_role_perms), false);
end $$;

-- ---------------------------------------------------------------------------
-- Lawyers
-- ---------------------------------------------------------------------------
create table public.lawyer_profiles (
  id uuid primary key references public.profiles (id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  display_name_ar text not null,
  display_name_en text,
  title_ar text,
  title_en text,
  bio_ar text check (char_length(bio_ar) <= 5000),
  bio_en text check (char_length(bio_en) <= 5000),
  photo_url text,
  gender text check (gender in ('male', 'female')),
  years_experience int not null default 0 check (years_experience between 0 and 70),
  bar_admission_level text check (bar_admission_level in ('general', 'primary', 'appeal', 'cassation')),
  -- Shown only when the lawyer opts in AND verification has succeeded (set by trusted code).
  bar_number_public text,
  show_bar_number boolean not null default false,
  languages text[] not null default '{ar}',
  education jsonb not null default '[]',           -- [{degree, institution, year}]
  governorate_id int references public.governorates (id),
  city_id int references public.cities (id),
  primary_firm_id uuid references public.law_firms (id) on delete set null,
  timezone text not null default 'Africa/Cairo',
  -- Booking rules
  min_notice_hours int not null default 3 check (min_notice_hours between 0 and 336),
  max_advance_days int not null default 60 check (max_advance_days between 1 and 365),
  buffer_minutes int not null default 10 check (buffer_minutes between 0 and 120),
  max_daily_appointments int check (max_daily_appointments between 1 and 50),
  cancellation_deadline_hours int not null default 24 check (cancellation_deadline_hours between 0 and 168),
  auto_confirm boolean not null default true,
  -- Trusted fields
  verification_status public.verification_status not null default 'unverified',
  verified_at timestamptz,
  is_published boolean not null default false,
  is_featured boolean not null default false,       -- editorial pick, never paid
  sponsored_until timestamptz,                       -- paid placement, always labelled
  rating_avg numeric(3,2) not null default 0,
  rating_count int not null default 0,
  completed_consultations int not null default 0,
  next_available_at timestamptz,
  min_price_minor bigint,
  ai_enabled boolean not null default true,
  search_text text generated always as (
    lower(coalesce(display_name_ar, '') || ' ' || coalesce(display_name_en, '') || ' ' ||
          coalesce(title_ar, '') || ' ' || coalesce(title_en, ''))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index lawyer_profiles_public_idx on public.lawyer_profiles (verification_status, is_published);
create index lawyer_profiles_location_idx on public.lawyer_profiles (governorate_id, city_id);
create index lawyer_profiles_rating_idx on public.lawyer_profiles (rating_avg desc);
create index lawyer_profiles_next_idx on public.lawyer_profiles (next_available_at);
create trigger lawyer_profiles_updated_at before update on public.lawyer_profiles
  for each row execute function app.set_updated_at();

-- Lawyers cannot self-verify, self-feature, or touch aggregates.
create or replace function app.guard_lawyer_profile()
returns trigger language plpgsql as $$
begin
  if app.is_trusted() or app.is_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.verification_status := 'unverified';
    new.verified_at := null;
    new.is_featured := false;
    new.sponsored_until := null;
    new.rating_avg := 0;
    new.rating_count := 0;
    new.completed_consultations := 0;
    new.bar_number_public := null;
    new.is_published := false;
    return new;
  end if;
  if new.verification_status is distinct from old.verification_status
     or new.verified_at is distinct from old.verified_at
     or new.is_featured is distinct from old.is_featured
     or new.sponsored_until is distinct from old.sponsored_until
     or new.rating_avg is distinct from old.rating_avg
     or new.rating_count is distinct from old.rating_count
     or new.completed_consultations is distinct from old.completed_consultations
     or new.bar_number_public is distinct from old.bar_number_public
     or new.next_available_at is distinct from old.next_available_at
     or new.min_price_minor is distinct from old.min_price_minor then
    raise exception 'Protected lawyer profile fields can only be changed by the platform' using errcode = '42501';
  end if;
  -- Publishing requires successful verification.
  if new.is_published and not old.is_published and old.verification_status <> 'verified' then
    raise exception 'Profile can only be published after verification' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger lawyer_profiles_guard before insert or update on public.lawyer_profiles
  for each row execute function app.guard_lawyer_profile();

-- Private professional data — owner and admins only.
create table public.lawyer_private_details (
  lawyer_id uuid primary key references public.lawyer_profiles (id) on delete cascade,
  bar_registration_number text,
  national_id_last4 text check (national_id_last4 is null or national_id_last4 ~ '^[0-9]{4}$'),
  office_phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger lawyer_private_details_updated_at before update on public.lawyer_private_details
  for each row execute function app.set_updated_at();

create table public.lawyer_specializations (
  lawyer_id uuid not null references public.lawyer_profiles (id) on delete cascade,
  category_id uuid not null references public.legal_categories (id) on delete cascade,
  is_primary boolean not null default false,
  primary key (lawyer_id, category_id)
);
create index lawyer_specializations_category_idx on public.lawyer_specializations (category_id);

create table public.lawyer_credentials (
  id uuid primary key default gen_random_uuid(),
  lawyer_id uuid not null references public.lawyer_profiles (id) on delete cascade,
  kind text not null check (kind in ('bar_card', 'degree', 'certification', 'license', 'other')),
  title text not null,
  issuer text,
  issued_on date,
  expires_on date,
  document_id uuid,               -- FK added after documents table exists
  is_verified boolean not null default false,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index lawyer_credentials_lawyer_idx on public.lawyer_credentials (lawyer_id);
create trigger lawyer_credentials_updated_at before update on public.lawyer_credentials
  for each row execute function app.set_updated_at();

create or replace function app.guard_lawyer_credential()
returns trigger language plpgsql as $$
begin
  if app.is_trusted() or app.is_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.is_verified := false;
  elsif new.is_verified is distinct from old.is_verified then
    raise exception 'Credential verification is set by the platform' using errcode = '42501';
  elsif old.is_verified and (new.title, new.issuer, new.issued_on, new.document_id)
        is distinct from (old.title, old.issuer, old.issued_on, old.document_id) then
    -- editing a verified credential resets verification
    new.is_verified := false;
  end if;
  return new;
end $$;
create trigger lawyer_credentials_guard before insert or update on public.lawyer_credentials
  for each row execute function app.guard_lawyer_credential();

create table public.lawyer_verification_requests (
  id uuid primary key default gen_random_uuid(),
  lawyer_id uuid not null references public.lawyer_profiles (id) on delete cascade,
  status public.verification_status not null default 'pending'
    check (status in ('pending', 'verified', 'rejected')),
  submitted_note text,
  bar_registration_number text not null,
  credential_ids uuid[] not null default '{}',
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  decision_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index lawyer_verification_one_pending on public.lawyer_verification_requests (lawyer_id) where status = 'pending';
create index lawyer_verification_status_idx on public.lawyer_verification_requests (status, created_at);
create trigger lawyer_verification_requests_updated_at before update on public.lawyer_verification_requests
  for each row execute function app.set_updated_at();

create table public.lawyer_offices (
  id uuid primary key default gen_random_uuid(),
  lawyer_id uuid not null references public.lawyer_profiles (id) on delete cascade,
  firm_branch_id uuid references public.law_firm_branches (id) on delete set null,
  label text not null,
  address_ar text not null,
  address_en text,
  governorate_id int references public.governorates (id),
  city_id int references public.cities (id),
  map_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index lawyer_offices_lawyer_idx on public.lawyer_offices (lawyer_id);
create trigger lawyer_offices_updated_at before update on public.lawyer_offices
  for each row execute function app.set_updated_at();

-- What each lawyer offers, at what price and duration.
create table public.lawyer_consultation_offerings (
  lawyer_id uuid not null references public.lawyer_profiles (id) on delete cascade,
  consultation_type public.consultation_kind not null references public.consultation_types (code),
  price_minor bigint not null check (price_minor >= 0 and price_minor <= 100000000),
  duration_minutes int not null check (duration_minutes between 10 and 240),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (lawyer_id, consultation_type)
);
create trigger lawyer_consultation_offerings_updated_at before update on public.lawyer_consultation_offerings
  for each row execute function app.set_updated_at();

-- Weekly recurring availability in the lawyer's local timezone (0 = Sunday).
create table public.lawyer_availability (
  id uuid primary key default gen_random_uuid(),
  lawyer_id uuid not null references public.lawyer_profiles (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  office_id uuid references public.lawyer_offices (id) on delete set null,
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);
create index lawyer_availability_lawyer_idx on public.lawyer_availability (lawyer_id, weekday);

create or replace function app.prevent_availability_overlap()
returns trigger language plpgsql as $$
begin
  if exists (
    select 1 from public.lawyer_availability a
    where a.lawyer_id = new.lawyer_id and a.weekday = new.weekday and a.id <> new.id
      and a.start_time < new.end_time and new.start_time < a.end_time
  ) then
    raise exception 'Availability windows overlap' using errcode = '23P01';
  end if;
  return new;
end $$;
create trigger lawyer_availability_no_overlap before insert or update on public.lawyer_availability
  for each row execute function app.prevent_availability_overlap();

-- Date overrides: 'unavailable' (holiday / time off / blocked range) or 'available' (extra hours).
create table public.lawyer_availability_exceptions (
  id uuid primary key default gen_random_uuid(),
  lawyer_id uuid not null references public.lawyer_profiles (id) on delete cascade,
  exception_date date not null,
  kind text not null check (kind in ('unavailable', 'available')),
  start_time time,
  end_time time,
  reason text,
  created_at timestamptz not null default now(),
  check ((start_time is null and end_time is null and kind = 'unavailable')
         or (start_time is not null and end_time is not null and end_time > start_time))
);
create index lawyer_availability_exceptions_idx on public.lawyer_availability_exceptions (lawyer_id, exception_date);

create table public.lawyer_favorites (
  client_id uuid not null references public.profiles (id) on delete cascade,
  lawyer_id uuid not null references public.lawyer_profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (client_id, lawyer_id)
);

-- ---------------------------------------------------------------------------
-- Public-visibility helper
-- ---------------------------------------------------------------------------
create or replace function app.is_public_lawyer(p_lawyer_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.lawyer_profiles l join public.profiles p on p.id = l.id
    where l.id = p_lawyer_id and l.is_published and l.verification_status = 'verified' and p.status = 'active'
  );
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.governorates enable row level security;
alter table public.cities enable row level security;
alter table public.legal_categories enable row level security;
alter table public.consultation_types enable row level security;
alter table public.law_firms enable row level security;
alter table public.law_firm_branches enable row level security;
alter table public.law_firm_departments enable row level security;
alter table public.law_firm_roles enable row level security;
alter table public.law_firm_members enable row level security;
alter table public.law_firm_member_permissions enable row level security;
alter table public.lawyer_profiles enable row level security;
alter table public.lawyer_private_details enable row level security;
alter table public.lawyer_specializations enable row level security;
alter table public.lawyer_credentials enable row level security;
alter table public.lawyer_verification_requests enable row level security;
alter table public.lawyer_offices enable row level security;
alter table public.lawyer_consultation_offerings enable row level security;
alter table public.lawyer_availability enable row level security;
alter table public.lawyer_availability_exceptions enable row level security;
alter table public.lawyer_favorites enable row level security;

-- Reference data: public read, admin write.
create policy governorates_read on public.governorates for select to anon, authenticated using (true);
create policy governorates_admin on public.governorates for all to authenticated using (app.is_admin()) with check (app.is_admin());
create policy cities_read on public.cities for select to anon, authenticated using (true);
create policy cities_admin on public.cities for all to authenticated using (app.is_admin()) with check (app.is_admin());
create policy categories_read on public.legal_categories for select to anon, authenticated using (is_active or app.is_admin());
create policy categories_admin on public.legal_categories for all to authenticated using (app.is_admin()) with check (app.is_admin());
create policy consultation_types_read on public.consultation_types for select to anon, authenticated using (true);
create policy consultation_types_admin on public.consultation_types for all to authenticated using (app.is_admin()) with check (app.is_admin());

-- Firms
create policy law_firms_public_read on public.law_firms for select to anon, authenticated
  using ((is_published and verification_status = 'verified') or app.is_firm_member(id) or owner_id = auth.uid() or app.is_platform_staff());
create policy law_firms_insert on public.law_firms for insert to authenticated
  with check (owner_id = auth.uid());
create policy law_firms_update on public.law_firms for update to authenticated
  using (app.firm_has_permission(id, 'firm.settings') or app.is_admin())
  with check (app.firm_has_permission(id, 'firm.settings') or app.is_admin());

create or replace function app.guard_law_firm()
returns trigger language plpgsql as $$
begin
  if app.is_trusted() or app.is_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.verification_status := 'unverified';
    new.verified_at := null;
    new.is_published := false;
    return new;
  end if;
  if new.verification_status is distinct from old.verification_status
     or new.verified_at is distinct from old.verified_at
     or new.owner_id is distinct from old.owner_id then
    raise exception 'Protected firm fields can only be changed by the platform' using errcode = '42501';
  end if;
  if new.is_published and not old.is_published and old.verification_status <> 'verified' then
    raise exception 'Firm can only be published after verification' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger law_firms_guard before insert or update on public.law_firms
  for each row execute function app.guard_law_firm();

create policy branches_read on public.law_firm_branches for select to anon, authenticated
  using (exists (select 1 from public.law_firms f where f.id = firm_id and f.is_published and f.verification_status = 'verified')
         or app.is_firm_member(firm_id) or app.is_platform_staff());
create policy branches_write on public.law_firm_branches for all to authenticated
  using (app.firm_has_permission(firm_id, 'firm.settings')) with check (app.firm_has_permission(firm_id, 'firm.settings'));

create policy departments_read on public.law_firm_departments for select to authenticated
  using (app.is_firm_member(firm_id) or app.is_platform_staff());
create policy departments_write on public.law_firm_departments for all to authenticated
  using (app.firm_has_permission(firm_id, 'members.manage')) with check (app.firm_has_permission(firm_id, 'members.manage'));

create policy firm_roles_read on public.law_firm_roles for select to authenticated
  using (app.is_firm_member(firm_id) or app.is_platform_staff());
create policy firm_roles_write on public.law_firm_roles for all to authenticated
  using (app.firm_has_permission(firm_id, 'members.manage')) with check (app.firm_has_permission(firm_id, 'members.manage'));

create policy firm_members_read on public.law_firm_members for select to authenticated
  using (user_id = auth.uid() or app.is_firm_member(firm_id) or app.is_platform_staff());
-- Membership changes go through security-definer RPCs (invite/accept/update) to protect owner rows.

create policy firm_member_perms_read on public.law_firm_member_permissions for select to authenticated
  using (exists (select 1 from public.law_firm_members m where m.id = member_id
                 and (m.user_id = auth.uid() or app.firm_has_permission(m.firm_id, 'members.manage'))));
create policy firm_member_perms_write on public.law_firm_member_permissions for all to authenticated
  using (exists (select 1 from public.law_firm_members m where m.id = member_id
                 and m.member_type <> 'owner' and app.firm_has_permission(m.firm_id, 'members.manage')))
  with check (exists (select 1 from public.law_firm_members m where m.id = member_id
                 and m.member_type <> 'owner' and app.firm_has_permission(m.firm_id, 'members.manage')));

-- Lawyers
create policy lawyer_profiles_read on public.lawyer_profiles for select to anon, authenticated
  using (app.is_public_lawyer(id) or id = auth.uid() or app.is_platform_staff()
         or (primary_firm_id is not null and app.is_firm_member(primary_firm_id)));
create policy lawyer_profiles_insert on public.lawyer_profiles for insert to authenticated
  with check (id = auth.uid() and app.has_role('lawyer'));
create policy lawyer_profiles_update on public.lawyer_profiles for update to authenticated
  using (id = auth.uid() or app.is_admin()) with check (id = auth.uid() or app.is_admin());

create policy lawyer_private_rw on public.lawyer_private_details for all to authenticated
  using (lawyer_id = auth.uid() or app.is_admin()) with check (lawyer_id = auth.uid() or app.is_admin());

create policy lawyer_specs_read on public.lawyer_specializations for select to anon, authenticated using (true);
create policy lawyer_specs_write on public.lawyer_specializations for all to authenticated
  using (lawyer_id = auth.uid() or app.is_admin()) with check (lawyer_id = auth.uid() or app.is_admin());

create policy lawyer_credentials_read on public.lawyer_credentials for select to anon, authenticated
  using ((is_public and is_verified and app.is_public_lawyer(lawyer_id)) or lawyer_id = auth.uid() or app.is_admin());
create policy lawyer_credentials_write on public.lawyer_credentials for all to authenticated
  using (lawyer_id = auth.uid() or app.is_admin()) with check (lawyer_id = auth.uid() or app.is_admin());

create policy verification_read on public.lawyer_verification_requests for select to authenticated
  using (lawyer_id = auth.uid() or app.is_admin());
-- Submission and review go through security-definer RPCs.

create policy offices_read on public.lawyer_offices for select to anon, authenticated
  using ((is_active and app.is_public_lawyer(lawyer_id)) or lawyer_id = auth.uid() or app.is_platform_staff());
create policy offices_write on public.lawyer_offices for all to authenticated
  using (lawyer_id = auth.uid()) with check (lawyer_id = auth.uid());

create policy offerings_read on public.lawyer_consultation_offerings for select to anon, authenticated
  using (app.is_public_lawyer(lawyer_id) or lawyer_id = auth.uid() or app.is_platform_staff());
create policy offerings_write on public.lawyer_consultation_offerings for all to authenticated
  using (lawyer_id = auth.uid()) with check (lawyer_id = auth.uid());

create policy availability_read on public.lawyer_availability for select to anon, authenticated
  using (app.is_public_lawyer(lawyer_id) or lawyer_id = auth.uid());
create policy availability_write on public.lawyer_availability for all to authenticated
  using (lawyer_id = auth.uid()) with check (lawyer_id = auth.uid());

-- Exceptions may contain private reasons: owner only; slot generation runs as definer.
create policy availability_exceptions_rw on public.lawyer_availability_exceptions for all to authenticated
  using (lawyer_id = auth.uid()) with check (lawyer_id = auth.uid());

create policy favorites_rw on public.lawyer_favorites for all to authenticated
  using (client_id = auth.uid()) with check (client_id = auth.uid());
