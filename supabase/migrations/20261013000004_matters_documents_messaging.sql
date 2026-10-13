-- =============================================================================
-- Practice clients, legal matters, documents, secure messaging, meetings
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Practice client directory (a lawyer's or a firm's clients; may or may not
-- have a platform account).
-- ---------------------------------------------------------------------------
create table public.practice_clients (
  id uuid primary key default gen_random_uuid(),
  owner_lawyer_id uuid references public.lawyer_profiles (id) on delete cascade,
  firm_id uuid references public.law_firms (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,
  full_name text not null check (char_length(full_name) between 2 and 120),
  email text,
  phone text,
  address text,
  client_type text not null default 'individual' check (client_type in ('individual', 'company')),
  company_name text,
  notes text,
  tags text[] not null default '{}',
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((owner_lawyer_id is null) <> (firm_id is null))
);
create unique index practice_clients_lawyer_user on public.practice_clients (owner_lawyer_id, user_id) where user_id is not null and owner_lawyer_id is not null;
create unique index practice_clients_firm_user on public.practice_clients (firm_id, user_id) where user_id is not null and firm_id is not null;
create index practice_clients_firm_idx on public.practice_clients (firm_id);
create trigger practice_clients_updated_at before update on public.practice_clients
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- Legal matters
-- ---------------------------------------------------------------------------
create sequence public.matter_ref_seq;
create table public.legal_matters (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('MT-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.matter_ref_seq')::text, 6, '0')),
  firm_id uuid references public.law_firms (id) on delete restrict,
  owner_lawyer_id uuid not null references public.lawyer_profiles (id),
  client_record_id uuid references public.practice_clients (id) on delete set null,
  client_user_id uuid references public.profiles (id) on delete set null,
  category_id uuid references public.legal_categories (id),
  department_id uuid references public.law_firm_departments (id) on delete set null,
  title text not null check (char_length(title) between 3 and 200),
  description text check (char_length(description) <= 10000),
  status public.matter_status not null default 'NEW',
  priority public.priority_level not null default 'normal',
  opened_at date not null default current_date,
  closed_at timestamptz,
  opposing_party text,
  billing_type text not null default 'fixed' check (billing_type in ('fixed', 'hourly', 'retainer', 'pro_bono', 'contingency_not_allowed')),
  agreed_fee_minor bigint check (agreed_fee_minor is null or agreed_fee_minor >= 0),
  ai_enabled boolean not null default false,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (billing_type <> 'contingency_not_allowed')
);
create index legal_matters_owner_idx on public.legal_matters (owner_lawyer_id, status);
create index legal_matters_firm_idx on public.legal_matters (firm_id, status) where firm_id is not null;
create index legal_matters_client_idx on public.legal_matters (client_user_id) where client_user_id is not null;
create trigger legal_matters_updated_at before update on public.legal_matters
  for each row execute function app.set_updated_at();

alter table public.appointments add constraint appointments_matter_fk foreign key (matter_id) references public.legal_matters (id) on delete set null;
alter table public.service_orders add constraint service_orders_matter_fk foreign key (matter_id) references public.legal_matters (id) on delete set null;

create or replace function app.matter_transition_allowed(p_from public.matter_status, p_to public.matter_status)
returns boolean language sql immutable as $$
  select p_from = p_to or (p_from, p_to) in (
    ('NEW', 'UNDER_REVIEW'), ('NEW', 'ACTIVE'), ('NEW', 'CLOSED'),
    ('UNDER_REVIEW', 'ACTIVE'), ('UNDER_REVIEW', 'ON_HOLD'), ('UNDER_REVIEW', 'CLOSED'),
    ('ACTIVE', 'WAITING_FOR_CLIENT'), ('ACTIVE', 'WAITING_FOR_EXTERNAL_PARTY'), ('ACTIVE', 'ON_HOLD'), ('ACTIVE', 'COMPLETED'), ('ACTIVE', 'CLOSED'),
    ('WAITING_FOR_CLIENT', 'ACTIVE'), ('WAITING_FOR_CLIENT', 'ON_HOLD'), ('WAITING_FOR_CLIENT', 'CLOSED'),
    ('WAITING_FOR_EXTERNAL_PARTY', 'ACTIVE'), ('WAITING_FOR_EXTERNAL_PARTY', 'ON_HOLD'), ('WAITING_FOR_EXTERNAL_PARTY', 'CLOSED'),
    ('ON_HOLD', 'ACTIVE'), ('ON_HOLD', 'CLOSED'),
    ('COMPLETED', 'CLOSED'), ('COMPLETED', 'ACTIVE'),
    ('CLOSED', 'ARCHIVED'), ('CLOSED', 'ACTIVE')
  );
