-- =============================================================================
-- Service moderation, invoice notifications, stale-upload cleanup
-- =============================================================================

-- Admin moderation of legal services (activate / suspend / return to draft)
-- with a documented note, audit entry and lawyer notification.
create or replace function public.admin_moderate_service(p_service_id uuid, p_status text, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_lawyer uuid;
  v_title text;
begin
  perform app.require_user();
  if not app.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if p_status not in ('active', 'suspended', 'draft') then
    raise exception 'Unsupported moderation status' using errcode = '22023';
  end if;
  if p_status <> 'active' and coalesce(trim(p_note), '') = '' then
    raise exception 'A documented reason is required' using errcode = '22023';
  end if;
  update public.legal_services
     set status = p_status, moderation_note = nullif(trim(p_note), '')
   where id = p_service_id
  returning lawyer_id, title_ar into v_lawyer, v_title;
  if v_lawyer is null then
    raise exception 'Service not found' using errcode = 'P0002';
  end if;
  perform app.audit('service.moderated', 'legal_service', p_service_id::text, jsonb_build_object('status', p_status, 'note', p_note));
  perform app.notify(v_lawyer, 'service.moderated',
                     jsonb_build_object('title', v_title, 'status', p_status, 'note', coalesce(nullif(trim(p_note), ''), '—')),
                     '/lawyer/services', 'service-mod:' || p_service_id || ':' || p_status || ':' || extract(epoch from now())::bigint);
end $$;

insert into public.notification_templates (event_type, channel, locale, subject, body) values
  ('service.moderated', 'in_app', 'ar', 'تحديث على خدمتك', 'تم تحديث حالة خدمة «{{title}}». ملاحظة الإدارة: {{note}}'),
  ('service.moderated', 'in_app', 'en', 'Service update', 'The status of your service “{{title}}” changed. Admin note: {{note}}')
on conflict (event_type, channel, locale) do nothing;

-- Notify the platform client an invoice was issued to them.
create or replace function app.on_invoice_issued()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'issued' and (tg_op = 'INSERT' or old.status is distinct from 'issued') and new.bill_to_user_id is not null then
    perform app.notify(new.bill_to_user_id, 'invoice.issued', jsonb_build_object('number', new.number),
                       '/invoices/' || new.id, 'invoice-issued:' || new.id);
  end if;
  return new;
end $$;
drop trigger if exists invoices_issued_notify on public.invoices;
create trigger invoices_issued_notify after insert or update of status on public.invoices
  for each row execute function app.on_invoice_issued();

-- Upload sessions that never completed: mark the versions abandoned and return
-- their storage paths so the worker can remove any partial objects.
create or replace function public.claim_stale_uploads(p_older_than interval default interval '24 hours', p_limit int default 100)
returns table (document_id uuid, version int, bucket text, storage_path text)
language plpgsql security definer set search_path = '' as $$
begin
  return query
  with stale as (
    select v.id, v.document_id, v.version, v.storage_bucket, v.storage_path
      from public.document_versions v
     where v.uploaded_at is null and v.created_at < now() - p_older_than
     order by v.created_at
     limit least(greatest(p_limit, 1), 500)
     for update skip locked
  ), removed as (
    delete from public.document_versions v using stale s where v.id = s.id
    returning s.document_id, s.version, s.storage_bucket, s.storage_path
  ), docs as (
    -- Documents whose only version never arrived are soft-deleted.
    update public.documents d set status = 'deleted', deleted_at = now()
     where d.status = 'pending_upload' and d.id in (select r.document_id from removed r)
       and not exists (select 1 from public.document_versions v2 where v2.document_id = d.id and v2.uploaded_at is not null
                       and v2.id not in (select s.id from stale s))
    returning d.id
  )
  select r.document_id, r.version, r.storage_bucket, r.storage_path from removed r;
end $$;

revoke execute on function public.admin_moderate_service(uuid, text, text) from public, anon;
grant execute on function public.admin_moderate_service(uuid, text, text) to authenticated, service_role;
revoke execute on function public.claim_stale_uploads(interval, int) from public, anon, authenticated;
grant execute on function public.claim_stale_uploads(interval, int) to service_role;
revoke execute on function app.on_invoice_issued() from public, anon, authenticated;

-- Admin rejection of a payout request (approval happens through admin_create_settlement).
create or replace function public.admin_reject_payout(p_request_id uuid, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_req public.payout_requests%rowtype;
begin
  perform app.require_user();
  if not app.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if coalesce(trim(p_note), '') = '' then
    raise exception 'A documented reason is required' using errcode = '22023';
  end if;
  update public.payout_requests set status = 'rejected', review_note = trim(p_note), reviewed_by = auth.uid()
   where id = p_request_id and status = 'requested'
  returning * into v_req;
  if not found then
    raise exception 'Payout request is not pending' using errcode = '22023';
  end if;
  perform app.audit('payout.rejected', 'payout_request', p_request_id::text, jsonb_build_object('note', p_note));
  perform app.notify(v_req.requested_by, 'payout.rejected', jsonb_build_object('note', trim(p_note)),
                     case when v_req.firm_id is not null then '/firm/finance' else '/lawyer/finance' end, 'payout-rejected:' || p_request_id);
end $$;

insert into public.notification_templates (event_type, channel, locale, subject, body) values
  ('payout.rejected', 'in_app', 'ar', 'تعذّر تنفيذ طلب التحويل', 'لم تتم الموافقة على طلب التحويل: {{note}}'),
  ('payout.rejected', 'in_app', 'en', 'Payout request declined', 'Your payout request was declined: {{note}}')
on conflict (event_type, channel, locale) do nothing;

revoke execute on function public.admin_reject_payout(uuid, text) from public, anon;
grant execute on function public.admin_reject_payout(uuid, text) to authenticated, service_role;

-- Payable balances per beneficiary (ledger minus settlements already in flight), for admins.
create or replace function public.admin_beneficiary_balances()
returns table (lawyer_id uuid, firm_id uuid, name text, balance_minor bigint, in_flight_minor bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  return query
  with bal as (
    select e.beneficiary_lawyer_id, e.beneficiary_firm_id, sum(e.credit_minor - e.debit_minor)::bigint as b
      from public.financial_ledger_entries e
     where e.account = 'beneficiary_payable'
     group by 1, 2
  )
  select bal.beneficiary_lawyer_id, bal.beneficiary_firm_id,
         coalesce(lp.display_name_ar, f.name_ar),
         bal.b,
         coalesce((select sum(s.net_minor) from public.settlements s
                    where s.status in ('pending', 'processing')
                      and (s.beneficiary_lawyer_id = bal.beneficiary_lawyer_id or s.beneficiary_firm_id = bal.beneficiary_firm_id)), 0)::bigint
    from bal
    left join public.lawyer_profiles lp on lp.id = bal.beneficiary_lawyer_id
    left join public.law_firms f on f.id = bal.beneficiary_firm_id
   where bal.b > 0
   order by bal.b desc;
end $$;

revoke execute on function public.admin_beneficiary_balances() from public, anon;
grant execute on function public.admin_beneficiary_balances() to authenticated, service_role;
