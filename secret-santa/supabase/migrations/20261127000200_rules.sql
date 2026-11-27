-- Secret Santa: who may read and change what.

-- ---------------------------------------------------------------------------
-- Helpers used by the rules. They live outside the API schema.
-- ---------------------------------------------------------------------------

create function private.is_party_member(p uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.party_members m
    where m.party_id = p and m.user_id = (select auth.uid())
  )
$$;

create function private.party_owner(p uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select owner_id from public.parties where id = p
$$;

create function private.is_party_owner(p uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.parties where id = p and owner_id = (select auth.uid())
  )
$$;

create function private.shares_party(other uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.party_members mine
    join public.party_members theirs on theirs.party_id = mine.party_id
    where mine.user_id = (select auth.uid()) and theirs.user_id = other
  )
$$;

revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;
revoke execute on all functions in schema private from public;
grant execute on function
  private.is_party_member(uuid),
  private.party_owner(uuid),
  private.is_party_owner(uuid),
  private.shares_party(uuid)
to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Table permissions: start from nothing, then allow exactly what is needed.
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;
grant all on all tables in schema public to service_role;
grant all on private.party_invites to service_role;

grant select on public.profiles to authenticated;
grant update (display_name, avatar_path) on public.profiles to authenticated;

grant select, delete on public.parties to authenticated;
grant insert (name, owner_id, budget, exchange_date, note) on public.parties to authenticated;
grant update (name, budget, exchange_date, note) on public.parties to authenticated;

grant select, delete on public.party_members to authenticated;
grant update (in_draw) on public.party_members to authenticated;

grant select, insert, delete on public.exclusions to authenticated;

grant select, insert, delete on public.wishes to authenticated;
grant update (title, url, price, note, position) on public.wishes to authenticated;

grant select on public.draw_participants to authenticated;
grant select on public.assignments to authenticated;

-- ---------------------------------------------------------------------------
-- Row rules.
-- ---------------------------------------------------------------------------

create policy "read own profile and profiles of people in my parties" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select private.shares_party(id)));

create policy "update own profile" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "read parties I am in" on public.parties
  for select to authenticated
  using (owner_id = (select auth.uid()) or (select private.is_party_member(id)));

create policy "start a party as myself" on public.parties
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy "organizer updates the party" on public.parties
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "organizer deletes the party" on public.parties
  for delete to authenticated
  using (owner_id = (select auth.uid()));

create policy "read members of my parties" on public.party_members
  for select to authenticated
  using ((select private.is_party_member(party_id)));

create policy "organizer sets who is in the draw" on public.party_members
  for update to authenticated
  using ((select private.is_party_owner(party_id)))
  with check ((select private.is_party_owner(party_id)));

-- The organizer can remove others; anyone can leave; the organizer's own row stays.
create policy "organizer removes members, members leave" on public.party_members
  for delete to authenticated
  using (
    ((select private.is_party_owner(party_id)) or user_id = (select auth.uid()))
    and user_id <> (select private.party_owner(party_id))
  );

create policy "organizer reads pairs" on public.exclusions
  for select to authenticated
  using ((select private.is_party_owner(party_id)));

create policy "organizer adds pairs" on public.exclusions
  for insert to authenticated
  with check ((select private.is_party_owner(party_id)));

create policy "organizer removes pairs" on public.exclusions
  for delete to authenticated
  using ((select private.is_party_owner(party_id)));

create policy "read own wishes and wishes of people in my parties" on public.wishes
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.shares_party(user_id)));

create policy "add own wishes" on public.wishes
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "update own wishes" on public.wishes
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "delete own wishes" on public.wishes
  for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "read who took part in my parties' draws" on public.draw_participants
  for select to authenticated
  using ((select private.is_party_member(party_id)));

