-- =============================================================================
-- Storage buckets, function privileges, realtime publication
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Storage
--   documents : private. No storage.objects policies at all — every read and
--               write goes through server routes that authorise with the
--               database first and then mint short-lived signed URLs.
--   public-media : public read (lawyer photos, firm logos, article covers).
--               Users may only write inside a folder named after their uid.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('documents', 'documents', false, 26214400,
   array['application/pdf', 'image/jpeg', 'image/png', 'image/webp',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword', 'text/plain']),
  ('public-media', 'public-media', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "public media read" on storage.objects for select to anon, authenticated
  using (bucket_id = 'public-media');
create policy "public media own folder insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'public-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "public media own folder update" on storage.objects for update to authenticated
  using (bucket_id = 'public-media' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'public-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "public media own folder delete" on storage.objects for delete to authenticated
  using (bucket_id = 'public-media' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- Function privileges. Postgres grants EXECUTE to PUBLIC by default and
-- Supabase adds anon/authenticated; we start from zero and allow-list.
-- NOTE: future migrations that add functions must add explicit grants.
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema app from public, anon, authenticated;

-- Helpers evaluated inside RLS policies and invoker-rights triggers.
grant execute on function
  app.is_trusted(), app.has_role(public.app_role), app.is_admin(), app.is_super_admin(), app.is_platform_staff(),
  app.has_permission(text), app.is_active_user(), app.firm_permission_codes(), app.is_firm_member(uuid),
  app.is_firm_owner(uuid), app.firm_has_permission(uuid, text), app.is_public_lawyer(uuid),
  app.is_appointment_party(uuid), app.can_manage_appointment(uuid), app.can_view_matter(uuid), app.can_edit_matter(uuid),
  app.can_assign_matter(uuid), app.is_matter_client(uuid), app.is_conversation_participant(uuid),
  app.can_post_to_conversation(uuid), app.can_access_document(uuid, text), app.is_dispute_party(uuid),
  app.appointment_transition_allowed(public.appointment_status, public.appointment_status),
  app.service_order_transition_allowed(public.service_order_status, public.service_order_status),
  app.matter_transition_allowed(public.matter_status, public.matter_status)
to anon, authenticated, service_role;

-- Public (anonymous) RPCs.
grant execute on function
  public.get_available_slots(uuid, public.consultation_kind, date, date),
  public.search_lawyers(text, text, int, int, public.consultation_kind, bigint, bigint, int, text, numeric, uuid, text, date, text, boolean, text, int, int),
  public.submit_contact_message(text, text, text, text, text)
to anon, authenticated;

-- Authenticated RPCs (each authorises internally).
grant execute on function
  public.my_context(), public.my_firm_permissions(uuid), public.my_entitlements(uuid),
  public.admin_set_role(uuid, public.app_role, boolean), public.admin_set_account_status(uuid, public.account_status, text),
  public.request_account_deletion(), public.cancel_account_deletion(),
  public.submit_lawyer_verification(text, text, uuid[]), public.review_lawyer_verification(uuid, boolean, text),
  public.admin_update_lawyer_status(uuid, public.verification_status, text),
  public.admin_set_lawyer_placement(uuid, boolean, timestamptz),
  public.create_law_firm(text, text, text, int, int), public.invite_firm_member(uuid, text, public.firm_member_type, uuid),
  public.claim_firm_invitations(), public.respond_firm_invitation(uuid, boolean),
  public.update_firm_member(uuid, uuid, public.membership_status, uuid, uuid, text), public.set_primary_firm(uuid),
  public.book_appointment(uuid, public.consultation_kind, timestamptz, text, uuid, uuid),
  public.transition_appointment(uuid, public.appointment_status, text),
  public.reschedule_appointment(uuid, timestamptz, text),
  public.create_follow_up_appointment(uuid, public.consultation_kind, timestamptz, bigint, text),
  public.create_matter_from_appointment(uuid, text),
  public.mark_conversation_read(uuid), public.get_unread_counts(), public.open_matter_conversation(uuid),
  public.create_document_upload(text, public.document_category, text, text, bigint, uuid, uuid, uuid, uuid, uuid, boolean),
  public.authorize_document_download(uuid, int), public.delete_document(uuid),
  public.create_service_order(uuid, uuid, text), public.transition_service_order(uuid, public.service_order_status, text),
  public.submit_review(uuid, uuid, int, text), public.report_review(uuid, text, text),
  public.moderate_review(uuid, public.review_status, text),
  public.open_dispute(uuid, uuid, text, text), public.resolve_dispute(uuid, text, int, text),
  public.mark_notifications_read(uuid[]),
  public.create_payment(public.payable_type, uuid, text, text, text), public.cancel_pending_payment(uuid),
  public.admin_create_refund(uuid, bigint, text), public.request_payout(bigint, uuid),
  public.admin_create_settlement(uuid, uuid, date, date, uuid), public.admin_mark_settlement_paid(uuid, text),
  public.start_subscription(text, text, uuid), public.cancel_subscription(uuid, boolean), public.resume_subscription(uuid),
  public.lawyer_dashboard_stats(), public.lawyer_report(date, date), public.firm_report(uuid, date, date),
  public.admin_overview_stats(), public.admin_report(date, date)
to authenticated;

-- Everything (including worker-only RPCs) for the service role.
grant execute on all functions in schema public to service_role;
grant execute on all functions in schema app to service_role;

-- Worker-only RPCs must never be reachable by end users.
revoke execute on function
  public.record_payment_result(text, text, text, text, text, boolean, bigint, text, bigint, boolean, jsonb),
  public.attach_provider_order(uuid, text),
  public.claim_refunds(int), public.complete_refund(uuid, boolean, text, text),
  public.mark_document_uploaded(uuid, int, bigint, text, public.scan_status),
  public.expire_stale_appointments(), public.queue_reminders(), public.auto_complete_delivered_orders(),
  public.process_subscription_renewals(),
  public.claim_notification_deliveries(int), public.complete_notification_delivery(uuid, public.delivery_status, text, text, text)
from anon, authenticated;

-- Sequences used by column defaults during RPC-less inserts.
grant usage on all sequences in schema public to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Realtime: postgres_changes respects RLS, so only authorised rows stream.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.messages, public.notifications, public.appointments, public.matter_events, public.conversation_participants;
  end if;
end $$;
