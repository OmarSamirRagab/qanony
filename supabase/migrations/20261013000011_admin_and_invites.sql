-- =============================================================================
-- Invitee visibility of firms; admin user directory (emails live in auth.users)
-- =============================================================================

create policy law_firms_invitee_read on public.law_firms for select to authenticated
  using (exists (select 1 from public.law_firm_members m
                 where m.firm_id = law_firms.id and m.user_id = auth.uid() and m.status = 'invited'));

-- Paged user directory for staff with users.view (support/admin). Returns no
-- legal content — identity, roles and status only.
create or replace function public.admin_list_users(
  p_query text default null, p_role public.app_role default null, p_status public.account_status default null,
  p_limit int default 25, p_offset int default 0
)
returns table (id uuid, full_name text, email text, phone text, status public.account_status, roles public.app_role[],
               created_at timestamptz, last_sign_in_at timestamptz, total_count bigint)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_q text := nullif(lower(trim(p_query)), '');
begin
  if not app.has_permission('users.view') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return query
  with base as (
    select p.id, p.full_name, u.email::text as email, p.phone, p.status,
           coalesce((select array_agg(r.role order by r.role) from public.user_roles r where r.user_id = p.id), '{}') as roles,
           p.created_at, null::timestamptz as last_sign_in_at
      from public.profiles p join auth.users u on u.id = p.id
     where (v_q is null or lower(p.full_name) like '%' || v_q || '%' or lower(u.email) like '%' || v_q || '%' or p.phone like '%' || v_q || '%')
       and (p_role is null or exists (select 1 from public.user_roles r where r.user_id = p.id and r.role = p_role))
       and (p_status is null or p.status = p_status)
  )
  select b.*, (select count(*) from base) from base b
   order by b.created_at desc
   limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end $$;

revoke execute on function public.admin_list_users(text, public.app_role, public.account_status, int, int) from public, anon;
grant execute on function public.admin_list_users(text, public.app_role, public.account_status, int, int) to authenticated, service_role;

-- Firm verification decision by admins (mirrors lawyer verification).
create or replace function public.admin_set_firm_verification(p_firm_id uuid, p_status public.verification_status, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid;
begin
  perform app.require_user();
  if not app.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'A documented reason is required' using errcode = '22023';
  end if;
  update public.law_firms
     set verification_status = p_status,
         verified_at = case when p_status = 'verified' then now() else null end,
         is_published = case when p_status = 'verified' then is_published else false end
   where id = p_firm_id
  returning owner_id into v_owner;
  perform app.audit('firm.verification', 'law_firm', p_firm_id::text, jsonb_build_object('status', p_status, 'reason', p_reason));
  if v_owner is not null then
    perform app.notify(v_owner, case when p_status = 'verified' then 'verification.approved' else 'verification.rejected' end,
                       jsonb_build_object('reason', p_reason), '/firm/profile', 'firm-verif:' || p_firm_id || ':' || p_status);
  end if;
end $$;

revoke execute on function public.admin_set_firm_verification(uuid, public.verification_status, text) from public, anon;
grant execute on function public.admin_set_firm_verification(uuid, public.verification_status, text) to authenticated, service_role;
