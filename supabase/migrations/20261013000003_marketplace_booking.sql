-- =============================================================================
-- Marketplace services, appointments and the availability engine
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Fixed-price legal services
-- ---------------------------------------------------------------------------
create table public.legal_services (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  lawyer_id uuid not null references public.lawyer_profiles (id) on delete cascade,
  firm_id uuid references public.law_firms (id) on delete set null,
  category_id uuid references public.legal_categories (id) on delete set null,
  title_ar text not null check (char_length(title_ar) between 5 and 160),
  title_en text,
  description_ar text not null check (char_length(description_ar) between 20 and 5000),
  description_en text,
  deliverables text[] not null default '{}',
  required_documents text[] not null default '{}',
  price_minor bigint not null check (price_minor > 0 and price_minor <= 100000000),
  estimated_days int not null check (estimated_days between 1 and 120),
  revisions_included int not null default 1 check (revisions_included between 0 and 10),
  revision_policy text,
  refund_terms text,
  status text not null default 'draft' check (status in ('draft', 'pending_review', 'active', 'suspended', 'archived')),
  moderation_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index legal_services_lawyer_idx on public.legal_services (lawyer_id);
create index legal_services_public_idx on public.legal_services (status, category_id);
create trigger legal_services_updated_at before update on public.legal_services
  for each row execute function app.set_updated_at();

-- Lawyers submit for review; only admins activate or suspend.
create or replace function app.guard_legal_service()
returns trigger language plpgsql as $$
begin
  if app.is_trusted() or app.is_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.status not in ('draft', 'pending_review') then
      new.status := 'draft';
    end if;
    return new;
  end if;
  if new.status is distinct from old.status
     and not (new.status in ('draft', 'pending_review', 'archived')) then
    raise exception 'Only the platform can activate or suspend services' using errcode = '42501';
  end if;
  if old.status = 'suspended' and new.status <> 'suspended' then
    raise exception 'Suspended services can only be restored by the platform' using errcode = '42501';
  end if;
  -- Material edits to an active service send it back to review.
  if old.status = 'active' and new.status = 'active'
     and (new.price_minor, new.title_ar, new.description_ar) is distinct from (old.price_minor, old.title_ar, old.description_ar) then
    new.status := 'pending_review';
  end if;
  return new;
end $$;
create trigger legal_services_guard before insert or update on public.legal_services
  for each row execute function app.guard_legal_service();

create table public.service_packages (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.legal_services (id) on delete cascade,
  name_ar text not null,
  name_en text,
  price_minor bigint not null check (price_minor > 0),
  estimated_days int not null check (estimated_days between 1 and 120),
  deliverables text[] not null default '{}',
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index service_packages_service_idx on public.service_packages (service_id);

create sequence public.service_order_ref_seq;
create table public.service_orders (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('SO-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.service_order_ref_seq')::text, 6, '0')),
  service_id uuid not null references public.legal_services (id),
  package_id uuid references public.service_packages (id),
  client_id uuid not null references public.profiles (id),
  lawyer_id uuid not null references public.lawyer_profiles (id),
  firm_id uuid references public.law_firms (id),
  status public.service_order_status not null default 'CREATED',
  price_minor bigint not null check (price_minor >= 0),
  currency text not null default 'EGP',
  requirements text check (char_length(requirements) <= 5000),
  due_at timestamptz,
  delivered_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  revisions_used int not null default 0,
  revisions_allowed int not null default 1,
  matter_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index service_orders_client_idx on public.service_orders (client_id, created_at desc);
create index service_orders_lawyer_idx on public.service_orders (lawyer_id, status);
create trigger service_orders_updated_at before update on public.service_orders
  for each row execute function app.set_updated_at();

create or replace function app.service_order_transition_allowed(p_from public.service_order_status, p_to public.service_order_status)
returns boolean language sql immutable as $$
  select (p_from, p_to) in (
    ('CREATED', 'PENDING_PAYMENT'), ('CREATED', 'CANCELLED'),
    ('PENDING_PAYMENT', 'PAID'), ('PENDING_PAYMENT', 'CANCELLED'),
    ('PAID', 'IN_PROGRESS'), ('PAID', 'CANCELLED'), ('PAID', 'DISPUTED'),
    ('IN_PROGRESS', 'WAITING_FOR_CLIENT'), ('IN_PROGRESS', 'DELIVERED'), ('IN_PROGRESS', 'CANCELLED'), ('IN_PROGRESS', 'DISPUTED'),
    ('WAITING_FOR_CLIENT', 'IN_PROGRESS'), ('WAITING_FOR_CLIENT', 'CANCELLED'),
    ('DELIVERED', 'COMPLETED'), ('DELIVERED', 'REVISION_REQUESTED'), ('DELIVERED', 'DISPUTED'),
    ('REVISION_REQUESTED', 'IN_PROGRESS'), ('REVISION_REQUESTED', 'DELIVERED'), ('REVISION_REQUESTED', 'DISPUTED'),
    ('COMPLETED', 'DISPUTED'),
    ('CANCELLED', 'REFUNDED'),
    ('DISPUTED', 'COMPLETED'), ('DISPUTED', 'REFUNDED'), ('DISPUTED', 'CANCELLED'), ('DISPUTED', 'IN_PROGRESS')
  );
$$;

create or replace function app.enforce_service_order_transition()
returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status
     and not app.service_order_transition_allowed(old.status, new.status) then
    raise exception 'Invalid service order transition % -> %', old.status, new.status using errcode = '22023';
  end if;
  if not app.is_trusted() then
    raise exception 'Service orders change only through workflow functions' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger service_orders_transition before update on public.service_orders
  for each row execute function app.enforce_service_order_transition();

-- ---------------------------------------------------------------------------
-- Appointments
-- ---------------------------------------------------------------------------
create sequence public.appointment_ref_seq;
create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('AP-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.appointment_ref_seq')::text, 6, '0')),
  lawyer_id uuid not null references public.lawyer_profiles (id),
  client_id uuid not null references public.profiles (id),
  firm_id uuid references public.law_firms (id),
  consultation_type public.consultation_kind not null references public.consultation_types (code),
  category_id uuid references public.legal_categories (id),
  status public.appointment_status not null default 'DRAFT',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  occupies_slot boolean not null default true,
  slot tstzrange generated always as (tstzrange(starts_at, ends_at, '[)')) stored,
  office_id uuid references public.lawyer_offices (id),
  issue_summary text not null check (char_length(issue_summary) between 20 and 4000),
  price_minor bigint not null check (price_minor >= 0),
  currency text not null default 'EGP',
  hold_expires_at timestamptz,
  confirmed_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles (id),
  cancellation_reason text,
  reschedule_count int not null default 0,
  follow_up_of uuid references public.appointments (id),
  matter_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  -- Database-level double-booking protection (lawyer and client side).
  constraint appointments_no_lawyer_overlap exclude using gist (lawyer_id with =, slot with &&)
    where (occupies_slot and status in ('PENDING_PAYMENT', 'PENDING_CONFIRMATION', 'CONFIRMED', 'IN_PROGRESS')),
  constraint appointments_no_client_overlap exclude using gist (client_id with =, slot with &&)
    where (occupies_slot and status in ('PENDING_PAYMENT', 'PENDING_CONFIRMATION', 'CONFIRMED', 'IN_PROGRESS'))
);
create index appointments_lawyer_idx on public.appointments (lawyer_id, starts_at);
create index appointments_client_idx on public.appointments (client_id, starts_at desc);
create index appointments_firm_idx on public.appointments (firm_id, starts_at) where firm_id is not null;
create index appointments_status_idx on public.appointments (status, starts_at);
create index appointments_hold_idx on public.appointments (hold_expires_at) where status = 'PENDING_PAYMENT';
create trigger appointments_updated_at before update on public.appointments
  for each row execute function app.set_updated_at();

