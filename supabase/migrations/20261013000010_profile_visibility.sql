-- =============================================================================
-- Profile visibility between related parties
-- A user's profile (name, phone, avatar) is visible to people they actually
-- work with: appointment counterparts, conversation participants, matter teams
-- and clients, firm colleagues, service-order parties and dispute parties.
-- =============================================================================

create or replace function app.can_see_profile(p_profile_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_profile_id = auth.uid()
    or exists (select 1 from public.appointments a
               where (a.client_id = p_profile_id and (a.lawyer_id = auth.uid()
                        or (a.firm_id is not null and app.firm_has_permission(a.firm_id, 'appointments.manage'))))
                  or (a.lawyer_id = p_profile_id and a.client_id = auth.uid()))
    or exists (select 1 from public.conversation_participants me
                 join public.conversation_participants other on other.conversation_id = me.conversation_id
               where me.user_id = auth.uid() and other.user_id = p_profile_id)
    or exists (select 1 from public.legal_matters m
               where (m.client_user_id = p_profile_id and app.can_view_matter(m.id))
                  or (m.client_user_id = auth.uid() and (m.owner_lawyer_id = p_profile_id
                      or exists (select 1 from public.matter_members mm where mm.matter_id = m.id and mm.user_id = p_profile_id))))
    or exists (select 1 from public.matter_members a join public.matter_members b on a.matter_id = b.matter_id
               where a.user_id = auth.uid() and b.user_id = p_profile_id)
    or exists (select 1 from public.law_firm_members a join public.law_firm_members b on a.firm_id = b.firm_id
               where a.user_id = auth.uid() and a.status = 'active' and b.user_id = p_profile_id and b.status in ('active', 'invited'))
    or exists (select 1 from public.service_orders o
               where (o.client_id = p_profile_id and o.lawyer_id = auth.uid()) or (o.lawyer_id = p_profile_id and o.client_id = auth.uid()))
    or exists (select 1 from public.disputes d
               where (d.raised_by = auth.uid() and d.against_user_id = p_profile_id) or (d.against_user_id = auth.uid() and d.raised_by = p_profile_id))
    or exists (select 1 from public.practice_clients pc
               where pc.user_id = p_profile_id and (pc.owner_lawyer_id = auth.uid()
                     or (pc.firm_id is not null and app.firm_has_permission(pc.firm_id, 'clients.manage'))))
    or exists (select 1 from public.reviews r where r.client_id = p_profile_id and r.lawyer_id = auth.uid());
$$;

grant execute on function app.can_see_profile(uuid) to authenticated, service_role;

create policy profiles_select_related on public.profiles for select to authenticated
  using (app.can_see_profile(id));
