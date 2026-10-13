-- =============================================================================
-- Operations: settings, notifications, reviews, support, disputes, audit,
-- content (CMS / articles / FAQ), rate limiting, AI usage logging
-- =============================================================================

create table public.platform_settings (
  key text primary key check (key ~ '^[a-z_]+$'),
  value jsonb not null,
  description text,
  is_public boolean not null default false,
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Audit log (append-only)
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}',
  ip inet,
  created_at timestamptz not null default now()
);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);
create index audit_logs_actor_idx on public.audit_logs (actor_id, created_at desc);
create index audit_logs_created_idx on public.audit_logs (created_at desc);
create trigger audit_logs_append_only before update or delete on public.audit_logs
  for each row execute function app.forbid_mutation();

create or replace function app.audit(p_action text, p_entity_type text, p_entity_id text, p_metadata jsonb default '{}')
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), p_action, p_entity_type, p_entity_id, coalesce(p_metadata, '{}'));
$$;

-- Generic row-change auditing for sensitive configuration tables. Stores the
-- changed column names only — never the full row, to avoid copying secrets.
create or replace function app.audit_row_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_changed text[];
  v_id text;
begin
  if tg_op = 'UPDATE' then
    select array_agg(n.key) into v_changed
      from jsonb_each(to_jsonb(new)) n
      join jsonb_each(to_jsonb(old)) o on o.key = n.key
     where n.value is distinct from o.value and n.key not in ('updated_at');
  end if;
  v_id := coalesce((to_jsonb(coalesce(new, old)) ->> 'id'), (to_jsonb(coalesce(new, old)) ->> 'key'),
                   (to_jsonb(coalesce(new, old)) ->> 'user_id'));
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), lower(tg_op), tg_table_name, v_id, jsonb_build_object('changed', v_changed));
  return coalesce(new, old);
end $$;

create trigger audit_user_roles after insert or update or delete on public.user_roles
  for each row execute function app.audit_row_change();
create trigger audit_platform_settings after insert or update or delete on public.platform_settings
  for each row execute function app.audit_row_change();
create trigger audit_commission_rules after insert or update or delete on public.commission_rules
  for each row execute function app.audit_row_change();
create trigger audit_subscription_plans after insert or update or delete on public.subscription_plans
  for each row execute function app.audit_row_change();
create trigger audit_refunds after insert or update on public.refunds
  for each row execute function app.audit_row_change();
create trigger audit_settlements after insert or update on public.settlements
  for each row execute function app.audit_row_change();

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
create table public.notification_templates (
  event_type text not null,
  channel public.notification_channel not null,
  locale text not null check (locale in ('ar', 'en')),
  subject text,
  body text not null,
  primary key (event_type, channel, locale)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  event_type text not null,
  title text not null,
  body text not null,
  link text,
  params jsonb not null default '{}',
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index notifications_dedupe on public.notifications (user_id, dedupe_key) where dedupe_key is not null;
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications (id) on delete cascade,
  channel public.notification_channel not null check (channel <> 'in_app'),
  status public.delivery_status not null default 'queued',
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  provider text,
  provider_message_id text,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (notification_id, channel)
);
create index notification_deliveries_queue_idx on public.notification_deliveries (status, next_attempt_at) where status = 'queued';
create trigger notification_deliveries_updated_at before update on public.notification_deliveries
  for each row execute function app.set_updated_at();

create table public.notification_preferences (
  user_id uuid not null references public.profiles (id) on delete cascade,
  event_type text not null,              -- '*' applies to all events
  channel public.notification_channel not null,
  enabled boolean not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, event_type, channel)
);

-- Render a template body by replacing {{key}} placeholders with params.
create or replace function app.render_template(p_text text, p_params jsonb)
returns text language plpgsql immutable as $$
declare
  v_out text := p_text;
  r record;
begin
  if v_out is null then
    return null;
  end if;
  for r in select key, value from jsonb_each_text(coalesce(p_params, '{}')) loop
    v_out := replace(v_out, '{{' || r.key || '}}', coalesce(r.value, ''));
  end loop;
  return v_out;
end $$;

-- Default channel policy per event when the user has no explicit preference.
create or replace function app.default_channel_enabled(p_event text, p_channel public.notification_channel)
returns boolean language sql immutable as $$
  select case
    when p_channel = 'email' then true
    when p_channel = 'sms' then p_event in ('appointment.reminder', 'appointment.cancelled', 'appointment.rescheduled', 'hearing.reminder', 'payment.succeeded')
    when p_channel = 'whatsapp' then false   -- opt-in only
    else true
  end;