$$;

create or replace function app.enforce_matter_rules()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    if not app.matter_transition_allowed(old.status, new.status) then
      raise exception 'Invalid matter transition % -> %', old.status, new.status using errcode = '22023';
    end if;
    if new.firm_id is distinct from old.firm_id and not app.is_trusted() then
      raise exception 'A matter cannot be moved between firms' using errcode = '42501';
    end if;
    if new.status in ('CLOSED', 'ARCHIVED') and old.status not in ('CLOSED', 'ARCHIVED') then
      new.closed_at := now();
    elsif new.status not in ('CLOSED', 'ARCHIVED') then
      new.closed_at := null;
    end if;
  end if;
  -- Keep denormalised portal user in sync with the client record.
  if new.client_record_id is not null then
    select pc.user_id into new.client_user_id from public.practice_clients pc where pc.id = new.client_record_id;
  end if;
  return new;
end $$;
create trigger legal_matters_rules before insert or update on public.legal_matters
  for each row execute function app.enforce_matter_rules();

create table public.matter_members (
  matter_id uuid not null references public.legal_matters (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('lead', 'associate', 'staff')),
  can_edit boolean not null default true,
  added_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  primary key (matter_id, user_id)
);
create index matter_members_user_idx on public.matter_members (user_id);

create or replace function app.can_view_matter(p_matter_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.legal_matters m
    where m.id = p_matter_id and (
      m.owner_lawyer_id = auth.uid()
      or exists (select 1 from public.matter_members mm where mm.matter_id = m.id and mm.user_id = auth.uid())
      or (m.firm_id is not null and app.firm_has_permission(m.firm_id, 'matters.view'))
    )
  );
$$;

create or replace function app.can_edit_matter(p_matter_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.legal_matters m
    where m.id = p_matter_id and m.status <> 'ARCHIVED' and (
      m.owner_lawyer_id = auth.uid()
      or exists (select 1 from public.matter_members mm where mm.matter_id = m.id and mm.user_id = auth.uid() and mm.can_edit)
      or (m.firm_id is not null and app.firm_has_permission(m.firm_id, 'matters.edit'))
    )
  );
$$;

create or replace function app.can_assign_matter(p_matter_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.legal_matters m
    where m.id = p_matter_id and (
      m.owner_lawyer_id = auth.uid()
      or (m.firm_id is not null and app.firm_has_permission(m.firm_id, 'matters.assign'))
    )
  );
$$;

create or replace function app.is_matter_client(p_matter_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.legal_matters m where m.id = p_matter_id and m.client_user_id = auth.uid());
$$;

create table public.matter_events (
  id bigint generated always as identity primary key,
  matter_id uuid not null references public.legal_matters (id) on delete cascade,
  actor_id uuid references public.profiles (id),
  event_type text not null,
  summary text not null,
  visibility text not null default 'internal' check (visibility in ('internal', 'shared')),
  details jsonb not null default '{}',
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index matter_events_matter_idx on public.matter_events (matter_id, occurred_at desc);
create trigger matter_events_append_only before update or delete on public.matter_events
  for each row execute function app.forbid_mutation();

create table public.matter_tasks (
  id uuid primary key default gen_random_uuid(),
  matter_id uuid not null references public.legal_matters (id) on delete cascade,
  title text not null check (char_length(title) between 2 and 200),
  description text,
  assignee_id uuid references public.profiles (id) on delete set null,
  due_at timestamptz,
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'blocked', 'done', 'cancelled')),
  priority public.priority_level not null default 'normal',
  completed_at timestamptz,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index matter_tasks_matter_idx on public.matter_tasks (matter_id, status);
