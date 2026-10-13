-- =============================================================================
-- Core workflows (security-definer RPCs). Every function authorises the caller
-- explicitly via auth.uid() before touching data.
-- =============================================================================

create or replace function app.setting(p_key text, p_path text, p_default text)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select value ->> p_path from public.platform_settings where key = p_key), p_default);
$$;

create or replace function app.require_user()
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if not exists (select 1 from public.profiles where id = v_uid and status = 'active') then
    raise exception 'Account is not active' using errcode = '42501';
  end if;
  return v_uid;
end $$;

create or replace function app.slugify(p_text text)
returns text language sql immutable as $$
  select trim(both '-' from regexp_replace(lower(coalesce(p_text, '')), '[^a-z0-9]+', '-', 'g'));
$$;

create or replace function app.unique_lawyer_slug(p_base text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_base text := nullif(app.slugify(p_base), '');
  v_slug text;
  i int := 0;
begin
  v_base := coalesce(v_base, 'lawyer');
  v_slug := v_base;
  while exists (select 1 from public.lawyer_profiles where slug = v_slug) loop
    i := i + 1;
    v_slug := v_base || '-' || substr(md5(random()::text), 1, 5);
    exit when i > 20;
  end loop;
  return v_slug;
end $$;

-- ---------------------------------------------------------------------------
-- Sign-up: create profile, settings and the self-service role.
-- Only 'client' or 'lawyer' can be requested; every other role is granted by admins.
-- ---------------------------------------------------------------------------
create or replace function app.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}');
  v_type text := coalesce(v_meta ->> 'account_type', 'client');
  v_name text := left(coalesce(nullif(trim(v_meta ->> 'full_name'), ''), split_part(new.email, '@', 1), ''), 120);
  v_locale text := case when v_meta ->> 'locale' = 'en' then 'en' else 'ar' end;
  v_phone text := nullif(regexp_replace(coalesce(v_meta ->> 'phone', ''), '[^0-9+]', '', 'g'), '');
begin
  if v_phone is not null and v_phone !~ '^\+?[0-9]{8,15}$' then
    v_phone := null;
  end if;
  insert into public.profiles (id, full_name, phone, locale, terms_accepted_at, privacy_consent_at, marketing_consent)
  values (new.id, v_name, v_phone, v_locale,
          case when (v_meta ->> 'terms_accepted')::boolean then now() end,
          case when (v_meta ->> 'terms_accepted')::boolean then now() end,
          coalesce((v_meta ->> 'marketing_consent')::boolean, false))
  on conflict (id) do nothing;
  insert into public.user_settings (user_id) values (new.id) on conflict do nothing;

  if v_type = 'lawyer' then
    insert into public.user_roles (user_id, role) values (new.id, 'lawyer') on conflict do nothing;
    insert into public.lawyer_profiles (id, slug, display_name_ar, display_name_en)
    values (new.id, app.unique_lawyer_slug(coalesce(v_meta ->> 'name_en', 'lawyer')), v_name, nullif(v_meta ->> 'name_en', ''))
    on conflict do nothing;
    insert into public.lawyer_private_details (lawyer_id) values (new.id) on conflict do nothing;
  else
    insert into public.user_roles (user_id, role) values (new.id, 'client') on conflict do nothing;
  end if;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function app.handle_new_user();

-- Current user context for the UI (roles, firm memberships, lawyer status).
create or replace function public.my_context()
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when auth.uid() is null then null else jsonb_build_object(
    'user_id', p.id,
    'full_name', p.full_name,
    'locale', p.locale,
    'status', p.status,
    'roles', coalesce((select jsonb_agg(role order by role) from public.user_roles where user_id = p.id), '[]'),
    'lawyer', (select jsonb_build_object('slug', l.slug, 'verification_status', l.verification_status,
                                         'is_published', l.is_published, 'primary_firm_id', l.primary_firm_id)
                 from public.lawyer_profiles l where l.id = p.id),
    'firms', coalesce((select jsonb_agg(jsonb_build_object('firm_id', m.firm_id, 'member_id', m.id, 'name', f.name_ar,
                                         'name_en', f.name_en, 'member_type', m.member_type, 'slug', f.slug))
                         from public.law_firm_members m join public.law_firms f on f.id = m.firm_id
                        where m.user_id = p.id and m.status = 'active'), '[]'),
    'pending_invitations', (select count(*) from public.law_firm_members m where m.user_id = p.id and m.status = 'invited')
  ) end
  from public.profiles p where p.id = auth.uid();
$$;

-- Effective firm permissions for the current user (UI gating; enforcement stays in RLS).
create or replace function public.my_firm_permissions(p_firm_id uuid)
returns text[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(code), '{}') from unnest(app.firm_permission_codes()) code
   where app.firm_has_permission(p_firm_id, code);
$$;