create or replace function app.appointment_transition_allowed(p_from public.appointment_status, p_to public.appointment_status)
returns boolean language sql immutable as $$
  select (p_from, p_to) in (
    ('DRAFT', 'PENDING_PAYMENT'), ('DRAFT', 'PENDING_CONFIRMATION'), ('DRAFT', 'CONFIRMED'), ('DRAFT', 'CANCELLED'), ('DRAFT', 'EXPIRED'),
    ('PENDING_PAYMENT', 'PENDING_CONFIRMATION'), ('PENDING_PAYMENT', 'CONFIRMED'), ('PENDING_PAYMENT', 'CANCELLED'), ('PENDING_PAYMENT', 'EXPIRED'),
    ('PENDING_CONFIRMATION', 'CONFIRMED'), ('PENDING_CONFIRMATION', 'CANCELLED'), ('PENDING_CONFIRMATION', 'EXPIRED'),
    ('CONFIRMED', 'IN_PROGRESS'), ('CONFIRMED', 'COMPLETED'), ('CONFIRMED', 'CANCELLED'), ('CONFIRMED', 'NO_SHOW'), ('CONFIRMED', 'DISPUTED'),
    ('IN_PROGRESS', 'COMPLETED'), ('IN_PROGRESS', 'DISPUTED'),
    ('COMPLETED', 'DISPUTED'),
    ('NO_SHOW', 'DISPUTED'), ('NO_SHOW', 'REFUNDED'),
    ('CANCELLED', 'REFUNDED'),
    ('EXPIRED', 'REFUNDED'), ('EXPIRED', 'PENDING_CONFIRMATION'), ('EXPIRED', 'CONFIRMED'),
    ('DISPUTED', 'COMPLETED'), ('DISPUTED', 'REFUNDED'), ('DISPUTED', 'CANCELLED')
  );
