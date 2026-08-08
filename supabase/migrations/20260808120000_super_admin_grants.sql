-- ============================================================================
-- Migration 0026 — an organiser can appoint another organiser (D56, amends D27)
-- ----------------------------------------------------------------------------
-- D27 made `is_super_admin` "grantable only directly in Supabase (no in-app UI;
-- can't be self-escalated, so a compromised account can't grab power)". The
-- rationale is SELF-escalation — an ordinary account grabbing power — and that
-- is not what this opens. Nothing here lets the client write the column: the
-- guard trigger still refuses any flip from `authenticated`/`anon`, and it is
-- deliberately left exactly as it is. These are SECURITY DEFINER functions that
-- refuse unless the caller is ALREADY a super admin.
--
-- WHY THE ORIGINAL RULE COULD NOT STAY. The flag stopped being a break-glass
-- recovery switch when 0025 made it the reader for the programme report — the
-- screen a real payment is decided on (D55). "Ask the person with the Supabase
-- password" is a workable answer for a once-a-year recovery and a bad one for
-- an ordinary administrative role, and it makes the project depend on whoever
-- holds that password, which is precisely the bottleneck D27 existed to remove.
--
-- WHAT MOVES, AND WHAT DOES NOT
--
--   * The FIRST super admin is still made in the Supabase dashboard. There is
--     no bootstrap path here and there must not be: a function that promotes
--     when no super admin exists is a self-escalation hole with extra steps.
--   * Promotion is BY EXACT EMAIL, never from a browsable list. You have to
--     already know who you are appointing. Enumerating the app's users would be
--     a god view (D26/D27), and this is the one place it would be tempting.
--   * `list_super_admins` returns only the people who already hold the role — a
--     bounded roster of the administration itself, not a directory.
--   * Both actions are AUDITED. D27 said every super-admin action is logged;
--     `audit_log` has been waiting since 0010 with exactly the right columns.
--
-- THE LAST ORGANISER CANNOT BE REMOVED. Otherwise the app can be locked out of
-- its own administration and the only way back in is the dashboard — the state
-- this migration exists to stop being routine.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- The BOOTSTRAP grant — how the first organiser is made
-- ----------------------------------------------------------------------------
-- The guard trigger has always named service_role an allowed setter, but 0006
-- revoked default privileges for EVERY role, so the role the trigger permits
-- could not reach the table at all. This makes that stated intent true, the
-- same way `push_subscriptions` had to (standard #6).
--
-- Column-scoped: service_role gets `is_super_admin` and nothing else writable
-- on `profiles`. It is not a widening in any real sense — a holder of the
-- service key can already mint a session for any account through the admin auth
-- API — but it is what the dashboard, a recovery script, and `e2e/helpers.ts`
-- use to create the FIRST organiser, which by design has no in-app path.
grant select, update (is_super_admin) on public.profiles to service_role;

-- ----------------------------------------------------------------------------
-- list_super_admins — who currently holds the role
-- ----------------------------------------------------------------------------
-- Email is included because a name does not identify a person: two members
-- called Ahmad are two rows and removing the wrong one is silent. It reads
-- `auth.users`, which no client role can touch directly — hence DEFINER.
create or replace function public.list_super_admins()
  returns table (user_id uuid, name text, email text)
  language sql security definer stable set search_path = '' as $$
  select p.id, p.name, u.email::text
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.is_super_admin
    and private.is_super_admin()   -- no caller check, no rows. See note below.
  order by p.name nulls last;
$$;

-- The gate is inside the WHERE on purpose: a SQL function cannot raise, and a
-- non-organiser calling this gets an empty set rather than an error. That is the
-- honest answer for a LIST — "you may see nobody" — and it keeps the function
-- stable. The two WRITERS below raise, because a refused write must never look
-- like a successful one.

revoke all on function public.list_super_admins() from public, anon;
grant execute on function public.list_super_admins() to authenticated;

comment on function public.list_super_admins() is
  'The administration''s own roster (0026, D56). Organisers only — anyone else '
  'gets an empty set. NOT a user directory: it returns the people who already '
  'hold the role and nobody else.';

-- ----------------------------------------------------------------------------
-- grant_super_admin — appoint an organiser, by exact email
-- ----------------------------------------------------------------------------
create or replace function public.grant_super_admin(p_email text)
  returns table (user_id uuid, name text)
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid    uuid := (select auth.uid());
  v_target uuid;
  v_name   text;
begin
  if not private.is_super_admin() then
    raise exception 'organisers only';
  end if;

  -- Exact match, case-insensitively: addresses are stored lowercased by GoTrue,
  -- but a human types "Ahmad@Example.com" and would otherwise be told the
  -- account does not exist. No pattern, no prefix — this must not become a way
  -- to probe for accounts.
  select u.id into v_target
  from auth.users u
  where lower(u.email) = lower(trim(p_email));

  if v_target is null then
    raise exception 'no account with that email address';
  end if;

  select p.name into v_name from public.profiles p where p.id = v_target;

  -- Already an organiser is a no-op with a clear message rather than a silent
  -- success: the caller asked for a state change and none happened, and an
  -- audit entry for a promotion that did not occur is a false record.
  if exists (
    select 1 from public.profiles p where p.id = v_target and p.is_super_admin
  ) then
    raise exception 'that person is already an organiser';
  end if;

  -- The guard trigger (0001) does not fire here: it keys off `current_user`,
  -- which inside a DEFINER function owned by postgres is not `authenticated`.
  -- That is the documented mechanism, not a bypass — the trigger's own comment
  -- names the dashboard, service_role and postgres as the allowed setters.
  update public.profiles set is_super_admin = true where id = v_target;

  insert into public.audit_log (actor_id, action, target_user_id, detail)
  values (v_uid, 'grant_super_admin', v_target,
          jsonb_build_object('email', lower(trim(p_email))));

  return query select v_target, v_name;
end;
$$;

revoke all on function public.grant_super_admin(text) from public, anon;
grant execute on function public.grant_super_admin(text) to authenticated;

comment on function public.grant_super_admin(text) is
  'Appoint an organiser (0026, D56). Organisers only, by EXACT email — never '
  'from a browsable list, because enumerating the app''s users is the god view '
  'D26/D27 refuses. Audited. The FIRST organiser is still made in Supabase.';

-- ----------------------------------------------------------------------------
-- revoke_super_admin — stand one down, but never the last
-- ----------------------------------------------------------------------------
create or replace function public.revoke_super_admin(p_user uuid) returns void
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if not private.is_super_admin() then
    raise exception 'organisers only';
  end if;

  -- Serialise every revoke against every other one BEFORE reading the roster.
  -- Without this the last-organiser check is a classic read-then-write race:
  -- two organisers standing each other down concurrently each still see the
  -- other as present in their own snapshot, both commit, and the app is left
  -- with nobody — the exact state this function exists to prevent, reachable by
  -- two clicks a second apart.
  perform pg_advisory_xact_lock(hashtext('cetele.super_admin_roster'));

  update public.profiles set is_super_admin = false
  where id = p_user and is_super_admin;
  if not found then
    raise exception 'that person is not an organiser';
  end if;

  -- Checked AFTER the update and inside the same transaction, so the count
  -- includes this removal. Raising here rolls the update back.
  if not exists (select 1 from public.profiles where is_super_admin) then
    raise exception 'the last organiser cannot be stood down';
  end if;

  -- Standing YOURSELF down is allowed and is the ordinary way to hand over —
  -- the check above is the only thing that has to hold.
  insert into public.audit_log (actor_id, action, target_user_id, detail)
  values (v_uid, 'revoke_super_admin', p_user,
          jsonb_build_object('self', v_uid = p_user));
end;
$$;

revoke all on function public.revoke_super_admin(uuid) from public, anon;
grant execute on function public.revoke_super_admin(uuid) to authenticated;

comment on function public.revoke_super_admin(uuid) is
  'Stand an organiser down (0026, D56). Organisers only; standing yourself down '
  'is allowed, but the LAST organiser cannot be removed or the app is locked '
  'out of its own administration. Serialised by advisory lock. Audited.';