$$;

-- Create an in-app notification and queue external deliveries. Idempotent via dedupe_key.
create or replace function app.notify(
  p_user_id uuid, p_event text, p_params jsonb default '{}', p_link text default null, p_dedupe_key text default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_locale text;
  v_title text;
  v_body text;
  v_id uuid;
  v_channel public.notification_channel;
  v_enabled boolean;
begin
  select locale into v_locale from public.profiles where id = p_user_id and status = 'active';
  if v_locale is null then
    return null;
  end if;
  select subject, body into v_title, v_body from public.notification_templates
   where event_type = p_event and channel = 'in_app' and locale = v_locale;
  if v_body is null then
    select subject, body into v_title, v_body from public.notification_templates
     where event_type = p_event and channel = 'in_app' and locale = 'ar';
  end if;
  v_title := coalesce(app.render_template(v_title, p_params), p_event);
  v_body := coalesce(app.render_template(v_body, p_params), '');

  insert into public.notifications (user_id, event_type, title, body, link, params, dedupe_key)
  values (p_user_id, p_event, v_title, v_body, p_link, coalesce(p_params, '{}'), p_dedupe_key)
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing
  returning id into v_id;

  if v_id is null then
    return null;  -- duplicate
  end if;

  foreach v_channel in array array['email', 'sms', 'whatsapp']::public.notification_channel[] loop
    select np.enabled into v_enabled from public.notification_preferences np
     where np.user_id = p_user_id and np.channel = v_channel and np.event_type in (p_event, '*')
     order by (np.event_type = p_event) desc limit 1;
    if coalesce(v_enabled, app.default_channel_enabled(p_event, v_channel)) then
      insert into public.notification_deliveries (notification_id, channel) values (v_id, v_channel);
    end if;
    v_enabled := null;
  end loop;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Reviews
-- ---------------------------------------------------------------------------
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  lawyer_id uuid not null references public.lawyer_profiles (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete cascade,
  appointment_id uuid unique references public.appointments (id) on delete set null,
  service_order_id uuid unique references public.service_orders (id) on delete set null,
  rating smallint not null check (rating between 1 and 5),
  comment text check (char_length(comment) <= 2000),
  status public.review_status not null default 'pending',
  display_name text,                        -- e.g. "عميل موثّق" or first name if the client allowed it
  moderation_note text,
  flagged_reasons text[] not null default '{}',
  lawyer_response text check (char_length(lawyer_response) <= 2000),
  lawyer_responded_at timestamptz,
  report_count int not null default 0,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(appointment_id, service_order_id) = 1)
);
create index reviews_lawyer_idx on public.reviews (lawyer_id, status, created_at desc);
create trigger reviews_updated_at before update on public.reviews
  for each row execute function app.set_updated_at();

create table public.review_reports (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews (id) on delete cascade,
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reason text not null check (reason in ('confidential_info', 'offensive', 'fake', 'spam', 'other')),
  details text,
  status text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  created_at timestamptz not null default now(),
  unique (review_id, reporter_id)
);

create or replace function app.refresh_lawyer_rating(p_lawyer_id uuid)
returns void language sql security definer set search_path = '' as $$
  update public.lawyer_profiles l
     set rating_avg = coalesce((select round(avg(rating)::numeric, 2) from public.reviews r where r.lawyer_id = p_lawyer_id and r.status = 'published'), 0),
         rating_count = (select count(*) from public.reviews r where r.lawyer_id = p_lawyer_id and r.status = 'published')
   where l.id = p_lawyer_id;
$$;

create or replace function app.on_review_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform app.refresh_lawyer_rating(coalesce(new.lawyer_id, old.lawyer_id));
  return null;
end $$;
create trigger reviews_rating after insert or update of status, rating or delete on public.reviews
  for each row execute function app.on_review_change();