-- The heart of the secret: you can read a match only if you are the giver.
-- There is deliberately no insert, update or delete rule.
create policy "read only my own match" on public.assignments
  for select to authenticated
  using (giver_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Triggers.
-- ---------------------------------------------------------------------------

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  picture text := coalesce(meta ->> 'avatar_url', meta ->> 'picture');
begin
  -- Sign-up details can be set by the person signing up, so a picture address is
  -- only trusted when the sign-up really came through Google.
  if coalesce(new.raw_app_meta_data ->> 'provider', '') <> 'google' then
    picture := null;
  end if;

  insert into public.profiles (id, display_name, google_avatar_url)
  values (
    new.id,
    left(coalesce(
      nullif(trim(meta ->> 'full_name'), ''),
      nullif(trim(meta ->> 'name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Guest'
    ), 60),
    case when picture like 'https://%' then picture end
  );
  return new;
end
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.handle_new_party() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into private.party_invites (party_id) values (new.id);
  insert into public.party_members (party_id, user_id) values (new.id, new.owner_id);
  return new;
end
$$;

create trigger on_party_created
  after insert on public.parties
  for each row execute function public.handle_new_party();

create function public.note_pairs_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.parties set pairs_changed_at = now()
  where id = coalesce(new.party_id, old.party_id);
  return null;
end
$$;

create trigger on_exclusions_changed
  after insert or delete on public.exclusions
  for each row execute function public.note_pairs_changed();

create function public.limit_wishes() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (select count(*) from public.wishes where user_id = new.user_id) >= 100 then
    raise exception 'A wishlist can hold at most 100 wishes';
  end if;
  return new;
end
$$;

create trigger before_wish_insert
  before insert on public.wishes
  for each row execute function public.limit_wishes();

-- ---------------------------------------------------------------------------
-- Functions the app calls.
-- ---------------------------------------------------------------------------

-- What a visitor sees on an invite link before signing in.
create function public.invite_preview(p_code text)
returns table (party_name text, organizer_name text)
language sql stable security definer set search_path = '' as $$
  select p.name, o.display_name
  from private.party_invites i
  join public.parties p on p.id = i.party_id
  join public.profiles o on o.id = p.owner_id
  where i.code = p_code
$$;

-- Join the party an invite code belongs to. Returns null for a wrong code.
create function public.join_party(p_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  target uuid;
begin
  if me is null then
    raise exception 'Sign in first';
  end if;
  select party_id into target from private.party_invites where code = p_code;
  if target is null then
    return null;
  end if;
  insert into public.party_members (party_id, user_id)
  values (target, me)
  on conflict do nothing;
  return target;
end
$$;

create function public.party_invite_code(p uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_party_owner(p) then
    raise exception 'Only the organizer can do that';
  end if;
  return (select code from private.party_invites where party_id = p);
end
$$;

create function public.reset_invite_code(p uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  fresh text := replace(gen_random_uuid()::text, '-', '');
begin
  if not private.is_party_owner(p) then
    raise exception 'Only the organizer can do that';
  end if;
  update private.party_invites set code = fresh where party_id = p;
  return fresh;
end
$$;

-- How many people took part and how many matches still stand. Shows no pair.
create function public.draw_status(p uuid)
returns table (participants integer, matches integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_party_member(p) then
    raise exception 'Only a member of this party can do that';
  end if;
  return query
    select
      (select count(*)::integer from public.draw_participants d where d.party_id = p),
      (select count(*)::integer from public.assignments a where a.party_id = p);
end
$$;

-- Replace a party's matches in one step. Called only by the server.
create function public.replace_assignments(p_party uuid, p_pairs jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  -- One draw at a time per party.
  perform 1 from public.parties where id = p_party for update;
  if not found then
    raise exception 'Party not found';
  end if;

  delete from public.assignments where party_id = p_party;
  delete from public.draw_participants where party_id = p_party;

  insert into public.draw_participants (party_id, user_id)
  select p_party, (pair ->> 'giver_id')::uuid
  from jsonb_array_elements(p_pairs) as pair;

  insert into public.assignments (party_id, giver_id, receiver_id)
  select p_party, (pair ->> 'giver_id')::uuid, (pair ->> 'receiver_id')::uuid
  from jsonb_array_elements(p_pairs) as pair;

  update public.parties set drawn_at = now(), pairs_changed_at = null where id = p_party;
end
$$;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.invite_preview(text) to anon, authenticated, service_role;
grant execute on function
  public.join_party(text),
  public.party_invite_code(uuid),
  public.reset_invite_code(uuid),
  public.draw_status(uuid)
to authenticated, service_role;
grant execute on function public.replace_assignments(uuid, jsonb) to service_role;