create index matter_tasks_assignee_idx on public.matter_tasks (assignee_id, status, due_at);
create trigger matter_tasks_updated_at before update on public.matter_tasks
  for each row execute function app.set_updated_at();

create table public.matter_hearings (
  id uuid primary key default gen_random_uuid(),
  matter_id uuid not null references public.legal_matters (id) on delete cascade,
  court_name text not null,
  court_location text,
  circuit text,
  case_number text,
  hearing_at timestamptz not null,
  assigned_lawyer_id uuid references public.profiles (id) on delete set null,
  purpose text,
  notes text,
  outcome text,
  next_hearing_at timestamptz,
  visible_to_client boolean not null default true,
  source text not null default 'manual' check (source in ('manual')),  -- no official judicial integration exists
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index matter_hearings_matter_idx on public.matter_hearings (matter_id, hearing_at);
create index matter_hearings_upcoming_idx on public.matter_hearings (hearing_at);
create trigger matter_hearings_updated_at before update on public.matter_hearings
  for each row execute function app.set_updated_at();

create table public.matter_notes (
  id uuid primary key default gen_random_uuid(),
  matter_id uuid not null references public.legal_matters (id) on delete cascade,
  author_id uuid not null references public.profiles (id),
  body text not null check (char_length(body) between 1 and 20000),
  visibility text not null default 'internal' check (visibility in ('private', 'internal', 'shared')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index matter_notes_matter_idx on public.matter_notes (matter_id, created_at desc);
create trigger matter_notes_updated_at before update on public.matter_notes
  for each row execute function app.set_updated_at();

create table public.matter_expenses (
  id uuid primary key default gen_random_uuid(),
  matter_id uuid not null references public.legal_matters (id) on delete cascade,
  description text not null,
  amount_minor bigint not null check (amount_minor > 0),
  incurred_on date not null default current_date,
  billable boolean not null default true,
  receipt_document_id uuid,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create index matter_expenses_matter_idx on public.matter_expenses (matter_id);

-- ---------------------------------------------------------------------------
-- Documents
-- ---------------------------------------------------------------------------
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id),
  firm_id uuid references public.law_firms (id) on delete set null,
  appointment_id uuid references public.appointments (id) on delete set null,
  service_order_id uuid references public.service_orders (id) on delete set null,
  title text not null check (char_length(title) between 1 and 200),
  description text,
  category public.document_category not null default 'other',
  status text not null default 'pending_upload' check (status in ('pending_upload', 'active', 'deleted')),
  current_version int not null default 0,
  mime_type text,
  size_bytes bigint,
  scan_status public.scan_status not null default 'pending',
  ai_processing_allowed boolean not null default false,
  retention_until date,
  expires_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index documents_owner_idx on public.documents (owner_id, created_at desc);
create index documents_firm_idx on public.documents (firm_id) where firm_id is not null;
create index documents_appointment_idx on public.documents (appointment_id) where appointment_id is not null;
create index documents_order_idx on public.documents (service_order_id) where service_order_id is not null;
create index documents_title_idx on public.documents (lower(title));
create trigger documents_updated_at before update on public.documents
  for each row execute function app.set_updated_at();

-- Only trusted code may change upload state, versions or scan results.
create or replace function app.guard_document()
returns trigger language plpgsql as $$
begin
  if app.is_trusted() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.status := 'pending_upload';
    new.current_version := 0;
    new.scan_status := 'pending';
    return new;
  end if;
  if (new.status, new.current_version, new.scan_status, new.size_bytes, new.mime_type, new.owner_id)
     is distinct from (old.status, old.current_version, old.scan_status, old.size_bytes, old.mime_type, old.owner_id) then
    raise exception 'Document storage fields are managed by the platform' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger documents_guard before insert or update on public.documents
  for each row execute function app.guard_document();

alter table public.lawyer_credentials add constraint lawyer_credentials_document_fk foreign key (document_id) references public.documents (id) on delete set null;
alter table public.matter_expenses add constraint matter_expenses_receipt_fk foreign key (receipt_document_id) references public.documents (id) on delete set null;

create table public.document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  version int not null check (version > 0),
  storage_bucket text not null default 'documents',
  storage_path text not null unique,
  original_filename text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  sha256 text,
  scan_status public.scan_status not null default 'pending',
  uploaded_by uuid not null references public.profiles (id),
  uploaded_at timestamptz,
  created_at timestamptz not null default now(),
  unique (document_id, version)
);

create table public.matter_documents (
  matter_id uuid not null references public.legal_matters (id) on delete cascade,
  document_id uuid not null references public.documents (id) on delete cascade,
  shared_with_client boolean not null default false,
  added_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  primary key (matter_id, document_id)
);
create index matter_documents_document_idx on public.matter_documents (document_id);

create table public.document_access_grants (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  grantee_id uuid not null references public.profiles (id) on delete cascade,
  permission text not null default 'view' check (permission in ('view', 'edit')),
  granted_by uuid not null references public.profiles (id),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique (document_id, grantee_id)
);

create table public.document_access_log (
  id bigint generated always as identity primary key,
  document_id uuid not null references public.documents (id) on delete cascade,
  user_id uuid references public.profiles (id),
  action text not null check (action in ('upload', 'download', 'share', 'unshare', 'delete', 'restore', 'ai_process')),
  version int,
  ip inet,
  created_at timestamptz not null default now()
);
create index document_access_log_doc_idx on public.document_access_log (document_id, created_at desc);
create trigger document_access_log_append_only before update or delete on public.document_access_log
  for each row execute function app.forbid_mutation();

create table public.document_templates (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  firm_id uuid references public.law_firms (id) on delete cascade,
  lawyer_id uuid references public.lawyer_profiles (id) on delete cascade,
  category text not null check (category in ('consultation_summary', 'engagement_letter', 'service_agreement', 'contract_draft', 'intake_form', 'legal_notice', 'matter_report')),
  title_ar text not null,
  title_en text,
  body_ar text not null,
  body_en text,
  variables text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index document_templates_key on public.document_templates (key, coalesce(firm_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(lawyer_id, '00000000-0000-0000-0000-000000000000'::uuid));
create trigger document_templates_updated_at before update on public.document_templates
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- Secure messaging
-- ---------------------------------------------------------------------------
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('appointment', 'matter', 'service_order', 'direct', 'support')),
  appointment_id uuid unique references public.appointments (id) on delete cascade,
  matter_id uuid references public.legal_matters (id) on delete cascade,
  service_order_id uuid unique references public.service_orders (id) on delete cascade,
  firm_id uuid references public.law_firms (id) on delete set null,
  subject text,
  is_locked boolean not null default false,
  created_by uuid references public.profiles (id),
  last_message_at timestamptz,
  created_at timestamptz not null default now()
);
create index conversations_matter_idx on public.conversations (matter_id) where matter_id is not null;

create table public.conversation_participants (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('client', 'lawyer', 'staff', 'member', 'support')),
  last_read_at timestamptz not null default now(),
  muted boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index conversation_participants_user_idx on public.conversation_participants (user_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid references public.profiles (id),
  kind text not null default 'text' check (kind in ('text', 'system')),
  body text not null check (char_length(body) between 1 and 10000),
  reply_to uuid references public.messages (id) on delete set null,
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create index messages_conversation_idx on public.messages (conversation_id, created_at desc);

create table public.message_attachments (
  message_id uuid not null references public.messages (id) on delete cascade,
  document_id uuid not null references public.documents (id) on delete cascade,
  primary key (message_id, document_id)
);
create index message_attachments_document_idx on public.message_attachments (document_id);

create or replace function app.is_conversation_participant(p_conversation_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.conversation_participants
    where conversation_id = p_conversation_id and user_id = auth.uid()
  );
$$;

-- Appointment chats open when the booking is confirmed and close a configurable
-- number of days after completion.
create or replace function app.can_post_to_conversation(p_conversation_id uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  v_conv public.conversations%rowtype;
  v_appt public.appointments%rowtype;
  v_days int;
begin
  if not app.is_conversation_participant(p_conversation_id) or not app.is_active_user() then
    return false;
  end if;
  select * into v_conv from public.conversations where id = p_conversation_id;
  if v_conv.is_locked then
    return false;
  end if;
  if v_conv.kind = 'appointment' then
    select * into v_appt from public.appointments where id = v_conv.appointment_id;
    if v_appt.status in ('CONFIRMED', 'IN_PROGRESS', 'DISPUTED') then
      return true;
    end if;
    if v_appt.status = 'COMPLETED' then
      v_days := coalesce((select (value ->> 'followup_days')::int from public.platform_settings where key = 'messaging'), 14);
      return coalesce(v_appt.completed_at, v_appt.ends_at) > now() - make_interval(days => v_days);
    end if;
    return false;
  end if;
  return true;
end $$;

create or replace function app.guard_message_update()
returns trigger language plpgsql as $$
begin
  if app.is_trusted() then
    return new;
  end if;
  if (new.conversation_id, new.sender_id, new.created_at, new.kind) is distinct from (old.conversation_id, old.sender_id, old.created_at, old.kind) then
    raise exception 'Immutable message fields' using errcode = '42501';
  end if;
  if new.body is distinct from old.body then
    if old.created_at < now() - interval '15 minutes' or old.deleted_at is not null then
      raise exception 'Messages can only be edited within 15 minutes' using errcode = '42501';
    end if;
    new.edited_at := now();
  end if;
  return new;
end $$;
create trigger messages_guard before update on public.messages
  for each row execute function app.guard_message_update();

create or replace function app.touch_conversation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;
  update public.conversation_participants set last_read_at = new.created_at
   where conversation_id = new.conversation_id and user_id = new.sender_id;
  return new;
end $$;
create trigger messages_touch after insert on public.messages
  for each row execute function app.touch_conversation();

create table public.meeting_sessions (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null unique references public.appointments (id) on delete cascade,
  provider text not null,
  room_name text not null,
  room_url text not null,
  media text not null check (media in ('video', 'audio')),
  status text not null default 'scheduled' check (status in ('scheduled', 'active', 'ended')),
  expires_at timestamptz not null,
  started_at timestamptz,
  ended_at timestamptz,
  recording_enabled boolean not null default false,
  recording_consent jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Document access (redefined in a later migration to include dispute evidence)
-- ---------------------------------------------------------------------------
create or replace function app.can_access_document(p_document_id uuid, p_permission text default 'view')
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  v_doc public.documents%rowtype;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return false;
  end if;
  select * into v_doc from public.documents where id = p_document_id;
  if not found or v_doc.status = 'deleted' then
    return false;
  end if;
  if v_doc.owner_id = v_uid then
    return true;
  end if;
  if exists (select 1 from public.document_access_grants g
             where g.document_id = p_document_id and g.grantee_id = v_uid
               and (g.expires_at is null or g.expires_at > now())
               and (p_permission = 'view' or g.permission = 'edit')) then
    return true;
  end if;
  if v_doc.firm_id is not null
     and app.firm_has_permission(v_doc.firm_id, case when p_permission = 'view' then 'documents.view' else 'documents.upload' end) then
    return true;
  end if;
  if exists (select 1 from public.matter_documents md
             where md.document_id = p_document_id
               and (case when p_permission = 'view' then app.can_view_matter(md.matter_id) else app.can_edit_matter(md.matter_id) end
                    or (p_permission = 'view' and md.shared_with_client and app.is_matter_client(md.matter_id)))) then
    return true;
  end if;
  if p_permission = 'view' then
    if v_doc.appointment_id is not null and app.is_appointment_party(v_doc.appointment_id) then
      return true;
    end if;
    if v_doc.service_order_id is not null and exists (
         select 1 from public.service_orders o where o.id = v_doc.service_order_id
           and (o.client_id = v_uid or o.lawyer_id = v_uid)) then
      return true;
    end if;
    if exists (select 1 from public.message_attachments ma join public.messages m on m.id = ma.message_id
               where ma.document_id = p_document_id and app.is_conversation_participant(m.conversation_id)) then
      return true;
    end if;
    -- Verification reviewers may read submitted credential documents only.
    if v_doc.category = 'credential' and app.is_admin() then
      return true;
    end if;
  end if;
  return false;
end $$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.practice_clients enable row level security;
alter table public.legal_matters enable row level security;
alter table public.matter_members enable row level security;
alter table public.matter_events enable row level security;
alter table public.matter_tasks enable row level security;
alter table public.matter_hearings enable row level security;
alter table public.matter_notes enable row level security;
alter table public.matter_expenses enable row level security;
alter table public.documents enable row level security;
alter table public.document_versions enable row level security;
alter table public.matter_documents enable row level security;
alter table public.document_access_grants enable row level security;
alter table public.document_access_log enable row level security;
alter table public.document_templates enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages enable row level security;
alter table public.message_attachments enable row level security;
alter table public.meeting_sessions enable row level security;

create policy practice_clients_rw on public.practice_clients for all to authenticated
  using (owner_lawyer_id = auth.uid() or (firm_id is not null and app.firm_has_permission(firm_id, 'clients.manage')))
  with check (owner_lawyer_id = auth.uid() or (firm_id is not null and app.firm_has_permission(firm_id, 'clients.manage')));
create policy practice_clients_firm_view on public.practice_clients for select to authenticated
  using (firm_id is not null and app.firm_has_permission(firm_id, 'matters.view'));

-- Row-based conditions first: during INSERT ... RETURNING the new row is not yet
-- visible to the lookup inside app.can_view_matter().
create policy matters_read on public.legal_matters for select to authenticated
  using (owner_lawyer_id = auth.uid() or client_user_id = auth.uid()
         or (firm_id is not null and app.firm_has_permission(firm_id, 'matters.view'))
         or app.can_view_matter(id));
create policy matters_insert on public.legal_matters for insert to authenticated
  with check (
    created_by = auth.uid()
    and ((firm_id is null and owner_lawyer_id = auth.uid() and app.has_role('lawyer'))
         or (firm_id is not null and app.firm_has_permission(firm_id, 'matters.edit')
             and exists (select 1 from public.law_firm_members m where m.firm_id = legal_matters.firm_id
                         and m.user_id = legal_matters.owner_lawyer_id and m.status = 'active')))
    and (client_record_id is null or exists (
         select 1 from public.practice_clients pc where pc.id = client_record_id
           and (pc.owner_lawyer_id = auth.uid() or pc.firm_id = legal_matters.firm_id))));
create policy matters_update on public.legal_matters for update to authenticated
  using (app.can_edit_matter(id)) with check (app.can_edit_matter(id));

create policy matter_members_read on public.matter_members for select to authenticated
  using (app.can_view_matter(matter_id));
create policy matter_members_write on public.matter_members for all to authenticated
  using (app.can_assign_matter(matter_id)) with check (app.can_assign_matter(matter_id));

create policy matter_events_read on public.matter_events for select to authenticated
  using (app.can_view_matter(matter_id) or (visibility = 'shared' and app.is_matter_client(matter_id)));
create policy matter_events_insert on public.matter_events for insert to authenticated
  with check (actor_id = auth.uid() and app.can_edit_matter(matter_id));

create policy matter_tasks_read on public.matter_tasks for select to authenticated
  using (app.can_view_matter(matter_id));
create policy matter_tasks_write on public.matter_tasks for all to authenticated
  using (app.can_edit_matter(matter_id) or assignee_id = auth.uid())
  with check (app.can_edit_matter(matter_id) or assignee_id = auth.uid());

create policy matter_hearings_read on public.matter_hearings for select to authenticated
  using (app.can_view_matter(matter_id) or (visible_to_client and app.is_matter_client(matter_id)));
create policy matter_hearings_write on public.matter_hearings for all to authenticated
  using (app.can_edit_matter(matter_id)) with check (app.can_edit_matter(matter_id));

create policy matter_notes_read on public.matter_notes for select to authenticated
  using (author_id = auth.uid()
         or (visibility in ('internal', 'shared') and app.can_view_matter(matter_id))
         or (visibility = 'shared' and app.is_matter_client(matter_id)));
create policy matter_notes_insert on public.matter_notes for insert to authenticated
  with check (author_id = auth.uid() and (app.can_edit_matter(matter_id)
              or (visibility = 'shared' and app.is_matter_client(matter_id))));
create policy matter_notes_update on public.matter_notes for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy matter_notes_delete on public.matter_notes for delete to authenticated
  using (author_id = auth.uid());

create policy matter_expenses_read on public.matter_expenses for select to authenticated
  using (app.can_view_matter(matter_id));
create policy matter_expenses_write on public.matter_expenses for all to authenticated
  using (app.can_edit_matter(matter_id)) with check (app.can_edit_matter(matter_id));

create policy documents_read on public.documents for select to authenticated
  using (app.can_access_document(id, 'view'));
create policy documents_insert on public.documents for insert to authenticated
  with check (owner_id = auth.uid()
              and (firm_id is null or app.firm_has_permission(firm_id, 'documents.upload'))
              and (appointment_id is null or app.is_appointment_party(appointment_id))
              and (service_order_id is null or exists (select 1 from public.service_orders o where o.id = service_order_id
                                                      and (o.client_id = auth.uid() or o.lawyer_id = auth.uid()))));
create policy documents_update on public.documents for update to authenticated
  using (app.can_access_document(id, 'edit')) with check (app.can_access_document(id, 'edit'));

create policy document_versions_read on public.document_versions for select to authenticated
  using (app.can_access_document(document_id, 'view'));

create policy matter_documents_read on public.matter_documents for select to authenticated
  using (app.can_view_matter(matter_id) or (shared_with_client and app.is_matter_client(matter_id)));
create policy matter_documents_write on public.matter_documents for all to authenticated
  using (app.can_edit_matter(matter_id))
  with check (app.can_edit_matter(matter_id) and app.can_access_document(document_id, 'view'));

create policy grants_read on public.document_access_grants for select to authenticated
  using (grantee_id = auth.uid() or exists (select 1 from public.documents d where d.id = document_id and d.owner_id = auth.uid()));
create policy grants_write on public.document_access_grants for all to authenticated
  using (exists (select 1 from public.documents d where d.id = document_id and d.owner_id = auth.uid()))
  with check (granted_by = auth.uid() and exists (select 1 from public.documents d where d.id = document_id and d.owner_id = auth.uid()));

create policy access_log_read on public.document_access_log for select to authenticated
  using (exists (select 1 from public.documents d where d.id = document_id and d.owner_id = auth.uid()) or app.is_admin());

create policy templates_read on public.document_templates for select to authenticated
  using (is_active and (firm_id is null and lawyer_id is null
         or lawyer_id = auth.uid() or (firm_id is not null and app.is_firm_member(firm_id))));
create policy templates_write on public.document_templates for all to authenticated
  using (lawyer_id = auth.uid() or (firm_id is not null and app.firm_has_permission(firm_id, 'firm.settings'))
         or (firm_id is null and lawyer_id is null and app.is_admin()))
  with check (lawyer_id = auth.uid() or (firm_id is not null and app.firm_has_permission(firm_id, 'firm.settings'))
         or (firm_id is null and lawyer_id is null and app.is_admin()));

create policy conversations_read on public.conversations for select to authenticated
  using (app.is_conversation_participant(id));
create policy participants_read on public.conversation_participants for select to authenticated
  using (app.is_conversation_participant(conversation_id));
create policy participants_update_own on public.conversation_participants for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy messages_read on public.messages for select to authenticated
  using (app.is_conversation_participant(conversation_id));
create policy messages_insert on public.messages for insert to authenticated
  with check (sender_id = auth.uid() and kind = 'text' and app.can_post_to_conversation(conversation_id));
create policy messages_update on public.messages for update to authenticated
  using (sender_id = auth.uid()) with check (sender_id = auth.uid());

create policy message_attachments_read on public.message_attachments for select to authenticated
  using (exists (select 1 from public.messages m where m.id = message_id and app.is_conversation_participant(m.conversation_id)));
create policy message_attachments_insert on public.message_attachments for insert to authenticated
  with check (exists (select 1 from public.messages m where m.id = message_id and m.sender_id = auth.uid())
              and exists (select 1 from public.documents d where d.id = document_id and d.owner_id = auth.uid()));

create policy meeting_sessions_read on public.meeting_sessions for select to authenticated
  using (app.is_appointment_party(appointment_id));