-- ---------------------------------------------------------------------------
-- Admin: roles and account status
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_role(p_user_id uuid, p_role public.app_role, p_grant boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_user();
  if p_role in ('admin', 'super_admin', 'support') then
    if not app.is_super_admin() then
      raise exception 'Only super admins can manage administrative roles' using errcode = '42501';
    end if;
  elsif not app.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() and not p_grant and p_role in ('admin', 'super_admin') then
    raise exception 'You cannot remove your own administrative role' using errcode = '42501';
  end if;
  if p_grant then
    insert into public.user_roles (user_id, role, granted_by) values (p_user_id, p_role, auth.uid()) on conflict do nothing;
  else
    delete from public.user_roles where user_id = p_user_id and role = p_role;
  end if;
end $$;

create or replace function public.admin_set_account_status(p_user_id uuid, p_status public.account_status, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_user();
  if not app.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'You cannot change your own account status' using errcode = '42501';
  end if;
  if exists (select 1 from public.user_roles where user_id = p_user_id and role in ('admin', 'super_admin'))
     and not app.is_super_admin() then
    raise exception 'Only super admins can change administrator accounts' using errcode = '42501';
  end if;
  if p_status = 'suspended' and coalesce(trim(p_reason), '') = '' then
    raise exception 'A reason is required' using errcode = '22023';
  end if;
  update public.profiles set status = p_status, suspended_reason = case when p_status = 'suspended' then p_reason end
   where id = p_user_id;
  -- Suspended lawyers disappear from the marketplace.
  if p_status <> 'active' then
    update public.lawyer_profiles set is_published = false where id = p_user_id;
  end if;
  perform app.audit('account.status_changed', 'profile', p_user_id::text, jsonb_build_object('status', p_status, 'reason', p_reason));
end $$;

create or replace function public.request_account_deletion()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := app.require_user();
begin
  update public.profiles set status = 'pending_deletion', deletion_requested_at = now() where id = v_uid;
  update public.lawyer_profiles set is_published = false where id = v_uid;
  perform app.audit('account.deletion_requested', 'profile', v_uid::text, '{}');
end $$;

create or replace function public.cancel_account_deletion()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  update public.profiles set status = 'active', deletion_requested_at = null
   where id = auth.uid() and status = 'pending_deletion';
end $$;

-- ---------------------------------------------------------------------------
-- Lawyer verification
-- ---------------------------------------------------------------------------
create or replace function public.submit_lawyer_verification(p_bar_number text, p_note text, p_credential_ids uuid[])
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := app.require_user();
  v_id uuid;
  v_status public.verification_status;
begin
  select verification_status into v_status from public.lawyer_profiles where id = v_uid;
  if v_status is null then
    raise exception 'Lawyer profile not found' using errcode = 'P0002';
  end if;
  if v_status in ('pending', 'verified') then
    raise exception 'Verification is already %', v_status using errcode = '22023';
  end if;
  if v_status = 'suspended' then
    raise exception 'Account verification is suspended; contact support' using errcode = '42501';
  end if;
  if coalesce(trim(p_bar_number), '') !~ '^[0-9A-Za-z/-]{3,30}$' then
    raise exception 'Invalid bar registration number' using errcode = '22023';
  end if;
  if coalesce(array_length(p_credential_ids, 1), 0) = 0 then
    raise exception 'At least one credential document is required' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(p_credential_ids) cid
             where not exists (select 1 from public.lawyer_credentials c
                               where c.id = cid and c.lawyer_id = v_uid and c.document_id is not null)) then
    raise exception 'Credentials must belong to you and include a document' using errcode = '22023';
  end if;

  insert into public.lawyer_private_details (lawyer_id, bar_registration_number) values (v_uid, trim(p_bar_number))
  on conflict (lawyer_id) do update set bar_registration_number = excluded.bar_registration_number;

  insert into public.lawyer_verification_requests (lawyer_id, bar_registration_number, submitted_note, credential_ids)
  values (v_uid, trim(p_bar_number), p_note, p_credential_ids) returning id into v_id;
  update public.lawyer_profiles set verification_status = 'pending' where id = v_uid;
  perform app.audit('verification.submitted', 'lawyer_verification_request', v_id::text, '{}');
  return v_id;
end $$;

create or replace function public.review_lawyer_verification(p_request_id uuid, p_approve boolean, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_req public.lawyer_verification_requests%rowtype;
  v_show boolean;
begin
  perform app.require_user();
  if not app.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  select * into v_req from public.lawyer_verification_requests where id = p_request_id for update;
  if not found or v_req.status <> 'pending' then
    raise exception 'Request is not pending' using errcode = '22023';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'A documented reason is required' using errcode = '22023';
  end if;

  update public.lawyer_verification_requests
     set status = case when p_approve then 'verified'::public.verification_status else 'rejected'::public.verification_status end,
         reviewed_by = auth.uid(), reviewed_at = now(), decision_reason = p_reason
   where id = p_request_id;

  if p_approve then
    select show_bar_number into v_show from public.lawyer_profiles where id = v_req.lawyer_id;
    update public.lawyer_profiles
       set verification_status = 'verified', verified_at = now(),
           bar_number_public = case when v_show then v_req.bar_registration_number end
     where id = v_req.lawyer_id;
    update public.lawyer_credentials set is_verified = true
     where lawyer_id = v_req.lawyer_id and id = any (v_req.credential_ids);
    perform app.notify(v_req.lawyer_id, 'verification.approved', '{}', '/lawyer/profile', 'verification:' || p_request_id);
  else
    update public.lawyer_profiles set verification_status = 'rejected', verified_at = null, is_published = false
     where id = v_req.lawyer_id;
    perform app.notify(v_req.lawyer_id, 'verification.rejected', jsonb_build_object('reason', p_reason), '/lawyer/verification', 'verification:' || p_request_id);
  end if;
  perform app.audit(case when p_approve then 'verification.approved' else 'verification.rejected' end,
                    'lawyer_verification_request', p_request_id::text,
                    jsonb_build_object('lawyer_id', v_req.lawyer_id, 'reason', p_reason));
end $$;

create or replace function public.admin_update_lawyer_status(p_lawyer_id uuid, p_status public.verification_status, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_user();
  if not app.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if p_status not in ('suspended', 'verified', 'unverified') or coalesce(trim(p_reason), '') = '' then
    raise exception 'Invalid status change' using errcode = '22023';
  end if;
  update public.lawyer_profiles
     set verification_status = p_status,
         is_published = case when p_status = 'verified' then is_published else false end,
         verified_at = case when p_status = 'verified' then coalesce(verified_at, now()) else null end
   where id = p_lawyer_id;
  perform app.audit('lawyer.status_changed', 'lawyer_profile', p_lawyer_id::text, jsonb_build_object('status', p_status, 'reason', p_reason));
end $$;

create or replace function public.admin_set_lawyer_placement(p_lawyer_id uuid, p_featured boolean, p_sponsored_until timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_user();
  if not app.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  update public.lawyer_profiles set is_featured = p_featured, sponsored_until = p_sponsored_until where id = p_lawyer_id;
  perform app.audit('lawyer.placement_changed', 'lawyer_profile', p_lawyer_id::text,
                    jsonb_build_object('featured', p_featured, 'sponsored_until', p_sponsored_until));
end $$;

-- Cached listing fields used for sorting/filtering in search.
create or replace function app.refresh_lawyer_listing(p_lawyer_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_next timestamptz;
  v_type public.consultation_kind;
  v_slot timestamptz;
  v_today date;
  v_tz text;
begin
  select timezone into v_tz from public.lawyer_profiles where id = p_lawyer_id;
  if v_tz is null then
    return;
  end if;
  v_today := (now() at time zone v_tz)::date;
  for v_type in select consultation_type from public.lawyer_consultation_offerings o
                 join public.consultation_types t on t.code = o.consultation_type
                where o.lawyer_id = p_lawyer_id and o.is_active and t.is_scheduled loop
    select min(s.starts_at) into v_slot from public.get_available_slots(p_lawyer_id, v_type, v_today, v_today + 30) s;
    if v_slot is not null and (v_next is null or v_slot < v_next) then
      v_next := v_slot;
    end if;
  end loop;
  update public.lawyer_profiles
     set next_available_at = v_next,
         min_price_minor = (select min(price_minor) from public.lawyer_consultation_offerings o
                             where o.lawyer_id = p_lawyer_id and o.is_active)
   where id = p_lawyer_id;
end $$;

create or replace function app.on_schedule_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform app.refresh_lawyer_listing(coalesce(new.lawyer_id, old.lawyer_id));
  return null;
end $$;
create trigger lawyer_availability_listing after insert or update or delete on public.lawyer_availability
  for each row execute function app.on_schedule_change();
create trigger lawyer_exceptions_listing after insert or update or delete on public.lawyer_availability_exceptions
  for each row execute function app.on_schedule_change();
create trigger lawyer_offerings_listing after insert or update or delete on public.lawyer_consultation_offerings
  for each row execute function app.on_schedule_change();

-- ---------------------------------------------------------------------------
-- Law firms
-- ---------------------------------------------------------------------------
create or replace function public.create_law_firm(p_name_ar text, p_name_en text, p_slug text, p_governorate_id int, p_city_id int)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := app.require_user();
  v_firm uuid;
  v_slug text := app.slugify(coalesce(nullif(p_slug, ''), p_name_en));
begin
  if char_length(coalesce(trim(p_name_ar), '')) < 3 then
    raise exception 'Firm name is required' using errcode = '22023';
  end if;
  if v_slug = '' then
    v_slug := 'firm-' || substr(md5(random()::text), 1, 6);
  end if;
  if exists (select 1 from public.law_firms where slug = v_slug) then
    v_slug := v_slug || '-' || substr(md5(random()::text), 1, 4);
  end if;
  insert into public.law_firms (slug, name_ar, name_en, owner_id, governorate_id, city_id)
  values (v_slug, trim(p_name_ar), nullif(trim(p_name_en), ''), v_uid, p_governorate_id, p_city_id)
  returning id into v_firm;

  insert into public.law_firm_roles (firm_id, name, permissions, is_default) values
    (v_firm, 'Partner', app.firm_permission_codes(), false),
    (v_firm, 'Associate', array['matters.view', 'matters.edit', 'documents.view', 'documents.upload', 'appointments.manage', 'clients.manage'], true),
    (v_firm, 'Paralegal', array['matters.view', 'documents.view', 'documents.upload'], false),
    (v_firm, 'Accountant', array['invoices.view', 'invoices.manage', 'reports.financial'], false);

  insert into public.law_firm_members (firm_id, user_id, member_type, status, joined_at, role_id)
  values (v_firm, v_uid, 'owner', 'active', now(),
          (select id from public.law_firm_roles where firm_id = v_firm and name = 'Partner'));
  insert into public.user_roles (user_id, role) values (v_uid, 'firm_owner') on conflict do nothing;
  perform app.audit('firm.created', 'law_firm', v_firm::text, '{}');
  return v_firm;
end $$;

create or replace function public.invite_firm_member(p_firm_id uuid, p_email text, p_member_type public.firm_member_type, p_role_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := app.require_user();
  v_user uuid;
  v_id uuid;
  v_plan uuid;
  v_feat record;
  v_count int;
begin
  if not app.firm_has_permission(p_firm_id, 'members.manage') then
    raise exception 'Not allowed to manage members' using errcode = '42501';
  end if;
  if p_member_type = 'owner' then
    raise exception 'Ownership cannot be granted by invitation' using errcode = '22023';
  end if;
  if p_role_id is not null and not exists (select 1 from public.law_firm_roles where id = p_role_id and firm_id = p_firm_id) then
    raise exception 'Role does not belong to this firm' using errcode = '22023';
  end if;
  -- Seat limits from the firm's plan.
  v_plan := app.effective_plan_for_firm(p_firm_id);
  if v_plan is null then
    raise exception 'An active firm subscription is required to add members' using errcode = 'P0001', hint = 'subscription_required';
  end if;
  select * into v_feat from app.plan_feature(v_plan, case when p_member_type = 'lawyer' then 'firm.lawyers' else 'firm.staff' end);
  if not v_feat.enabled then
    raise exception 'Your plan does not include this member type' using errcode = 'P0001', hint = 'plan_limit';
  end if;
  select count(*) into v_count from public.law_firm_members
   where firm_id = p_firm_id and member_type = p_member_type and status in ('active', 'invited');
  if v_feat.limit_value is not null and v_count >= v_feat.limit_value then
    raise exception 'Plan seat limit reached' using errcode = 'P0001', hint = 'plan_limit';
  end if;

  select id into v_user from auth.users where lower(email) = lower(trim(p_email));
  if v_user is not null and exists (select 1 from public.law_firm_members where firm_id = p_firm_id and user_id = v_user and status in ('active', 'invited')) then
    raise exception 'This person is already a member or invited' using errcode = '23505';
  end if;
  insert into public.law_firm_members (firm_id, user_id, invited_email, member_type, role_id, status, invited_by)
  values (p_firm_id, v_user, lower(trim(p_email)), p_member_type, p_role_id, 'invited', v_uid)
  returning id into v_id;
  if v_user is not null then
    perform app.notify(v_user, 'firm.invitation', jsonb_build_object('firm', (select name_ar from public.law_firms where id = p_firm_id)),
                       '/dashboard/invitations', 'firm-invite:' || v_id);
  end if;
  perform app.audit('firm.member_invited', 'law_firm_member', v_id::text, jsonb_build_object('firm_id', p_firm_id, 'type', p_member_type));
  return v_id;
end $$;

-- Links pending email invitations to a newly registered account.
create or replace function public.claim_firm_invitations()
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := app.require_user();
  v_email text;
  v_count int;
begin
  select lower(email) into v_email from auth.users where id = v_uid and email_confirmed_at is not null;
  if v_email is null then
    return 0;
  end if;
  update public.law_firm_members set user_id = v_uid
   where user_id is null and invited_email = v_email and status = 'invited'
     and not exists (select 1 from public.law_firm_members m2 where m2.firm_id = law_firm_members.firm_id and m2.user_id = v_uid);
  get diagnostics v_count = row_count;
  return v_count;
end $$;

create or replace function public.respond_firm_invitation(p_member_id uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := app.require_user();
  v_m public.law_firm_members%rowtype;
begin
  select * into v_m from public.law_firm_members where id = p_member_id for update;
  if not found or v_m.user_id is distinct from v_uid or v_m.status <> 'invited' then
    raise exception 'Invitation not found' using errcode = 'P0002';
  end if;
  if not p_accept then
    update public.law_firm_members set status = 'removed' where id = p_member_id;
    return;
  end if;
  if v_m.member_type = 'lawyer' and not app.has_role('lawyer') then
    raise exception 'A lawyer account is required to join as a lawyer' using errcode = '42501';
  end if;
  update public.law_firm_members set status = 'active', joined_at = now() where id = p_member_id;
  if v_m.member_type = 'staff' then
    insert into public.user_roles (user_id, role) values (v_uid, 'firm_staff') on conflict do nothing;
  end if;
  perform app.audit('firm.member_joined', 'law_firm_member', p_member_id::text, jsonb_build_object('firm_id', v_m.firm_id));
end $$;

create or replace function public.update_firm_member(
  p_member_id uuid, p_role_id uuid, p_status public.membership_status, p_branch_id uuid, p_department_id uuid, p_title text
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_m public.law_firm_members%rowtype;
begin
  perform app.require_user();
  select * into v_m from public.law_firm_members where id = p_member_id for update;
  if not found or not app.firm_has_permission(v_m.firm_id, 'members.manage') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if v_m.member_type = 'owner' then
    raise exception 'The owner membership cannot be changed' using errcode = '42501';
  end if;
  if p_role_id is not null and not exists (select 1 from public.law_firm_roles where id = p_role_id and firm_id = v_m.firm_id) then
    raise exception 'Role does not belong to this firm' using errcode = '22023';
  end if;
  if p_branch_id is not null and not exists (select 1 from public.law_firm_branches where id = p_branch_id and firm_id = v_m.firm_id) then
    raise exception 'Branch does not belong to this firm' using errcode = '22023';
  end if;
  if p_department_id is not null and not exists (select 1 from public.law_firm_departments where id = p_department_id and firm_id = v_m.firm_id) then
    raise exception 'Department does not belong to this firm' using errcode = '22023';
  end if;
  if p_status = 'active' and v_m.status = 'invited' then
    raise exception 'Invitations must be accepted by the invitee' using errcode = '22023';
  end if;
  update public.law_firm_members
     set role_id = p_role_id, status = coalesce(p_status, status), branch_id = p_branch_id,
         department_id = p_department_id, title = p_title
   where id = p_member_id;
  if p_status = 'removed' and v_m.user_id is not null then
    update public.lawyer_profiles set primary_firm_id = null where id = v_m.user_id and primary_firm_id = v_m.firm_id;
    delete from public.matter_members mm using public.legal_matters m
     where mm.matter_id = m.id and m.firm_id = v_m.firm_id and mm.user_id = v_m.user_id;
  end if;
  perform app.audit('firm.member_updated', 'law_firm_member', p_member_id::text,
                    jsonb_build_object('role_id', p_role_id, 'status', p_status));
end $$;

create or replace function public.set_primary_firm(p_firm_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := app.require_user();
begin
  if p_firm_id is not null and not exists (
       select 1 from public.law_firm_members where firm_id = p_firm_id and user_id = v_uid
         and status = 'active' and member_type in ('owner', 'lawyer')) then
    raise exception 'You are not a lawyer in this firm' using errcode = '42501';
  end if;
  update public.lawyer_profiles set primary_firm_id = p_firm_id where id = v_uid;
end $$;

-- ---------------------------------------------------------------------------
-- Booking
-- ---------------------------------------------------------------------------
create or replace function app.ensure_appointment_conversation(p_appointment_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_a public.appointments%rowtype;
begin
  select id into v_id from public.conversations where appointment_id = p_appointment_id;
  if v_id is not null then
    return v_id;
  end if;
  select * into v_a from public.appointments where id = p_appointment_id;
  insert into public.conversations (kind, appointment_id, firm_id, subject, created_by)
  values ('appointment', p_appointment_id, v_a.firm_id, v_a.reference, v_a.client_id)
  returning id into v_id;
  insert into public.conversation_participants (conversation_id, user_id, role) values
    (v_id, v_a.client_id, 'client'), (v_id, v_a.lawyer_id, 'lawyer')
  on conflict do nothing;
  return v_id;
end $$;

create or replace function app.log_appointment_event(
  p_appointment_id uuid, p_event text, p_from public.appointment_status, p_to public.appointment_status, p_details jsonb default '{}'
)
returns void language sql security definer set search_path = '' as $$
  insert into public.appointment_events (appointment_id, actor_id, event_type, from_status, to_status, details)
  values (p_appointment_id, auth.uid(), p_event, p_from, p_to, coalesce(p_details, '{}'));
$$;

create or replace function app.appointment_notify_params(p_appointment_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'reference', a.reference,
    'lawyer', l.display_name_ar,
    'client', p.full_name,
    'date', to_char(a.starts_at at time zone l.timezone, 'YYYY-MM-DD'),
    'time', to_char(a.starts_at at time zone l.timezone, 'HH24:MI'),
    'type', t.name_ar)
  from public.appointments a
  join public.lawyer_profiles l on l.id = a.lawyer_id
  join public.profiles p on p.id = a.client_id
  join public.consultation_types t on t.code = a.consultation_type
  where a.id = p_appointment_id;
$$;

create or replace function public.book_appointment(
  p_lawyer_id uuid,
  p_consultation_type public.consultation_kind,
  p_starts_at timestamptz,
  p_issue_summary text,
  p_category_id uuid default null,
  p_office_id uuid default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := app.require_user();
  v_lawyer public.lawyer_profiles%rowtype;
  v_offer public.lawyer_consultation_offerings%rowtype;
  v_type public.consultation_types%rowtype;
  v_starts timestamptz;
  v_ends timestamptz;
  v_status public.appointment_status;
  v_id uuid;
  v_feat record;
  v_month_count int;
  v_hold_minutes int := app.setting('booking', 'payment_hold_minutes', '15')::int;
  v_office uuid := p_office_id;
begin
  if not app.has_role('client') then
    raise exception 'Only client accounts can book consultations' using errcode = '42501';
  end if;
  if v_uid = p_lawyer_id then
    raise exception 'You cannot book yourself' using errcode = '22023';
  end if;
  if not app.rate_limit('book:' || v_uid, 10, 3600) then
    raise exception 'Too many booking attempts, try again later' using errcode = 'P0001', hint = 'rate_limited';
  end if;
  if char_length(coalesce(trim(p_issue_summary), '')) < 20 then
    raise exception 'Please describe your legal issue (at least 20 characters)' using errcode = '22023';
  end if;

  -- Serialise bookings per lawyer so buffer/daily-cap checks are race-free.
  perform pg_advisory_xact_lock(hashtextextended('booking:' || p_lawyer_id::text, 0));

  -- Release stale payment holds for this lawyer first.
  update public.appointments set status = 'EXPIRED'
   where lawyer_id = p_lawyer_id and status = 'PENDING_PAYMENT' and hold_expires_at < now();

  if not app.is_public_lawyer(p_lawyer_id) then
    raise exception 'This lawyer is not accepting bookings' using errcode = '22023';
  end if;
  select * into v_lawyer from public.lawyer_profiles where id = p_lawyer_id;
  select * into v_offer from public.lawyer_consultation_offerings
   where lawyer_id = p_lawyer_id and consultation_type = p_consultation_type and is_active;
  if not found then
    raise exception 'This consultation type is not offered' using errcode = '22023';
  end if;
  select * into v_type from public.consultation_types where code = p_consultation_type and is_active;
  if not found then
    raise exception 'Consultation type unavailable' using errcode = '22023';
  end if;

  -- Plan allowance (bookings per calendar month in Cairo time).
  select * into v_feat from app.plan_feature(app.effective_plan_for_lawyer(p_lawyer_id), 'bookings.monthly');
  if not v_feat.enabled then
    raise exception 'This lawyer cannot accept online bookings at the moment' using errcode = 'P0001', hint = 'plan_limit';
  end if;
  if v_feat.limit_value is not null then
    select count(*) into v_month_count from public.appointments
     where lawyer_id = p_lawyer_id
       and status not in ('DRAFT', 'EXPIRED')
       and date_trunc('month', created_at at time zone 'Africa/Cairo') = date_trunc('month', now() at time zone 'Africa/Cairo');
    if v_month_count >= v_feat.limit_value then
      raise exception 'This lawyer has reached the monthly booking limit' using errcode = 'P0001', hint = 'plan_limit';
    end if;
  end if;

  if v_type.is_scheduled then
    if p_starts_at is null then
      raise exception 'A time slot is required' using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.get_available_slots(p_lawyer_id, p_consultation_type,
                    (p_starts_at at time zone v_lawyer.timezone)::date,
                    (p_starts_at at time zone v_lawyer.timezone)::date) s
       where s.starts_at = p_starts_at) then
      raise exception 'The selected slot is no longer available' using errcode = 'P0001', hint = 'slot_unavailable';
    end if;
    v_starts := p_starts_at;
    v_ends := p_starts_at + make_interval(mins => v_offer.duration_minutes);
  else
    -- Asynchronous written opinion: due date, no calendar slot.
    v_starts := now();
    v_ends := now() + make_interval(days => app.setting('booking', 'written_opinion_days', '3')::int);
  end if;

  if p_consultation_type = 'in_person' then
    if v_office is null then
      select id into v_office from public.lawyer_offices where lawyer_id = p_lawyer_id and is_active order by created_at limit 1;
    end if;
    if v_office is null or not exists (select 1 from public.lawyer_offices where id = v_office and lawyer_id = p_lawyer_id and is_active) then
      raise exception 'No office is available for in-person consultations' using errcode = '22023';
    end if;
  else
    v_office := null;
  end if;

  if v_offer.price_minor > 0 then
    v_status := 'PENDING_PAYMENT';
  elsif v_lawyer.auto_confirm then
    v_status := 'CONFIRMED';
  else
    v_status := 'PENDING_CONFIRMATION';
  end if;

  begin
    insert into public.appointments (lawyer_id, client_id, firm_id, consultation_type, category_id, status,
                                     starts_at, ends_at, occupies_slot, office_id, issue_summary, price_minor,
                                     hold_expires_at, confirmed_at)
    values (p_lawyer_id, v_uid, v_lawyer.primary_firm_id, p_consultation_type, p_category_id, v_status,
            v_starts, v_ends, v_type.is_scheduled, v_office, trim(p_issue_summary), v_offer.price_minor,
            case when v_status = 'PENDING_PAYMENT' then now() + make_interval(mins => v_hold_minutes) end,
            case when v_status = 'CONFIRMED' then now() end)
    returning id into v_id;
  exception when exclusion_violation then
    raise exception 'The selected slot is no longer available' using errcode = 'P0001', hint = 'slot_unavailable';
  end;

  insert into public.appointment_participants (appointment_id, user_id, role) values
    (v_id, v_uid, 'client'), (v_id, p_lawyer_id, 'lawyer');
  perform app.log_appointment_event(v_id, 'created', null, v_status, jsonb_build_object('price_minor', v_offer.price_minor));
  perform app.ensure_appointment_conversation(v_id);

  if v_status <> 'PENDING_PAYMENT' then
    perform app.on_appointment_booked(v_id);
  end if;
  perform app.refresh_lawyer_listing(p_lawyer_id);
  return v_id;
end $$;

-- Notifications once a booking is real (free booking, or after payment).
create or replace function app.on_appointment_booked(p_appointment_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_a public.appointments%rowtype;
  v_params jsonb := app.appointment_notify_params(p_appointment_id);
begin
  select * into v_a from public.appointments where id = p_appointment_id;
  perform app.notify(v_a.lawyer_id, 'appointment.booked', v_params, '/lawyer/appointments/' || v_a.id, 'appt-booked:' || v_a.id);
  if v_a.status = 'CONFIRMED' then
    perform app.notify(v_a.client_id, 'appointment.confirmed', v_params, '/client/appointments/' || v_a.id, 'appt-confirmed:' || v_a.id);
  else
    perform app.notify(v_a.client_id, 'appointment.awaiting_confirmation', v_params, '/client/appointments/' || v_a.id, 'appt-awaiting:' || v_a.id);
  end if;
end $$;

-- Refund percentage for a cancelled appointment (mirrors src/lib/domain/refunds.ts).
create or replace function app.appointment_refund_percent(p_appointment_id uuid, p_actor text, p_at timestamptz default now())
returns int language plpgsql stable security definer set search_path = '' as $$
declare
  v_a public.appointments%rowtype;
  v_deadline int;
  v_late int := app.setting('refund_policy', 'late_cancel_refund_percent', '50')::int;
begin
  select * into v_a from public.appointments where id = p_appointment_id;
  if p_actor in ('lawyer', 'admin', 'system') then
    return 100;
  end if;
  if v_a.status in ('PENDING_PAYMENT', 'PENDING_CONFIRMATION', 'EXPIRED') then
    return 100;
  end if;
  if not v_a.occupies_slot then
    -- written opinion: refundable until the lawyer starts work
    return case when v_a.status = 'CONFIRMED' and v_a.started_at is null then 100 else 0 end;
  end if;
  select cancellation_deadline_hours into v_deadline from public.lawyer_profiles where id = v_a.lawyer_id;
  if v_a.starts_at - p_at >= make_interval(hours => v_deadline) then
    return 100;
  elsif v_a.starts_at > p_at then
    return greatest(0, least(100, v_late));
  end if;
  return 0;
end $$;

create or replace function public.transition_appointment(p_appointment_id uuid, p_to public.appointment_status, p_reason text default null)
returns public.appointment_status language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := app.require_user();
  v_a public.appointments%rowtype;
  v_actor text;
  v_allowed boolean := false;
  v_percent int;
  v_params jsonb;
  v_counterparty uuid;
begin
  select * into v_a from public.appointments where id = p_appointment_id for update;
  if not found then
    raise exception 'Appointment not found' using errcode = 'P0002';
  end if;

  if app.is_admin() then
    v_actor := 'admin';
  elsif v_a.lawyer_id = v_uid or (v_a.firm_id is not null and app.firm_has_permission(v_a.firm_id, 'appointments.manage')) then
    v_actor := 'lawyer';
  elsif v_a.client_id = v_uid then
    v_actor := 'client';
  else
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  if not app.appointment_transition_allowed(v_a.status, p_to) then
    raise exception 'Invalid appointment transition % -> %', v_a.status, p_to using errcode = '22023';
  end if;

  if v_actor = 'admin' then
    v_allowed := p_to not in ('REFUNDED', 'DISPUTED');  -- refunds/disputes have their own workflows
  elsif v_actor = 'client' then
    v_allowed := p_to = 'CANCELLED' and v_a.status in ('PENDING_PAYMENT', 'PENDING_CONFIRMATION', 'CONFIRMED');
  else
    v_allowed := case p_to
      when 'CONFIRMED' then v_a.status = 'PENDING_CONFIRMATION' and v_a.starts_at > now()
      when 'CANCELLED' then v_a.status in ('PENDING_CONFIRMATION', 'CONFIRMED')
      when 'IN_PROGRESS' then v_a.status = 'CONFIRMED' and v_a.occupies_slot
                              and now() >= v_a.starts_at - interval '15 minutes' and now() <= v_a.ends_at + interval '2 hours'
      when 'COMPLETED' then (v_a.status = 'IN_PROGRESS')
                            or (v_a.status = 'CONFIRMED' and (not v_a.occupies_slot or now() >= v_a.starts_at))
      when 'NO_SHOW' then v_a.status = 'CONFIRMED' and v_a.occupies_slot and now() >= v_a.starts_at + interval '15 minutes'
      else false
    end;
  end if;
  if not v_allowed then
    raise exception 'This action is not available right now' using errcode = '42501';
  end if;
  if p_to = 'CANCELLED' and v_actor <> 'client' and coalesce(trim(p_reason), '') = '' then
    raise exception 'A cancellation reason is required' using errcode = '22023';
  end if;

  if p_to = 'CANCELLED' then
    v_percent := app.appointment_refund_percent(p_appointment_id, v_actor);
  end if;

  update public.appointments set
    status = p_to,
    confirmed_at = case when p_to = 'CONFIRMED' then now() else confirmed_at end,
    started_at = case when p_to = 'IN_PROGRESS' then now() else started_at end,
    completed_at = case when p_to = 'COMPLETED' then now() else completed_at end,
    cancelled_at = case when p_to = 'CANCELLED' then now() else cancelled_at end,
    cancelled_by = case when p_to = 'CANCELLED' then v_uid else cancelled_by end,
    cancellation_reason = case when p_to in ('CANCELLED', 'NO_SHOW') then p_reason else cancellation_reason end,
    hold_expires_at = null
  where id = p_appointment_id;

  perform app.log_appointment_event(p_appointment_id, lower(p_to::text), v_a.status, p_to,
                                    jsonb_build_object('actor', v_actor, 'reason', p_reason, 'refund_percent', v_percent));

  v_params := app.appointment_notify_params(p_appointment_id) || jsonb_build_object('reason', coalesce(p_reason, ''));
  v_counterparty := case when v_actor = 'client' then v_a.lawyer_id else v_a.client_id end;

  if p_to = 'CONFIRMED' then
    perform app.notify(v_a.client_id, 'appointment.confirmed', v_params, '/client/appointments/' || v_a.id, 'appt-confirmed:' || v_a.id);
  elsif p_to = 'CANCELLED' then
    perform app.notify(v_counterparty, 'appointment.cancelled', v_params,
                       case when v_counterparty = v_a.client_id then '/client/appointments/' else '/lawyer/appointments/' end || v_a.id,
                       'appt-cancelled:' || v_a.id);
    if v_actor = 'admin' then
      perform app.notify(v_a.lawyer_id, 'appointment.cancelled', v_params, '/lawyer/appointments/' || v_a.id, 'appt-cancelled-l:' || v_a.id);
    end if;
    perform app.refund_appointment_payment(p_appointment_id, v_percent, coalesce(p_reason, 'cancellation'), v_uid);
  elsif p_to = 'IN_PROGRESS' then
    perform app.notify(v_a.client_id, 'appointment.started', v_params, '/consultation/' || v_a.id, 'appt-started:' || v_a.id);
  elsif p_to = 'COMPLETED' then
    update public.lawyer_profiles set completed_consultations = completed_consultations + 1 where id = v_a.lawyer_id;
    perform app.upsert_practice_client(v_a.lawyer_id, v_a.firm_id, v_a.client_id);
    perform app.notify(v_a.client_id, 'appointment.completed', v_params, '/client/appointments/' || v_a.id || '#review', 'appt-completed:' || v_a.id);
  elsif p_to = 'NO_SHOW' then
    perform app.notify(v_a.client_id, 'appointment.no_show', v_params, '/client/appointments/' || v_a.id, 'appt-noshow:' || v_a.id);
  end if;

  perform app.refresh_lawyer_listing(v_a.lawyer_id);
  return p_to;
end $$;

create or replace function app.upsert_practice_client(p_lawyer_id uuid, p_firm_id uuid, p_client_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_p public.profiles%rowtype;
begin
  select * into v_p from public.profiles where id = p_client_id;
  if p_firm_id is not null then
    select id into v_id from public.practice_clients where firm_id = p_firm_id and user_id = p_client_id;
    if v_id is null then
      insert into public.practice_clients (firm_id, user_id, full_name, phone, created_by)
      values (p_firm_id, p_client_id, coalesce(nullif(v_p.full_name, ''), 'Client'), v_p.phone, p_lawyer_id) returning id into v_id;
    end if;
  else
    select id into v_id from public.practice_clients where owner_lawyer_id = p_lawyer_id and user_id = p_client_id;
    if v_id is null then
      insert into public.practice_clients (owner_lawyer_id, user_id, full_name, phone, created_by)
      values (p_lawyer_id, p_client_id, coalesce(nullif(v_p.full_name, ''), 'Client'), v_p.phone, p_lawyer_id) returning id into v_id;
    end if;
  end if;
  return v_id;
end $$;

create or replace function public.reschedule_appointment(p_appointment_id uuid, p_new_starts_at timestamptz, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := app.require_user();
  v_a public.appointments%rowtype;
  v_lawyer public.lawyer_profiles%rowtype;
  v_is_lawyer boolean;
  v_max int := app.setting('booking', 'max_reschedules', '2')::int;
  v_duration interval;
  v_params jsonb;
begin
  select * into v_a from public.appointments where id = p_appointment_id for update;
  if not found then
    raise exception 'Appointment not found' using errcode = 'P0002';
  end if;
  v_is_lawyer := v_a.lawyer_id = v_uid or (v_a.firm_id is not null and app.firm_has_permission(v_a.firm_id, 'appointments.manage'));
  if not (v_is_lawyer or v_a.client_id = v_uid) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if v_a.status not in ('PENDING_CONFIRMATION', 'CONFIRMED') or not v_a.occupies_slot then
    raise exception 'This appointment cannot be rescheduled' using errcode = '22023';
  end if;
  select * into v_lawyer from public.lawyer_profiles where id = v_a.lawyer_id;
  if not v_is_lawyer then
    if v_a.reschedule_count >= v_max then
      raise exception 'Reschedule limit reached' using errcode = 'P0001', hint = 'reschedule_limit';
    end if;
    if v_a.starts_at - now() < make_interval(hours => v_lawyer.cancellation_deadline_hours) then
      raise exception 'Too late to reschedule this appointment' using errcode = 'P0001', hint = 'deadline_passed';
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('booking:' || v_a.lawyer_id::text, 0));
  v_duration := v_a.ends_at - v_a.starts_at;

  -- Same rules as get_available_slots, but ignoring this appointment's own current slot.
  if p_new_starts_at = v_a.starts_at
     or not app.slot_in_schedule(v_a.lawyer_id, v_a.consultation_type, p_new_starts_at)
     or exists (
       select 1 from public.appointments o
        where o.lawyer_id = v_a.lawyer_id and o.id <> v_a.id and o.occupies_slot
          and o.status in ('PENDING_PAYMENT', 'PENDING_CONFIRMATION', 'CONFIRMED', 'IN_PROGRESS')
          and not (o.status = 'PENDING_PAYMENT' and o.hold_expires_at < now())
          and o.slot && tstzrange(p_new_starts_at - make_interval(mins => v_lawyer.buffer_minutes),
                                  p_new_starts_at + v_duration + make_interval(mins => v_lawyer.buffer_minutes), '()'))
     or (v_lawyer.max_daily_appointments is not null and (
       select count(*) from public.appointments o
        where o.lawyer_id = v_a.lawyer_id and o.id <> v_a.id and o.occupies_slot
          and o.status in ('PENDING_PAYMENT', 'PENDING_CONFIRMATION', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED')
          and (o.starts_at at time zone v_lawyer.timezone)::date = (p_new_starts_at at time zone v_lawyer.timezone)::date
     ) >= v_lawyer.max_daily_appointments) then
    raise exception 'The selected slot is no longer available' using errcode = 'P0001', hint = 'slot_unavailable';
  end if;

  insert into public.appointment_reschedules (appointment_id, requested_by, old_starts_at, old_ends_at, new_starts_at, new_ends_at, reason)
  values (v_a.id, v_uid, v_a.starts_at, v_a.ends_at, p_new_starts_at, p_new_starts_at + v_duration, p_reason);
  begin
    update public.appointments
       set starts_at = p_new_starts_at, ends_at = p_new_starts_at + v_duration,
           reschedule_count = reschedule_count + case when v_is_lawyer then 0 else 1 end
     where id = v_a.id;
  exception when exclusion_violation then
    raise exception 'The selected slot is no longer available' using errcode = 'P0001', hint = 'slot_unavailable';
  end;
  perform app.log_appointment_event(v_a.id, 'rescheduled', v_a.status, v_a.status,
                                    jsonb_build_object('from', v_a.starts_at, 'to', p_new_starts_at, 'reason', p_reason));
  v_params := app.appointment_notify_params(v_a.id);
  perform app.notify(case when v_is_lawyer then v_a.client_id else v_a.lawyer_id end, 'appointment.rescheduled', v_params,
                     case when v_is_lawyer then '/client/appointments/' else '/lawyer/appointments/' end || v_a.id,
                     'appt-resched:' || v_a.id || ':' || extract(epoch from p_new_starts_at)::bigint);
  perform app.refresh_lawyer_listing(v_a.lawyer_id);
end $$;

-- True when the start time sits on the lawyer's slot grid for that day (ignores existing bookings).
create or replace function app.slot_in_schedule(p_lawyer_id uuid, p_type public.consultation_kind, p_starts_at timestamptz)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  v_l public.lawyer_profiles%rowtype;
  v_duration int;
  v_local timestamp;
  v_day date;
begin
  select * into v_l from public.lawyer_profiles where id = p_lawyer_id;
  select duration_minutes into v_duration from public.lawyer_consultation_offerings
   where lawyer_id = p_lawyer_id and consultation_type = p_type and is_active;
  if v_duration is null or p_starts_at < now() + make_interval(hours => v_l.min_notice_hours)
     or p_starts_at > now() + make_interval(days => v_l.max_advance_days) then
    return false;
  end if;
  v_local := p_starts_at at time zone v_l.timezone;
  v_day := v_local::date;
  if exists (select 1 from public.lawyer_availability_exceptions e where e.lawyer_id = p_lawyer_id and e.exception_date = v_day
             and e.kind = 'unavailable' and (e.start_time is null
                  or ((v_day + e.start_time) < v_local + make_interval(mins => v_duration) and v_local < (v_day + e.end_time)))) then
    return false;
  end if;
  return exists (
    select 1 from (
      select a.start_time, a.end_time from public.lawyer_availability a
       where a.lawyer_id = p_lawyer_id and a.weekday = extract(dow from v_day)::int
      union all
      select e.start_time, e.end_time from public.lawyer_availability_exceptions e
       where e.lawyer_id = p_lawyer_id and e.exception_date = v_day and e.kind = 'available'
    ) w
    where v_local >= v_day + w.start_time
      and v_local + make_interval(mins => v_duration) <= v_day + w.end_time
      and (extract(epoch from (v_local - (v_day + w.start_time))) / 60)::int % (v_duration + v_l.buffer_minutes) = 0
  );
end $$;

-- Lawyer schedules a follow-up for an existing client.
create or replace function public.create_follow_up_appointment(
  p_original_id uuid, p_consultation_type public.consultation_kind, p_starts_at timestamptz, p_price_minor bigint, p_note text
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := app.require_user();
  v_o public.appointments%rowtype;
  v_offer public.lawyer_consultation_offerings%rowtype;
  v_id uuid;
  v_status public.appointment_status;
begin
  select * into v_o from public.appointments where id = p_original_id;
  if not found or v_o.lawyer_id <> v_uid then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if v_o.status not in ('COMPLETED', 'IN_PROGRESS', 'CONFIRMED') then
    raise exception 'Follow-ups require an attended consultation' using errcode = '22023';
  end if;
  select * into v_offer from public.lawyer_consultation_offerings
   where lawyer_id = v_uid and consultation_type = p_consultation_type and is_active;
  if not found then
    raise exception 'This consultation type is not offered' using errcode = '22023';
  end if;
  if p_price_minor is null or p_price_minor < 0 or p_price_minor > v_offer.price_minor then
    raise exception 'Follow-up price must be between 0 and the standard fee' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('booking:' || v_uid::text, 0));
  if not app.slot_in_schedule(v_uid, p_consultation_type, p_starts_at) then
    raise exception 'The selected time is outside your working hours' using errcode = 'P0001', hint = 'slot_unavailable';
  end if;
  v_status := case when p_price_minor > 0 then 'PENDING_PAYMENT' else 'CONFIRMED' end;
  begin
    insert into public.appointments (lawyer_id, client_id, firm_id, consultation_type, category_id, status, starts_at, ends_at,
                                     office_id, issue_summary, price_minor, hold_expires_at, confirmed_at, follow_up_of, matter_id)
    values (v_uid, v_o.client_id, v_o.firm_id, p_consultation_type, v_o.category_id, v_status, p_starts_at,
            p_starts_at + make_interval(mins => v_offer.duration_minutes), v_o.office_id,
            coalesce(nullif(trim(p_note), ''), 'Follow-up consultation for ' || v_o.reference),
            p_price_minor, case when v_status = 'PENDING_PAYMENT' then now() + interval '48 hours' end,
            case when v_status = 'CONFIRMED' then now() end, v_o.id, v_o.matter_id)
    returning id into v_id;
  exception when exclusion_violation then
    raise exception 'The selected slot is no longer available' using errcode = 'P0001', hint = 'slot_unavailable';
  end;
  insert into public.appointment_participants (appointment_id, user_id, role) values (v_id, v_o.client_id, 'client'), (v_id, v_uid, 'lawyer');
  perform app.log_appointment_event(v_id, 'follow_up_created', null, v_status, jsonb_build_object('original', v_o.id));
  perform app.ensure_appointment_conversation(v_id);
  perform app.notify(v_o.client_id, 'appointment.follow_up', app.appointment_notify_params(v_id), '/client/appointments/' || v_id, 'appt-followup:' || v_id);
  return v_id;
end $$;

-- Scheduled maintenance (service role / cron).
create or replace function public.expire_stale_appointments()
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_count int := 0;
  r record;
begin
  for r in select id, status from public.appointments
            where (status = 'PENDING_PAYMENT' and hold_expires_at < now())
               or (status = 'PENDING_CONFIRMATION' and starts_at < now() and occupies_slot)
            for update skip locked loop
    update public.appointments set status = 'EXPIRED', hold_expires_at = null where id = r.id;
    perform app.log_appointment_event(r.id, 'expired', r.status, 'EXPIRED', '{}');
    if r.status = 'PENDING_CONFIRMATION' then
      perform app.refund_appointment_payment(r.id, 100, 'lawyer_did_not_confirm', null);
      perform app.notify((select client_id from public.appointments where id = r.id), 'appointment.expired',
                         app.appointment_notify_params(r.id), '/client/appointments/' || r.id, 'appt-expired:' || r.id);
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

create or replace function public.queue_reminders()
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_count int := 0;
  r record;
begin
  for r in select a.id, a.client_id, a.lawyer_id, a.starts_at
             from public.appointments a
            where a.status = 'CONFIRMED' and a.occupies_slot
              and a.starts_at between now() and now() + interval '24 hours' loop
    -- 24h and 1h reminders; dedupe keys make repeated runs safe.
    if r.starts_at > now() + interval '1 hour' then
      perform app.notify(r.client_id, 'appointment.reminder', app.appointment_notify_params(r.id) || '{"window":"24h"}', '/client/appointments/' || r.id, 'remind24:' || r.id);
      perform app.notify(r.lawyer_id, 'appointment.reminder', app.appointment_notify_params(r.id) || '{"window":"24h"}', '/lawyer/appointments/' || r.id, 'remind24:' || r.id);
    else
      perform app.notify(r.client_id, 'appointment.reminder', app.appointment_notify_params(r.id) || '{"window":"1h"}', '/consultation/' || r.id, 'remind1:' || r.id);
      perform app.notify(r.lawyer_id, 'appointment.reminder', app.appointment_notify_params(r.id) || '{"window":"1h"}', '/consultation/' || r.id, 'remind1:' || r.id);
    end if;
    v_count := v_count + 1;
  end loop;
  for r in select h.id, h.matter_id, h.hearing_at, h.court_name, h.assigned_lawyer_id, h.visible_to_client,
                  m.owner_lawyer_id, m.client_user_id, m.reference
             from public.matter_hearings h join public.legal_matters m on m.id = h.matter_id
            where h.hearing_at between now() and now() + interval '48 hours'
              and m.status not in ('CLOSED', 'ARCHIVED') loop
    perform app.notify(coalesce(r.assigned_lawyer_id, r.owner_lawyer_id), 'hearing.reminder',
                       jsonb_build_object('court', r.court_name, 'reference', r.reference,
                                          'date', to_char(r.hearing_at at time zone 'Africa/Cairo', 'YYYY-MM-DD HH24:MI')),
                       '/lawyer/matters/' || r.matter_id, 'hearing:' || r.id || ':' || extract(epoch from r.hearing_at)::bigint);
    if r.visible_to_client and r.client_user_id is not null then
      perform app.notify(r.client_user_id, 'hearing.reminder',
                         jsonb_build_object('court', r.court_name, 'reference', r.reference,
                                            'date', to_char(r.hearing_at at time zone 'Africa/Cairo', 'YYYY-MM-DD HH24:MI')),
                         '/client/matters/' || r.matter_id, 'hearing:' || r.id || ':' || extract(epoch from r.hearing_at)::bigint);
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- ---------------------------------------------------------------------------
-- Matters: automatic timeline, membership and validation
-- ---------------------------------------------------------------------------
create or replace function app.on_matter_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_feat record;
  v_active int;
begin
  select * into v_feat from app.plan_feature(
    coalesce(app.effective_plan_for_firm(new.firm_id), app.effective_plan_for_lawyer(new.owner_lawyer_id)), 'matters.active');
  if not v_feat.enabled then
    raise exception 'Your plan does not include case management' using errcode = 'P0001', hint = 'plan_limit';
  end if;
  if v_feat.limit_value is not null then
    select count(*) into v_active from public.legal_matters
     where id <> new.id and status not in ('CLOSED', 'ARCHIVED', 'COMPLETED')
       and ((new.firm_id is not null and firm_id = new.firm_id) or (new.firm_id is null and firm_id is null and owner_lawyer_id = new.owner_lawyer_id));
    if v_active >= v_feat.limit_value then
      raise exception 'Active matter limit reached for your plan' using errcode = 'P0001', hint = 'plan_limit';
    end if;
  end if;
  insert into public.matter_members (matter_id, user_id, role, can_edit, added_by)
  values (new.id, new.owner_lawyer_id, 'lead', true, auth.uid()) on conflict do nothing;
  insert into public.matter_events (matter_id, actor_id, event_type, summary, visibility)
  values (new.id, auth.uid(), 'matter.opened', 'تم فتح الملف', 'shared');
  if new.client_user_id is not null then
    perform app.notify(new.client_user_id, 'matter.opened', jsonb_build_object('reference', new.reference, 'title', new.title),
                       '/client/matters/' || new.id, 'matter-open:' || new.id);
  end if;
  return null;
end $$;
create trigger legal_matters_after_insert after insert on public.legal_matters
  for each row execute function app.on_matter_insert();

create or replace function app.on_matter_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status is distinct from old.status then
    insert into public.matter_events (matter_id, actor_id, event_type, summary, visibility, details)
    values (new.id, auth.uid(), 'matter.status_changed', 'تغيّرت حالة الملف', 'shared',
            jsonb_build_object('from', old.status, 'to', new.status));
    if new.client_user_id is not null then
      perform app.notify(new.client_user_id, 'matter.status_changed',
                         jsonb_build_object('reference', new.reference, 'title', new.title, 'status', new.status),
                         '/client/matters/' || new.id, 'matter-status:' || new.id || ':' || new.status || ':' || extract(epoch from now())::bigint);
    end if;
  end if;
  if new.client_user_id is distinct from old.client_user_id and new.client_user_id is not null then
    perform app.notify(new.client_user_id, 'matter.opened', jsonb_build_object('reference', new.reference, 'title', new.title),
                       '/client/matters/' || new.id, 'matter-open:' || new.id || ':' || new.client_user_id);
  end if;
  return null;
end $$;
create trigger legal_matters_after_update after update on public.legal_matters
  for each row execute function app.on_matter_update();

-- Assignees must belong to the matter's firm (tenant isolation) — or, for a
-- personal matter, only the owner can be a member.
create or replace function app.validate_matter_member()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_m public.legal_matters%rowtype;
begin
  select * into v_m from public.legal_matters where id = new.matter_id;
  if v_m.firm_id is not null then
    if not exists (select 1 from public.law_firm_members fm where fm.firm_id = v_m.firm_id and fm.user_id = new.user_id and fm.status = 'active') then
      raise exception 'Assignee must be an active member of the firm' using errcode = '42501';
    end if;
  elsif new.user_id <> v_m.owner_lawyer_id then
    raise exception 'Only firm matters can be shared with a team' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' and new.user_id <> coalesce(auth.uid(), new.user_id) then
    insert into public.matter_events (matter_id, actor_id, event_type, summary, visibility, details)
    values (new.matter_id, auth.uid(), 'matter.member_added', 'تم إسناد الملف لعضو في الفريق', 'internal', jsonb_build_object('user_id', new.user_id));
    perform app.notify(new.user_id, 'matter.assigned', jsonb_build_object('reference', v_m.reference, 'title', v_m.title),
                       '/lawyer/matters/' || v_m.id, 'matter-assign:' || v_m.id || ':' || new.user_id);
  end if;
  return new;
end $$;
create trigger matter_members_validate before insert or update on public.matter_members
  for each row execute function app.validate_matter_member();

create or replace function app.validate_matter_task()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_m public.legal_matters%rowtype;
begin
  select * into v_m from public.legal_matters where id = new.matter_id;
  if new.assignee_id is not null and new.assignee_id <> v_m.owner_lawyer_id
     and not exists (select 1 from public.matter_members mm where mm.matter_id = new.matter_id and mm.user_id = new.assignee_id)
     and not (v_m.firm_id is not null and exists (select 1 from public.law_firm_members fm where fm.firm_id = v_m.firm_id and fm.user_id = new.assignee_id and fm.status = 'active')) then
    raise exception 'Task assignee must be on the matter team' using errcode = '42501';
  end if;
  -- Assignees who are not editors may only update status.
  if tg_op = 'UPDATE' and not app.is_trusted() and not app.can_edit_matter(new.matter_id) and
     (new.title, new.description, new.assignee_id, new.due_at, new.priority, new.matter_id)
     is distinct from (old.title, old.description, old.assignee_id, old.due_at, old.priority, old.matter_id) then
    raise exception 'Only the status of an assigned task can be changed' using errcode = '42501';
  end if;
  if new.status = 'done' and (tg_op = 'INSERT' or old.status <> 'done') then
    new.completed_at := now();
  elsif new.status <> 'done' then
    new.completed_at := null;
  end if;
  if new.assignee_id is not null and new.assignee_id <> coalesce(auth.uid(), new.assignee_id)
     and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id) then
    perform app.notify(new.assignee_id, 'task.assigned', jsonb_build_object('title', new.title, 'reference', v_m.reference),
                       '/lawyer/matters/' || v_m.id, 'task:' || new.id || ':' || new.assignee_id);
  end if;
  return new;
end $$;
create trigger matter_tasks_validate before insert or update on public.matter_tasks
  for each row execute function app.validate_matter_task();

create or replace function app.on_hearing_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_m public.legal_matters%rowtype;
begin
  select * into v_m from public.legal_matters where id = new.matter_id;
  insert into public.matter_events (matter_id, actor_id, event_type, summary, visibility, details)
  values (new.matter_id, auth.uid(), case when tg_op = 'INSERT' then 'hearing.scheduled' else 'hearing.updated' end,
          case when tg_op = 'INSERT' then 'تمت إضافة جلسة: ' else 'تم تحديث جلسة: ' end || new.court_name,
          case when new.visible_to_client then 'shared' else 'internal' end,
          jsonb_build_object('hearing_at', new.hearing_at, 'court', new.court_name));
  if tg_op = 'INSERT' and new.visible_to_client and v_m.client_user_id is not null then
    perform app.notify(v_m.client_user_id, 'hearing.scheduled',
                       jsonb_build_object('court', new.court_name, 'reference', v_m.reference,
                                          'date', to_char(new.hearing_at at time zone 'Africa/Cairo', 'YYYY-MM-DD HH24:MI')),
                       '/client/matters/' || v_m.id, 'hearing-new:' || new.id);
  end if;
  return null;
end $$;
create trigger matter_hearings_events after insert or update on public.matter_hearings
  for each row execute function app.on_hearing_change();

create or replace function app.on_matter_document()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_m public.legal_matters%rowtype;
  v_title text;
begin
  select * into v_m from public.legal_matters where id = new.matter_id;
  select title into v_title from public.documents where id = new.document_id;
  if tg_op = 'INSERT' or (new.shared_with_client and not old.shared_with_client) then
    insert into public.matter_events (matter_id, actor_id, event_type, summary, visibility, details)
    values (new.matter_id, auth.uid(), 'document.added', 'مستند: ' || v_title,
            case when new.shared_with_client then 'shared' else 'internal' end, jsonb_build_object('document_id', new.document_id));
    if new.shared_with_client and v_m.client_user_id is not null then
      perform app.notify(v_m.client_user_id, 'document.shared', jsonb_build_object('title', v_title, 'reference', v_m.reference),
                         '/client/matters/' || v_m.id, 'doc-shared:' || new.document_id || ':' || v_m.client_user_id);
    end if;
  end if;
  return null;
end $$;
create trigger matter_documents_events after insert or update on public.matter_documents
  for each row execute function app.on_matter_document();

-- Converts a consultation into a matter for that client.
create or replace function public.create_matter_from_appointment(p_appointment_id uuid, p_title text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := app.require_user();
  v_a public.appointments%rowtype;
  v_client uuid;
  v_matter uuid;
begin
  select * into v_a from public.appointments where id = p_appointment_id;
  if not found or v_a.lawyer_id <> v_uid then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if v_a.matter_id is not null then
    return v_a.matter_id;
  end if;
  v_client := app.upsert_practice_client(v_uid, v_a.firm_id, v_a.client_id);
  insert into public.legal_matters (firm_id, owner_lawyer_id, client_record_id, category_id, title, description, created_by)
  values (v_a.firm_id, v_uid, v_client, v_a.category_id, coalesce(nullif(trim(p_title), ''), 'ملف ' || v_a.reference),
          v_a.issue_summary, v_uid)
  returning id into v_matter;
  update public.appointments set matter_id = v_matter where id = v_a.id;
  -- carry over documents uploaded with the booking
  insert into public.matter_documents (matter_id, document_id, shared_with_client, added_by)
  select v_matter, d.id, true, v_uid from public.documents d where d.appointment_id = v_a.id and d.status = 'active'
  on conflict do nothing;
  return v_matter;
end $$;

-- ---------------------------------------------------------------------------
-- Messaging
-- ---------------------------------------------------------------------------
create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void language sql security definer set search_path = '' as $$
  update public.conversation_participants set last_read_at = now()
   where conversation_id = p_conversation_id and user_id = auth.uid();
$$;

create or replace function public.get_unread_counts()
returns table (conversation_id uuid, unread bigint) language sql stable security definer set search_path = '' as $$
  select cp.conversation_id, count(m.id)
    from public.conversation_participants cp
    join public.messages m on m.conversation_id = cp.conversation_id
   where cp.user_id = auth.uid() and m.created_at > cp.last_read_at
     and m.sender_id is distinct from auth.uid() and m.deleted_at is null
   group by cp.conversation_id;
$$;

create or replace function public.open_matter_conversation(p_matter_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := app.require_user();
  v_m public.legal_matters%rowtype;
  v_id uuid;
begin
  if not (app.can_view_matter(p_matter_id) or app.is_matter_client(p_matter_id)) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select * into v_m from public.legal_matters where id = p_matter_id;
  select id into v_id from public.conversations where matter_id = p_matter_id and kind = 'matter' limit 1;
  if v_id is null then
    insert into public.conversations (kind, matter_id, firm_id, subject, created_by)
    values ('matter', p_matter_id, v_m.firm_id, v_m.reference || ' — ' || v_m.title, v_uid) returning id into v_id;
  end if;
  -- (Re)sync participants: team + client.
  insert into public.conversation_participants (conversation_id, user_id, role)
  select v_id, mm.user_id, case when mm.user_id = v_m.owner_lawyer_id then 'lawyer' else 'staff' end
    from public.matter_members mm where mm.matter_id = p_matter_id
  on conflict do nothing;
  if v_m.client_user_id is not null then
    insert into public.conversation_participants (conversation_id, user_id, role) values (v_id, v_m.client_user_id, 'client')
    on conflict do nothing;
  end if;
  -- Removed team members lose access.
  delete from public.conversation_participants cp
   where cp.conversation_id = v_id and cp.role in ('staff', 'lawyer')
     and not exists (select 1 from public.matter_members mm where mm.matter_id = p_matter_id and mm.user_id = cp.user_id);
  return v_id;
end $$;

create or replace function app.on_message_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_sender text;
begin
  if new.kind <> 'text' then
    return null;
  end if;
  select full_name into v_sender from public.profiles where id = new.sender_id;
  for r in select cp.user_id, cp.role from public.conversation_participants cp
            where cp.conversation_id = new.conversation_id and cp.user_id <> new.sender_id and not cp.muted loop
    perform app.notify(r.user_id, 'message.new', jsonb_build_object('sender', v_sender),
                       case when r.role = 'client' then '/client/messages/' else '/lawyer/messages/' end || new.conversation_id,
                       'msg:' || new.conversation_id || ':' || to_char(date_trunc('hour', new.created_at), 'YYYYMMDDHH24'));
  end loop;
  return null;
end $$;
create trigger messages_notify after insert on public.messages
  for each row execute function app.on_message_insert();

-- ---------------------------------------------------------------------------
-- Documents
-- ---------------------------------------------------------------------------
create or replace function app.sanitize_filename(p_name text)
returns text language sql immutable as $$
  select left(coalesce(nullif(regexp_replace(regexp_replace(coalesce(p_name, ''), '[^A-Za-z0-9._-]+', '_', 'g'), '^\.+', ''), ''), 'file'), 100);
$$;

create or replace function app.allowed_upload(p_mime text, p_size bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_size > 0
     and p_size <= coalesce((select (value ->> 'max_bytes')::bigint from public.platform_settings where key = 'uploads'), 26214400)
     and p_mime = any (coalesce(
       (select array(select jsonb_array_elements_text(value -> 'allowed_mime_types')) from public.platform_settings where key = 'uploads'),
       array['application/pdf', 'image/jpeg', 'image/png', 'image/webp',
             'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword', 'text/plain']));
$$;

-- Step 1 of an upload: authorise, create the document/version rows, return the storage path.
-- The server then issues a short-lived signed upload URL for exactly that path.
create or replace function public.create_document_upload(
  p_title text, p_category public.document_category, p_filename text, p_mime text, p_size bigint,
  p_matter_id uuid default null, p_appointment_id uuid default null, p_service_order_id uuid default null,
  p_firm_id uuid default null, p_document_id uuid default null, p_share_with_client boolean default false
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := app.require_user();
  v_doc uuid := p_document_id;
  v_version int;
  v_path text;
  v_firm uuid := p_firm_id;
begin
  if not app.rate_limit('upload:' || v_uid, 60, 3600) then
    raise exception 'Upload rate limit exceeded' using errcode = 'P0001', hint = 'rate_limited';
  end if;
  if not app.allowed_upload(p_mime, p_size) then
    raise exception 'File type or size not allowed' using errcode = '22023', hint = 'invalid_file';
  end if;

  if v_doc is not null then
    -- New version of an existing document.
    if not app.can_access_document(v_doc, 'edit') then
      raise exception 'Not allowed' using errcode = '42501';
    end if;
  else
    if p_matter_id is not null then
      if not (app.can_edit_matter(p_matter_id) or (app.is_matter_client(p_matter_id))) then
        raise exception 'Not allowed to add documents to this matter' using errcode = '42501';
      end if;
      select firm_id into v_firm from public.legal_matters where id = p_matter_id;
    end if;
    if p_appointment_id is not null and not app.is_appointment_party(p_appointment_id) then
      raise exception 'Not allowed' using errcode = '42501';
    end if;
    if p_service_order_id is not null and not exists (
         select 1 from public.service_orders o where o.id = p_service_order_id and (o.client_id = v_uid or o.lawyer_id = v_uid)) then
      raise exception 'Not allowed' using errcode = '42501';
    end if;
    if v_firm is not null and p_matter_id is null and not app.firm_has_permission(v_firm, 'documents.upload') then
      raise exception 'Not allowed' using errcode = '42501';
    end if;
    insert into public.documents (owner_id, firm_id, appointment_id, service_order_id, title, category, mime_type, size_bytes)
    values (v_uid, v_firm, p_appointment_id, p_service_order_id, left(coalesce(nullif(trim(p_title), ''), p_filename), 200),
            p_category, p_mime, p_size)
    returning id into v_doc;
    if p_matter_id is not null then
      insert into public.matter_documents (matter_id, document_id, shared_with_client, added_by)
      values (p_matter_id, v_doc, p_share_with_client or app.is_matter_client(p_matter_id), v_uid);
    end if;
  end if;

  select coalesce(max(version), 0) + 1 into v_version from public.document_versions where document_id = v_doc;
  v_path := v_doc || '/v' || v_version || '-' || substr(md5(random()::text), 1, 8) || '-' || app.sanitize_filename(p_filename);
  insert into public.document_versions (document_id, version, storage_path, original_filename, mime_type, size_bytes, uploaded_by)
  values (v_doc, v_version, v_path, left(p_filename, 200), p_mime, p_size, v_uid);
  return jsonb_build_object('document_id', v_doc, 'version', v_version, 'storage_path', v_path, 'bucket', 'documents');
end $$;

-- Step 2 (service role only): the object was verified in storage.
create or replace function public.mark_document_uploaded(p_document_id uuid, p_version int, p_size bigint, p_sha256 text, p_scan public.scan_status)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_ver public.document_versions%rowtype;
begin
  select * into v_ver from public.document_versions where document_id = p_document_id and version = p_version for update;
  if not found then
    raise exception 'Version not found' using errcode = 'P0002';
  end if;
  update public.document_versions set size_bytes = p_size, sha256 = p_sha256, scan_status = p_scan, uploaded_at = now()
   where id = v_ver.id;
  update public.documents set status = 'active', current_version = greatest(current_version, p_version),
         size_bytes = p_size, mime_type = v_ver.mime_type, scan_status = p_scan
   where id = p_document_id;
  insert into public.document_access_log (document_id, user_id, action, version) values (p_document_id, v_ver.uploaded_by, 'upload', p_version);
end $$;

-- Called by the download route with the user's session; returns the path only if authorised.
create or replace function public.authorize_document_download(p_document_id uuid, p_version int default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := app.require_user();
  v_doc public.documents%rowtype;
  v_ver public.document_versions%rowtype;
begin
  if not app.can_access_document(p_document_id, 'view') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select * into v_doc from public.documents where id = p_document_id;
  if v_doc.scan_status = 'infected' then
    raise exception 'File quarantined' using errcode = '42501', hint = 'infected';
  end if;
  select * into v_ver from public.document_versions
   where document_id = p_document_id and version = coalesce(p_version, v_doc.current_version) and uploaded_at is not null;
  if not found then
    raise exception 'File not available' using errcode = 'P0002';
  end if;
  if v_ver.scan_status = 'infected' then
    raise exception 'File quarantined' using errcode = '42501', hint = 'infected';
  end if;
  insert into public.document_access_log (document_id, user_id, action, version) values (p_document_id, v_uid, 'download', v_ver.version);
  return jsonb_build_object('bucket', v_ver.storage_bucket, 'path', v_ver.storage_path, 'filename', v_ver.original_filename,
                            'mime_type', v_ver.mime_type, 'scan_status', v_ver.scan_status);
end $$;

create or replace function public.delete_document(p_document_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := app.require_user();
begin
  if not exists (select 1 from public.documents where id = p_document_id and owner_id = v_uid and status <> 'deleted') then
    raise exception 'Only the owner can delete this document' using errcode = '42501';
  end if;
  if exists (select 1 from public.dispute_evidence de join public.disputes d on d.id = de.dispute_id
             where de.document_id = p_document_id and d.status not in ('resolved', 'rejected', 'closed')) then
    raise exception 'Document is evidence in an open dispute' using errcode = '42501';
  end if;
  update public.documents set status = 'deleted', deleted_at = now() where id = p_document_id;
  insert into public.document_access_log (document_id, user_id, action) values (p_document_id, v_uid, 'delete');
end $$;

create or replace function app.on_document_grant()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_title text;
begin
  select title into v_title from public.documents where id = new.document_id;
  insert into public.document_access_log (document_id, user_id, action) values (new.document_id, auth.uid(), 'share');
  perform app.notify(new.grantee_id, 'document.shared', jsonb_build_object('title', v_title), '/documents', 'grant:' || new.id);
  return null;
end $$;
create trigger document_access_grants_notify after insert on public.document_access_grants
  for each row execute function app.on_document_grant();

-- ---------------------------------------------------------------------------
-- Service orders
-- ---------------------------------------------------------------------------
create or replace function public.create_service_order(p_service_id uuid, p_package_id uuid, p_requirements text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := app.require_user();
  v_s public.legal_services%rowtype;
  v_p public.service_packages%rowtype;
  v_price bigint;
  v_days int;
  v_id uuid;
  v_conv uuid;
begin
  if not app.has_role('client') then
    raise exception 'Only client accounts can order services' using errcode = '42501';
  end if;
  if not app.rate_limit('order:' || v_uid, 10, 3600) then
    raise exception 'Too many orders, try again later' using errcode = 'P0001', hint = 'rate_limited';
  end if;
  select * into v_s from public.legal_services where id = p_service_id and status = 'active';
  if not found or not app.is_public_lawyer(v_s.lawyer_id) then
    raise exception 'Service unavailable' using errcode = '22023';
  end if;
  if v_s.lawyer_id = v_uid then
    raise exception 'You cannot order your own service' using errcode = '22023';
  end if;
  v_price := v_s.price_minor;
  v_days := v_s.estimated_days;
  if p_package_id is not null then
    select * into v_p from public.service_packages where id = p_package_id and service_id = p_service_id and is_active;
    if not found then
      raise exception 'Package unavailable' using errcode = '22023';
    end if;
    v_price := v_p.price_minor;
    v_days := v_p.estimated_days;
  end if;
  insert into public.service_orders (service_id, package_id, client_id, lawyer_id, firm_id, status, price_minor, requirements,
                                     revisions_allowed, due_at)
  values (p_service_id, p_package_id, v_uid, v_s.lawyer_id, v_s.firm_id, 'CREATED', v_price, p_requirements,
          v_s.revisions_included, now() + make_interval(days => v_days))
  returning id into v_id;
  update public.service_orders set status = 'PENDING_PAYMENT' where id = v_id;
  insert into public.conversations (kind, service_order_id, firm_id, subject, created_by)
  values ('service_order', v_id, v_s.firm_id, v_s.title_ar, v_uid) returning id into v_conv;
  insert into public.conversation_participants (conversation_id, user_id, role) values (v_conv, v_uid, 'client'), (v_conv, v_s.lawyer_id, 'lawyer');
  return v_id;
end $$;

create or replace function public.transition_service_order(p_order_id uuid, p_to public.service_order_status, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := app.require_user();
  v_o public.service_orders%rowtype;
  v_actor text;
  v_allowed boolean;
  v_title text;
begin
  select * into v_o from public.service_orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  v_actor := case when app.is_admin() then 'admin'
                  when v_o.lawyer_id = v_uid then 'lawyer'
                  when v_o.client_id = v_uid then 'client' end;
  if v_actor is null then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if not app.service_order_transition_allowed(v_o.status, p_to) then
    raise exception 'Invalid service order transition % -> %', v_o.status, p_to using errcode = '22023';
  end if;
  v_allowed := case v_actor
    when 'admin' then p_to not in ('REFUNDED', 'DISPUTED', 'PAID')
    when 'lawyer' then p_to in ('IN_PROGRESS', 'WAITING_FOR_CLIENT', 'DELIVERED')
                       or (p_to = 'CANCELLED' and v_o.status in ('PAID', 'IN_PROGRESS', 'WAITING_FOR_CLIENT'))
    when 'client' then (p_to = 'CANCELLED' and v_o.status in ('CREATED', 'PENDING_PAYMENT', 'PAID'))
                       or (p_to = 'COMPLETED' and v_o.status = 'DELIVERED')
                       or (p_to = 'REVISION_REQUESTED' and v_o.status = 'DELIVERED' and v_o.revisions_used < v_o.revisions_allowed)
                       or (p_to = 'IN_PROGRESS' and v_o.status = 'WAITING_FOR_CLIENT')
    else false end;
  if not v_allowed then
    raise exception 'This action is not available right now' using errcode = '42501';
  end if;
  if p_to = 'CANCELLED' and v_actor <> 'client' and coalesce(trim(p_note), '') = '' then
    raise exception 'A cancellation reason is required' using errcode = '22023';
  end if;

  update public.service_orders set
    status = p_to,
    delivered_at = case when p_to = 'DELIVERED' then now() else delivered_at end,
    completed_at = case when p_to = 'COMPLETED' then now() else completed_at end,
    cancelled_at = case when p_to = 'CANCELLED' then now() else cancelled_at end,
    cancellation_reason = case when p_to = 'CANCELLED' then p_note else cancellation_reason end,
    revisions_used = revisions_used + case when p_to = 'REVISION_REQUESTED' then 1 else 0 end
  where id = p_order_id;

  select title_ar into v_title from public.legal_services where id = v_o.service_id;
  if p_to = 'CANCELLED' and v_o.status in ('PAID', 'IN_PROGRESS', 'WAITING_FOR_CLIENT') then
    perform app.refund_service_order_payment(p_order_id, 100, coalesce(p_note, 'cancellation'), v_uid);
  end if;
  if p_to = 'DELIVERED' then
    perform app.notify(v_o.client_id, 'service_order.delivered', jsonb_build_object('reference', v_o.reference, 'service', v_title),
                       '/client/orders/' || v_o.id, 'order-delivered:' || v_o.id || ':' || (v_o.revisions_used));
  elsif p_to = 'REVISION_REQUESTED' then
    perform app.notify(v_o.lawyer_id, 'service_order.revision', jsonb_build_object('reference', v_o.reference, 'service', v_title),
                       '/lawyer/orders/' || v_o.id, 'order-revision:' || v_o.id || ':' || (v_o.revisions_used + 1));
  elsif p_to = 'COMPLETED' then
    perform app.notify(v_o.lawyer_id, 'service_order.completed', jsonb_build_object('reference', v_o.reference, 'service', v_title),
                       '/lawyer/orders/' || v_o.id, 'order-completed:' || v_o.id);
  elsif p_to = 'CANCELLED' then
    perform app.notify(case when v_actor = 'client' then v_o.lawyer_id else v_o.client_id end, 'service_order.cancelled',
                       jsonb_build_object('reference', v_o.reference, 'service', v_title),
                       case when v_actor = 'client' then '/lawyer/orders/' else '/client/orders/' end || v_o.id, 'order-cancelled:' || v_o.id);
  elsif p_to in ('IN_PROGRESS', 'WAITING_FOR_CLIENT') then
    perform app.notify(case when v_actor = 'client' then v_o.lawyer_id else v_o.client_id end, 'service_order.updated',
                       jsonb_build_object('reference', v_o.reference, 'service', v_title, 'status', p_to),
                       case when v_actor = 'client' then '/lawyer/orders/' else '/client/orders/' end || v_o.id,
                       'order-upd:' || v_o.id || ':' || p_to || ':' || extract(epoch from now())::bigint);
  end if;
end $$;

create or replace function public.auto_complete_delivered_orders()
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_days int := app.setting('services', 'auto_complete_days', '7')::int;
  v_count int;
begin
  update public.service_orders set status = 'COMPLETED', completed_at = now()
   where status = 'DELIVERED' and delivered_at < now() - make_interval(days => v_days);
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- ---------------------------------------------------------------------------
-- Reviews
-- ---------------------------------------------------------------------------
-- Detects content that may reveal contact details or identifiers.
create or replace function app.review_flags(p_text text)
returns text[] language sql immutable as $$
  select array_remove(array[
    case when p_text ~ '(\+?2?01[0125][0-9]{8})|([0-9٠-٩]{10,})' then 'phone_or_id' end,
    case when p_text ~* '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}' then 'email' end,
    case when p_text ~* '(https?://|www\.)' then 'link' end,
    case when p_text ~ '(قضية|دعوى|جنحة|جناية)\s*(رقم)?\s*[0-9٠-٩]+' then 'case_number' end
  ], null);
$$;

create or replace function public.submit_review(p_appointment_id uuid, p_service_order_id uuid, p_rating int, p_comment text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := app.require_user();
  v_lawyer uuid;
  v_done_at timestamptz;
  v_flags text[];
  v_id uuid;
  v_show_name boolean;
  v_name text;
begin
  if num_nonnulls(p_appointment_id, p_service_order_id) <> 1 then
    raise exception 'Specify exactly one appointment or order' using errcode = '22023';
  end if;
  if p_rating not between 1 and 5 then
    raise exception 'Rating must be between 1 and 5' using errcode = '22023';
  end if;
  if p_appointment_id is not null then
    select lawyer_id, completed_at into v_lawyer, v_done_at from public.appointments
     where id = p_appointment_id and client_id = v_uid and status = 'COMPLETED';
  else
    select lawyer_id, completed_at into v_lawyer, v_done_at from public.service_orders
     where id = p_service_order_id and client_id = v_uid and status = 'COMPLETED';
  end if;
  if v_lawyer is null then
    raise exception 'Only completed services you received can be reviewed' using errcode = '42501';
  end if;
  if v_done_at < now() - interval '60 days' then
    raise exception 'The review window has closed' using errcode = '22023';
  end if;
  if exists (select 1 from public.reviews where appointment_id = p_appointment_id or service_order_id = p_service_order_id) then
    raise exception 'You already reviewed this service' using errcode = '23505';
  end if;
  v_flags := app.review_flags(coalesce(p_comment, ''));
  select allow_review_display_name into v_show_name from public.user_settings where user_id = v_uid;
  select split_part(full_name, ' ', 1) into v_name from public.profiles where id = v_uid;
  insert into public.reviews (lawyer_id, client_id, appointment_id, service_order_id, rating, comment, status, flagged_reasons, display_name, published_at)
  values (v_lawyer, v_uid, p_appointment_id, p_service_order_id, p_rating, nullif(trim(p_comment), ''),
          case when coalesce(array_length(v_flags, 1), 0) = 0 then 'published'::public.review_status else 'pending'::public.review_status end,
          v_flags, case when coalesce(v_show_name, false) then v_name end,
          case when coalesce(array_length(v_flags, 1), 0) = 0 then now() end)
  returning id into v_id;
  perform app.notify(v_lawyer, 'review.received', jsonb_build_object('rating', p_rating), '/lawyer/reviews', 'review:' || v_id);
  return v_id;
end $$;

create or replace function public.report_review(p_review_id uuid, p_reason text, p_details text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := app.require_user();
  v_count int;
begin
  insert into public.review_reports (review_id, reporter_id, reason, details) values (p_review_id, v_uid, p_reason, p_details);
  update public.reviews set report_count = report_count + 1 where id = p_review_id returning report_count into v_count;
  -- Hide pending moderation after repeated reports or any confidentiality report by the lawyer.
  if v_count >= 3 or (p_reason = 'confidential_info' and exists (select 1 from public.reviews where id = p_review_id and lawyer_id = v_uid)) then
    update public.reviews set status = 'pending' where id = p_review_id and status = 'published';
  end if;
end $$;

create or replace function public.moderate_review(p_review_id uuid, p_status public.review_status, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_user();
  if not app.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  update public.reviews set status = p_status, moderation_note = p_note where id = p_review_id;
  update public.review_reports set status = case when p_status in ('hidden', 'rejected') then 'actioned' else 'dismissed' end
   where review_id = p_review_id and status = 'open';
  perform app.audit('review.moderated', 'review', p_review_id::text, jsonb_build_object('status', p_status, 'note', p_note));
end $$;

-- ---------------------------------------------------------------------------
-- Disputes
-- ---------------------------------------------------------------------------
create or replace function public.open_dispute(p_appointment_id uuid, p_service_order_id uuid, p_reason text, p_description text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := app.require_user();
  v_against uuid;
  v_status text;
  v_id uuid;
  v_ref text;
  r record;
begin
  if num_nonnulls(p_appointment_id, p_service_order_id) <> 1 then
    raise exception 'Specify exactly one appointment or order' using errcode = '22023';
  end if;
  if p_appointment_id is not null then
    select case when client_id = v_uid then lawyer_id when lawyer_id = v_uid then client_id end, status::text, reference
      into v_against, v_status, v_ref
      from public.appointments where id = p_appointment_id for update;
    if v_against is null then
      raise exception 'Not allowed' using errcode = '42501';
    end if;
    if v_status not in ('CONFIRMED', 'COMPLETED', 'NO_SHOW')
       or exists (select 1 from public.appointments where id = p_appointment_id and coalesce(completed_at, ends_at) < now() - interval '14 days') then
      raise exception 'A dispute cannot be opened for this appointment' using errcode = '22023';
    end if;
    update public.appointments set status = 'DISPUTED' where id = p_appointment_id;
    perform app.log_appointment_event(p_appointment_id, 'disputed', v_status::public.appointment_status, 'DISPUTED', jsonb_build_object('reason', p_reason));
  else
    select case when client_id = v_uid then lawyer_id when lawyer_id = v_uid then client_id end, status::text, reference
      into v_against, v_status, v_ref
      from public.service_orders where id = p_service_order_id for update;
    if v_against is null then
      raise exception 'Not allowed' using errcode = '42501';
    end if;
    if v_status not in ('PAID', 'IN_PROGRESS', 'DELIVERED', 'REVISION_REQUESTED', 'COMPLETED') then
      raise exception 'A dispute cannot be opened for this order' using errcode = '22023';
    end if;
    update public.service_orders set status = 'DISPUTED' where id = p_service_order_id;
  end if;
  insert into public.disputes (raised_by, against_user_id, appointment_id, service_order_id, reason, description, previous_status)
  values (v_uid, v_against, p_appointment_id, p_service_order_id, p_reason, p_description, v_status) returning id into v_id;
  perform app.notify(v_against, 'dispute.opened', jsonb_build_object('reference', v_ref), '/disputes/' || v_id, 'dispute:' || v_id);
  for r in select ur.user_id from public.user_roles ur where ur.role in ('admin', 'super_admin') loop
    perform app.notify(r.user_id, 'dispute.opened', jsonb_build_object('reference', v_ref), '/admin/disputes/' || v_id, 'dispute-admin:' || v_id);
  end loop;
  return v_id;
end $$;

create or replace function public.resolve_dispute(p_dispute_id uuid, p_resolution_type text, p_refund_percent int, p_resolution text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_d public.disputes%rowtype;
  v_to text;
begin
  perform app.require_user();
  if not app.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  select * into v_d from public.disputes where id = p_dispute_id for update;
  if not found or v_d.status in ('resolved', 'rejected', 'closed') then
    raise exception 'Dispute is not open' using errcode = '22023';
  end if;
  if coalesce(trim(p_resolution), '') = '' then
    raise exception 'A resolution note is required' using errcode = '22023';
  end if;
  if p_resolution_type not in ('full_refund', 'partial_refund', 'no_refund', 'completed', 'cancelled') then
    raise exception 'Invalid resolution type' using errcode = '22023';
  end if;

  if v_d.appointment_id is not null then
    v_to := case when p_resolution_type in ('full_refund', 'partial_refund', 'cancelled') then 'CANCELLED' else 'COMPLETED' end;
    update public.appointments set status = v_to::public.appointment_status,
           completed_at = case when v_to = 'COMPLETED' then coalesce(completed_at, now()) else completed_at end,
           cancelled_at = case when v_to = 'CANCELLED' then now() else cancelled_at end
     where id = v_d.appointment_id;
    perform app.log_appointment_event(v_d.appointment_id, 'dispute_resolved', 'DISPUTED', v_to::public.appointment_status,
                                      jsonb_build_object('dispute_id', p_dispute_id, 'resolution', p_resolution_type));
    if p_resolution_type in ('full_refund', 'partial_refund') then
      perform app.refund_appointment_payment(v_d.appointment_id,
                case when p_resolution_type = 'full_refund' then 100 else greatest(1, least(99, coalesce(p_refund_percent, 50))) end,
                'dispute:' || v_d.reference, auth.uid());
    end if;
  else
    v_to := case when p_resolution_type in ('full_refund', 'partial_refund', 'cancelled') then 'CANCELLED' else 'COMPLETED' end;
    update public.service_orders set status = v_to::public.service_order_status,
           completed_at = case when v_to = 'COMPLETED' then coalesce(completed_at, now()) else completed_at end,
           cancelled_at = case when v_to = 'CANCELLED' then now() else cancelled_at end
     where id = v_d.service_order_id;
    if p_resolution_type in ('full_refund', 'partial_refund') then
      perform app.refund_service_order_payment(v_d.service_order_id,
                case when p_resolution_type = 'full_refund' then 100 else greatest(1, least(99, coalesce(p_refund_percent, 50))) end,
                'dispute:' || v_d.reference, auth.uid());
    end if;
  end if;

  update public.disputes set status = 'resolved', resolution = p_resolution, resolution_type = p_resolution_type,
         resolved_by = auth.uid(), resolved_at = now()
   where id = p_dispute_id;
  perform app.notify(v_d.raised_by, 'dispute.resolved', jsonb_build_object('reference', v_d.reference), '/disputes/' || v_d.id, 'dispute-res:' || v_d.id);
  if v_d.against_user_id is not null then
    perform app.notify(v_d.against_user_id, 'dispute.resolved', jsonb_build_object('reference', v_d.reference), '/disputes/' || v_d.id, 'dispute-res:' || v_d.id);
  end if;
  perform app.audit('dispute.resolved', 'dispute', p_dispute_id::text,
                    jsonb_build_object('resolution_type', p_resolution_type, 'refund_percent', p_refund_percent));
end $$;

-- ---------------------------------------------------------------------------
-- Notifications helpers for the UI
-- ---------------------------------------------------------------------------
create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns void language sql security definer set search_path = '' as $$
  update public.notifications set read_at = now()
   where user_id = auth.uid() and read_at is null and (p_ids is null or id = any (p_ids));
$$;

-- ---------------------------------------------------------------------------
-- Contact form (anonymous, rate limited)
-- ---------------------------------------------------------------------------
create or replace function public.submit_contact_message(p_name text, p_email text, p_phone text, p_subject text, p_message text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not app.rate_limit('contact:' || lower(coalesce(p_email, '')), 3, 3600) then
    raise exception 'Too many messages, try again later' using errcode = 'P0001', hint = 'rate_limited';
  end if;
  insert into public.contact_messages (name, email, phone, subject, message, user_id)
  values (trim(p_name), lower(trim(p_email)), nullif(trim(p_phone), ''), trim(p_subject), trim(p_message), auth.uid());
end $$;