-- Lawyers may only write their response; clients may only edit pending text.
create or replace function app.guard_review()
returns trigger language plpgsql as $$
begin
  if app.is_trusted() or app.is_admin() then
    if new.status = 'published' and old.status is distinct from 'published' then
      new.published_at := now();
    end if;
    return new;
  end if;
  if auth.uid() = old.lawyer_id then
    if (new.rating, new.comment, new.status, new.client_id, new.lawyer_id, new.report_count, new.display_name)
       is distinct from (old.rating, old.comment, old.status, old.client_id, old.lawyer_id, old.report_count, old.display_name) then
      raise exception 'Lawyers can only respond to reviews' using errcode = '42501';
    end if;
    new.lawyer_responded_at := now();
    return new;
  end if;
  raise exception 'Reviews are edited through the platform' using errcode = '42501';
end $$;
create trigger reviews_guard before update on public.reviews
  for each row execute function app.guard_review();

-- ---------------------------------------------------------------------------
-- Support tickets and disputes
-- ---------------------------------------------------------------------------
create sequence public.ticket_ref_seq;
create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('TK-' || lpad(nextval('public.ticket_ref_seq')::text, 6, '0')),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  category text not null check (category in ('account', 'booking', 'payment', 'technical', 'verification', 'other')),
  subject text not null check (char_length(subject) between 3 and 200),
  status public.ticket_status not null default 'open',
  priority public.priority_level not null default 'normal',
  assigned_to uuid references public.profiles (id),
  appointment_id uuid references public.appointments (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index support_tickets_requester_idx on public.support_tickets (requester_id, created_at desc);
create index support_tickets_status_idx on public.support_tickets (status, created_at);
create trigger support_tickets_updated_at before update on public.support_tickets
  for each row execute function app.set_updated_at();

create table public.support_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets (id) on delete cascade,
  author_id uuid not null references public.profiles (id),
  body text not null check (char_length(body) between 1 and 5000),
  is_internal boolean not null default false,
  created_at timestamptz not null default now()
);
create index support_ticket_messages_ticket_idx on public.support_ticket_messages (ticket_id, created_at);

create sequence public.dispute_ref_seq;
create table public.disputes (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('DP-' || lpad(nextval('public.dispute_ref_seq')::text, 6, '0')),
  raised_by uuid not null references public.profiles (id),
  against_user_id uuid references public.profiles (id),
  appointment_id uuid references public.appointments (id),
  service_order_id uuid references public.service_orders (id),
  reason text not null check (reason in ('no_show', 'quality', 'billing', 'misconduct', 'refund_request', 'other')),
  description text not null check (char_length(description) between 20 and 5000),
  status public.dispute_status not null default 'open',
  previous_status text,                    -- status of the appointment/order before the dispute
  resolution text,
  resolution_type text check (resolution_type in ('full_refund', 'partial_refund', 'no_refund', 'completed', 'cancelled')),
  refund_minor bigint,
  assigned_admin_id uuid references public.profiles (id),
  resolved_by uuid references public.profiles (id),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(appointment_id, service_order_id) = 1)
);
create unique index disputes_one_open_appointment on public.disputes (appointment_id) where status not in ('resolved', 'rejected', 'closed') and appointment_id is not null;
create unique index disputes_one_open_order on public.disputes (service_order_id) where status not in ('resolved', 'rejected', 'closed') and service_order_id is not null;
create trigger disputes_updated_at before update on public.disputes
  for each row execute function app.set_updated_at();

create table public.dispute_messages (
  id uuid primary key default gen_random_uuid(),
  dispute_id uuid not null references public.disputes (id) on delete cascade,
  author_id uuid not null references public.profiles (id),
  body text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now()
);

-- Evidence is attached explicitly by a party; admins can read only these documents.
create table public.dispute_evidence (
  dispute_id uuid not null references public.disputes (id) on delete cascade,
  document_id uuid not null references public.documents (id) on delete cascade,
  added_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  primary key (dispute_id, document_id)
);

create or replace function app.is_dispute_party(p_dispute_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.disputes d where d.id = p_dispute_id
                 and (d.raised_by = auth.uid() or d.against_user_id = auth.uid()));
$$;

-- ---------------------------------------------------------------------------
-- Content: CMS pages, articles, FAQ, banners, contact messages
-- ---------------------------------------------------------------------------
create table public.cms_pages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  title_ar text not null,
  title_en text,
  body_ar text not null,
  body_en text,
  seo_description_ar text,
  seo_description_en text,
  status public.content_status not null default 'draft',
  updated_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger cms_pages_updated_at before update on public.cms_pages
  for each row execute function app.set_updated_at();

