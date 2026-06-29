-- ============================================================================
-- CET-2 · Migration 0002 — Group ownership RPCs (the sanctioned owner paths)
-- ----------------------------------------------------------------------------
-- Ownership mutations never happen via direct client DML (RLS forbids touching
-- owner rows + the created_by pointer). They flow through these SECURITY DEFINER
-- functions, which run with definer privilege (bypass RLS) and set the txn-local
-- `app.allow_owner_change` flag to pass the groups created_by guard trigger.
--
--   * create_group(name)        — solves the bootstrap: group + owner membership
--                                 in ONE transaction; returns the row (dodges the
--                                 RETURNING/SELECT-policy problem); invite_code
--                                 generated + collision-retried server-side.
--   * transfer_ownership(g, to) — owner hands off to an existing member (D26).
--
-- Deferred to later migrations (need tables that don't exist yet):
--   * claim_ownership   (D27 succession — needs `logs` for the dormancy check)
--   * reassign_owner    (D27 super-admin recovery — writes `audit_log`)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- create_group: bootstrap a group with its creator as owner, atomically.
-- ----------------------------------------------------------------------------
create or replace function public.create_group(p_name text)
  returns public.groups
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid    uuid := (select auth.uid());
  v_code   text;
  v_tries  int := 0;
  g        public.groups;
begin
  if v_uid is null then
    raise exception 'must be authenticated to create a group';
  end if;
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'group name is required';
  end if;

  -- owner row insert is sanctioned → allow it past the owner guards
  perform set_config('app.allow_owner_change', 'on', true);

  loop
    -- 8 hex chars from a fresh uuid (no pgcrypto dependency); retry on collision
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    begin
      insert into public.groups (name, invite_code, created_by)
      values (btrim(p_name), v_code, v_uid)
      returning * into g;
      exit; -- success
    exception when unique_violation then
      v_tries := v_tries + 1;
      if v_tries >= 5 then
        raise exception 'could not allocate a unique invite code, please retry';
      end if;
    end;
  end loop;

  insert into public.memberships (user_id, group_id, role)
  values (v_uid, g.id, 'owner');

  return g;
end;
$$;

revoke all on function public.create_group(text) from public, anon;
grant execute on function public.create_group(text) to authenticated;

-- ----------------------------------------------------------------------------
-- transfer_ownership: current owner → an existing member (D26, owner-only).
-- Demote old owner → admin, promote target → owner, move the created_by pointer.
-- Demote-first order keeps the one_owner_per_group unique index satisfied.
-- ----------------------------------------------------------------------------
create or replace function public.transfer_ownership(p_group uuid, p_new_owner uuid)
  returns void
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if not public.is_group_owner(p_group) then
    raise exception 'only the current owner can transfer ownership';
  end if;
  if p_new_owner = v_uid then
    raise exception 'you already own this group';
  end if;
  if not exists (
    select 1 from public.memberships
    where group_id = p_group and user_id = p_new_owner
  ) then
    raise exception 'the new owner must already be a member of the group';
  end if;

  perform set_config('app.allow_owner_change', 'on', true);

  update public.memberships set role = 'admin'
    where group_id = p_group and user_id = v_uid and role = 'owner';
  update public.memberships set role = 'owner'
    where group_id = p_group and user_id = p_new_owner;
  update public.groups set created_by = p_new_owner
    where id = p_group;
end;
$$;

revoke all on function public.transfer_ownership(uuid, uuid) from public, anon;
grant execute on function public.transfer_ownership(uuid, uuid) to authenticated;