$$;

create or replace function app.enforce_appointment_rules()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.status not in ('DRAFT', 'PENDING_PAYMENT', 'PENDING_CONFIRMATION', 'CONFIRMED') then
      raise exception 'Invalid initial appointment status %', new.status using errcode = '22023';
    end if;
    if not app.is_trusted() then
      raise exception 'Appointments are created through book_appointment()' using errcode = '42501';
    end if;
    return new;
  end if;
  if not app.is_trusted() then
    raise exception 'Appointments change only through workflow functions' using errcode = '42501';
  end if;
  if new.status is distinct from old.status
     and not app.appointment_transition_allowed(old.status, new.status) then
    raise exception 'Invalid appointment transition % -> %', old.status, new.status using errcode = '22023';
  end if;
  return new;
end $$;
create trigger appointments_rules before insert or update on public.appointments
  for each row execute function app.enforce_appointment_rules();

create table public.appointment_participants (
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('client', 'lawyer', 'firm_staff', 'observer')),
  joined_at timestamptz,
  left_at timestamptz,
  primary key (appointment_id, user_id)
);
create index appointment_participants_user_idx on public.appointment_participants (user_id);

create table public.appointment_events (
  id bigint generated always as identity primary key,
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  actor_id uuid references public.profiles (id),
  event_type text not null,
  from_status public.appointment_status,
  to_status public.appointment_status,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index appointment_events_appointment_idx on public.appointment_events (appointment_id, created_at);
create trigger appointment_events_append_only before update or delete on public.appointment_events
  for each row execute function app.forbid_mutation();

-- Private lawyer notes, or notes explicitly shared with the client.
create table public.appointment_notes (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  author_id uuid not null references public.profiles (id),
  body text not null check (char_length(body) between 1 and 20000),
  shared_with_client boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index appointment_notes_appointment_idx on public.appointment_notes (appointment_id);
create trigger appointment_notes_updated_at before update on public.appointment_notes
  for each row execute function app.set_updated_at();

create table public.appointment_reschedules (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  requested_by uuid not null references public.profiles (id),
  old_starts_at timestamptz not null,
  old_ends_at timestamptz not null,
  new_starts_at timestamptz not null,
  new_ends_at timestamptz not null,
  reason text,
  created_at timestamptz not null default now()
);
create index appointment_reschedules_appointment_idx on public.appointment_reschedules (appointment_id);

-- ---------------------------------------------------------------------------
-- Appointment access helpers
-- ---------------------------------------------------------------------------
create or replace function app.is_appointment_party(p_appointment_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.appointments a
    where a.id = p_appointment_id and (a.client_id = auth.uid() or a.lawyer_id = auth.uid())
  ) or exists (
    select 1 from public.appointment_participants p
    where p.appointment_id = p_appointment_id and p.user_id = auth.uid()
  );
$$;

create or replace function app.can_manage_appointment(p_appointment_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.appointments a
    where a.id = p_appointment_id
      and (a.lawyer_id = auth.uid()
           or (a.firm_id is not null and app.firm_has_permission(a.firm_id, 'appointments.manage')))
  );
$$;

-- ---------------------------------------------------------------------------
-- Availability engine (authoritative). Mirrors src/lib/domain/availability.ts.
-- ---------------------------------------------------------------------------
create or replace function public.get_available_slots(
  p_lawyer_id uuid,
  p_consultation_type public.consultation_kind,
  p_from date,
  p_to date
)
returns table (starts_at timestamptz, ends_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_lawyer public.lawyer_profiles%rowtype;
  v_duration int;
  v_step interval;
  v_now timestamptz := now();
  v_to date;
begin
  select * into v_lawyer from public.lawyer_profiles where id = p_lawyer_id;
  if not found then
    return;
  end if;
  -- Hide schedules of unpublished lawyers from everyone except the lawyer themself.
  if not app.is_public_lawyer(p_lawyer_id) and auth.uid() is distinct from p_lawyer_id and not app.is_trusted() then
    return;
  end if;
  select o.duration_minutes into v_duration
    from public.lawyer_consultation_offerings o
   where o.lawyer_id = p_lawyer_id and o.consultation_type = p_consultation_type and o.is_active;
  if v_duration is null then
    return;
  end if;
  if not exists (select 1 from public.consultation_types t where t.code = p_consultation_type and t.is_scheduled and t.is_active) then
    return;
  end if;
  v_step := make_interval(mins => v_duration + v_lawyer.buffer_minutes);
  v_to := least(p_to, p_from + 62, (v_now at time zone v_lawyer.timezone)::date + v_lawyer.max_advance_days);

  return query
  with days as (
    select d::date as day from generate_series(p_from::timestamp, v_to::timestamp, interval '1 day') d
  ),
  windows as (
    -- weekly windows, unless the whole day is blocked
    select dd.day, a.start_time, a.end_time
      from days dd
      join public.lawyer_availability a
        on a.lawyer_id = p_lawyer_id and a.weekday = extract(dow from dd.day)::int
     where not exists (
       select 1 from public.lawyer_availability_exceptions e
        where e.lawyer_id = p_lawyer_id and e.exception_date = dd.day
          and e.kind = 'unavailable' and e.start_time is null)
    union all
    -- date-specific extra hours
    select e.exception_date, e.start_time, e.end_time
      from public.lawyer_availability_exceptions e
     where e.lawyer_id = p_lawyer_id and e.kind = 'available'
       and e.exception_date between p_from and v_to
  ),
  candidate as (
    select w.day,
           gs as local_start,
           gs + make_interval(mins => v_duration) as local_end
      from windows w,
           generate_series(w.day + w.start_time,
                           w.day + w.end_time - make_interval(mins => v_duration),
                           v_step) gs
  ),
  slots as (
    select distinct c.day,
           (c.local_start at time zone v_lawyer.timezone) as s,
           (c.local_end at time zone v_lawyer.timezone) as e,
           c.local_start, c.local_end
      from candidate c
  )
  select sl.s, sl.e
    from slots sl
   where sl.s >= v_now + make_interval(hours => v_lawyer.min_notice_hours)
     -- partial-day blocks
     and not exists (
       select 1 from public.lawyer_availability_exceptions e
        where e.lawyer_id = p_lawyer_id and e.exception_date = sl.day and e.kind = 'unavailable'
          and e.start_time is not null
          and (sl.day + e.start_time) < sl.local_end and sl.local_start < (sl.day + e.end_time))
     -- existing bookings, respecting the preparation buffer
     and not exists (
       select 1 from public.appointments ap
        where ap.lawyer_id = p_lawyer_id and ap.occupies_slot
          and ap.status in ('PENDING_PAYMENT', 'PENDING_CONFIRMATION', 'CONFIRMED', 'IN_PROGRESS')
          and not (ap.status = 'PENDING_PAYMENT' and ap.hold_expires_at < v_now)
          and ap.slot && tstzrange(sl.s - make_interval(mins => v_lawyer.buffer_minutes),
                                   sl.e + make_interval(mins => v_lawyer.buffer_minutes), '()'))
     -- daily cap
     and (v_lawyer.max_daily_appointments is null or (
       select count(*) from public.appointments ap
        where ap.lawyer_id = p_lawyer_id and ap.occupies_slot
          and ap.status in ('PENDING_PAYMENT', 'PENDING_CONFIRMATION', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED')
          and not (ap.status = 'PENDING_PAYMENT' and ap.hold_expires_at < v_now)
          and (ap.starts_at at time zone v_lawyer.timezone)::date = sl.day
     ) < v_lawyer.max_daily_appointments)
   order by sl.s;
end $$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.legal_services enable row level security;
alter table public.service_packages enable row level security;
alter table public.service_orders enable row level security;
alter table public.appointments enable row level security;
alter table public.appointment_participants enable row level security;
alter table public.appointment_events enable row level security;
alter table public.appointment_notes enable row level security;
alter table public.appointment_reschedules enable row level security;

create policy services_read on public.legal_services for select to anon, authenticated
  using ((status = 'active' and app.is_public_lawyer(lawyer_id)) or lawyer_id = auth.uid()
         or (firm_id is not null and app.is_firm_member(firm_id)) or app.is_platform_staff());
create policy services_insert on public.legal_services for insert to authenticated
  with check (lawyer_id = auth.uid() and app.has_role('lawyer'));
create policy services_update on public.legal_services for update to authenticated
  using (lawyer_id = auth.uid() or app.is_admin()) with check (lawyer_id = auth.uid() or app.is_admin());
create policy services_delete on public.legal_services for delete to authenticated
  using (lawyer_id = auth.uid() and status in ('draft', 'pending_review'));

create policy packages_read on public.service_packages for select to anon, authenticated
  using (exists (select 1 from public.legal_services s where s.id = service_id));  -- inherits service visibility
create policy packages_write on public.service_packages for all to authenticated
  using (exists (select 1 from public.legal_services s where s.id = service_id and s.lawyer_id = auth.uid()))
  with check (exists (select 1 from public.legal_services s where s.id = service_id and s.lawyer_id = auth.uid()));

create policy service_orders_read on public.service_orders for select to authenticated
  using (client_id = auth.uid() or lawyer_id = auth.uid()
         or (firm_id is not null and app.firm_has_permission(firm_id, 'matters.view'))
         or app.is_platform_staff());

create policy appointments_read on public.appointments for select to authenticated
  using (client_id = auth.uid() or lawyer_id = auth.uid()
         or exists (select 1 from public.appointment_participants p where p.appointment_id = appointments.id and p.user_id = auth.uid())
         or (firm_id is not null and app.firm_has_permission(firm_id, 'appointments.manage'))
         or app.is_platform_staff());

create policy appointment_participants_read on public.appointment_participants for select to authenticated
  using (app.is_appointment_party(appointment_id) or app.can_manage_appointment(appointment_id) or app.is_platform_staff());

create policy appointment_events_read on public.appointment_events for select to authenticated
  using (app.is_appointment_party(appointment_id) or app.can_manage_appointment(appointment_id) or app.is_platform_staff());

-- Notes: author always; lawyer side sees all notes; client only explicitly shared notes.
create policy appointment_notes_read on public.appointment_notes for select to authenticated
  using (author_id = auth.uid()
         or app.can_manage_appointment(appointment_id)
         or (shared_with_client and exists (select 1 from public.appointments a where a.id = appointment_id and a.client_id = auth.uid())));
create policy appointment_notes_insert on public.appointment_notes for insert to authenticated
  with check (author_id = auth.uid() and app.can_manage_appointment(appointment_id));
create policy appointment_notes_update on public.appointment_notes for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy appointment_notes_delete on public.appointment_notes for delete to authenticated
  using (author_id = auth.uid());

create policy appointment_reschedules_read on public.appointment_reschedules for select to authenticated
  using (app.is_appointment_party(appointment_id) or app.can_manage_appointment(appointment_id) or app.is_platform_staff());