create table public.legal_articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  category_id uuid references public.legal_categories (id) on delete set null,
  kind text not null default 'article' check (kind in ('article', 'guide')),
  title_ar text not null,
  title_en text,
  excerpt_ar text,
  excerpt_en text,
  body_ar text not null,
  body_en text,
  cover_image_url text,
  author_id uuid references public.profiles (id),
  author_lawyer_id uuid references public.lawyer_profiles (id),
  reviewed_by_lawyer boolean not null default false,
  sources text[] not null default '{}',
  status public.content_status not null default 'draft',
  published_at timestamptz,
  reading_minutes int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index legal_articles_public_idx on public.legal_articles (status, published_at desc);
create trigger legal_articles_updated_at before update on public.legal_articles
  for each row execute function app.set_updated_at();

create table public.faqs (
  id uuid primary key default gen_random_uuid(),
  audience text not null default 'general' check (audience in ('general', 'client', 'lawyer', 'firm')),
  question_ar text not null,
  question_en text,
  answer_ar text not null,
  answer_en text,
  sort_order int not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger faqs_updated_at before update on public.faqs
  for each row execute function app.set_updated_at();

create table public.banners (
  id uuid primary key default gen_random_uuid(),
  placement text not null check (placement in ('home_top', 'lawyers_list', 'dashboard')),
  text_ar text not null,
  text_en text,
  link text,
  is_sponsored boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone text,
  subject text not null check (char_length(subject) between 3 and 200),
  message text not null check (char_length(message) between 10 and 5000),
  status text not null default 'new' check (status in ('new', 'handled', 'spam')),
  user_id uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Rate limiting (fixed window, shared across server instances)
-- ---------------------------------------------------------------------------
create table public.rate_limits (
  bucket text not null,
  window_start timestamptz not null,
  hits int not null default 0,
  primary key (bucket, window_start)
);

create or replace function app.rate_limit(p_bucket text, p_max int, p_window_seconds int)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits int;
begin
  insert into public.rate_limits (bucket, window_start, hits) values (p_bucket, v_window, 1)
  on conflict (bucket, window_start) do update set hits = public.rate_limits.hits + 1
  returning hits into v_hits;
  return v_hits <= p_max;
end $$;

-- ---------------------------------------------------------------------------
-- AI usage log — metadata only, never prompt or document content.
-- ---------------------------------------------------------------------------
create table public.ai_usage_logs (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles (id) on delete set null,
  feature text not null,
  provider text not null,
  model text,
  matter_id uuid references public.legal_matters (id) on delete set null,
  document_id uuid references public.documents (id) on delete set null,
  input_tokens int,
  output_tokens int,
  status text not null check (status in ('ok', 'error', 'blocked', 'unavailable')),
  error_code text,
  created_at timestamptz not null default now()
);
create index ai_usage_logs_user_idx on public.ai_usage_logs (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Document access now also covers dispute evidence for admins.
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
    if app.is_admin() and (
         v_doc.category = 'credential'
         or exists (select 1 from public.dispute_evidence de where de.document_id = p_document_id)) then
      return true;
    end if;
    if exists (select 1 from public.dispute_evidence de where de.document_id = p_document_id
               and app.is_dispute_party(de.dispute_id)) then
      return true;
    end if;
  end if;
  return false;
end $$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.platform_settings enable row level security;
alter table public.audit_logs enable row level security;
alter table public.notification_templates enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_deliveries enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.reviews enable row level security;
alter table public.review_reports enable row level security;
alter table public.support_tickets enable row level security;
alter table public.support_ticket_messages enable row level security;
alter table public.disputes enable row level security;
alter table public.dispute_messages enable row level security;
alter table public.dispute_evidence enable row level security;
alter table public.cms_pages enable row level security;
alter table public.legal_articles enable row level security;
alter table public.faqs enable row level security;
alter table public.banners enable row level security;
alter table public.contact_messages enable row level security;
alter table public.rate_limits enable row level security;
alter table public.ai_usage_logs enable row level security;

create policy settings_public_read on public.platform_settings for select to anon, authenticated
  using (is_public or app.is_admin());
create policy settings_super_admin on public.platform_settings for all to authenticated
  using (app.is_super_admin() or (app.is_admin() and key not in ('integrations', 'security')))
  with check (app.is_super_admin() or (app.is_admin() and key not in ('integrations', 'security')));

create policy audit_admin_read on public.audit_logs for select to authenticated using (app.is_admin());

create policy notification_templates_read on public.notification_templates for select to authenticated using (app.is_admin());
create policy notification_templates_admin on public.notification_templates for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

create policy notifications_own on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_mark_read on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_delete_own on public.notifications for delete to authenticated using (user_id = auth.uid());

create policy deliveries_admin on public.notification_deliveries for select to authenticated using (app.is_admin());

create policy notification_prefs_own on public.notification_preferences for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy reviews_public_read on public.reviews for select to anon, authenticated
  using ((status = 'published' and app.is_public_lawyer(lawyer_id)) or client_id = auth.uid() or lawyer_id = auth.uid() or app.is_platform_staff());
create policy reviews_lawyer_respond on public.reviews for update to authenticated
  using (lawyer_id = auth.uid() or app.is_admin()) with check (lawyer_id = auth.uid() or app.is_admin());

create policy review_reports_insert on public.review_reports for insert to authenticated
  with check (reporter_id = auth.uid());
create policy review_reports_read on public.review_reports for select to authenticated
  using (reporter_id = auth.uid() or app.is_platform_staff());
create policy review_reports_admin on public.review_reports for update to authenticated
  using (app.is_admin()) with check (app.is_admin());

create policy tickets_read on public.support_tickets for select to authenticated
  using (requester_id = auth.uid() or app.is_platform_staff());
create policy tickets_insert on public.support_tickets for insert to authenticated
  with check (requester_id = auth.uid() and status = 'open' and assigned_to is null);
create policy tickets_staff_update on public.support_tickets for update to authenticated
  using (app.is_platform_staff()) with check (app.is_platform_staff());

create policy ticket_messages_read on public.support_ticket_messages for select to authenticated
  using (app.is_platform_staff()
         or (not is_internal and exists (select 1 from public.support_tickets t where t.id = ticket_id and t.requester_id = auth.uid())));
create policy ticket_messages_insert on public.support_ticket_messages for insert to authenticated
  with check (author_id = auth.uid() and (
    app.is_platform_staff()
    or (not is_internal and exists (select 1 from public.support_tickets t where t.id = ticket_id
                                    and t.requester_id = auth.uid() and t.status <> 'closed'))));

create policy disputes_read on public.disputes for select to authenticated
  using (raised_by = auth.uid() or against_user_id = auth.uid() or app.is_admin());
create policy dispute_messages_read on public.dispute_messages for select to authenticated
  using (app.is_dispute_party(dispute_id) or app.is_admin());
create policy dispute_messages_insert on public.dispute_messages for insert to authenticated
  with check (author_id = auth.uid() and (app.is_dispute_party(dispute_id) or app.is_admin()));
create policy dispute_evidence_read on public.dispute_evidence for select to authenticated
  using (app.is_dispute_party(dispute_id) or app.is_admin());
create policy dispute_evidence_insert on public.dispute_evidence for insert to authenticated
  with check (added_by = auth.uid() and app.is_dispute_party(dispute_id)
              and exists (select 1 from public.documents d where d.id = document_id and d.owner_id = auth.uid()));

create policy cms_pages_read on public.cms_pages for select to anon, authenticated
  using (status = 'published' or app.is_admin());
create policy cms_pages_admin on public.cms_pages for all to authenticated
  using (app.is_admin()) with check (app.is_admin());
create policy articles_read on public.legal_articles for select to anon, authenticated
  using (status = 'published' or app.is_admin() or author_id = auth.uid());
create policy articles_admin on public.legal_articles for all to authenticated
  using (app.is_admin()) with check (app.is_admin());
create policy faqs_read on public.faqs for select to anon, authenticated
  using (is_published or app.is_admin());
create policy faqs_admin on public.faqs for all to authenticated
  using (app.is_admin()) with check (app.is_admin());
create policy banners_read on public.banners for select to anon, authenticated
  using ((is_active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now())) or app.is_admin());
create policy banners_admin on public.banners for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

create policy contact_staff_read on public.contact_messages for select to authenticated using (app.is_platform_staff());
create policy contact_staff_update on public.contact_messages for update to authenticated
  using (app.is_platform_staff()) with check (app.is_platform_staff());
-- Inserts happen through public.submit_contact_message() (rate limited).

create policy ai_usage_own on public.ai_usage_logs for select to authenticated
  using (user_id = auth.uid() or app.is_admin());
