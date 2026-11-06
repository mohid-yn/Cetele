-- ============================================================================
-- Migration 0042: branches — WHERE a circle is (D79)
-- ----------------------------------------------------------------------------
-- Until now a circle belonged to nowhere. That was fine while everything in the
-- app was the circle's own (tasks, rings, streaks) or the whole administration's
-- (roadmaps). Camps and halaqahs are neither: a Melbourne camp is for the
-- circles in Melbourne, and a south-east halaqah is for the south-east.
--
-- THE MODEL. A branch is a place, nested to any depth:
--
--   Youth Nexus → Victoria → Melbourne → South East Melbourne
--
-- A circle sits in at most one branch (`groups.branch_id`). Its REACH is that
-- branch and every branch above it, so a circle in South East Melbourne hears
-- about the Melbourne camp and the Victoria camp, and never about Brisbane.
--
-- STEWARDS run a branch and everything under it. The organiser role
-- (`is_super_admin`) is a steward of every branch, so nothing an organiser
-- could do changes, and appointing a steward never touches that flag.
--
-- JOINING A BRANCH IS APPROVED. A circle's admin asks, and a steward of that
-- branch says yes. Otherwise any circle could claim Melbourne and read the
-- venue of every Melbourne camp. A steward asking for their own branch is
-- approved by asking.
--
-- WHAT A STEWARD SEES. The names of the circles in their branch and how many
-- people are in each. Never a member's name, dhikr or streak (D26, D27): a
-- branch is a mailing list for invitations, not a window into circles.
--
-- Nothing here touches logging. `groups.branch_id` is read by nothing on the
-- core loop.
-- ============================================================================

create table public.branches (
  id         uuid primary key default gen_random_uuid(),
  -- RESTRICT: a branch with children cannot go. `delete_branch` says so first.
  parent_id  uuid references public.branches (id) on delete restrict,
  name       text not null check (char_length(btrim(name)) between 1 and 80),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Two "North" branches under one parent would be two rows nobody can tell
-- apart in a picker. Roots are compared among themselves.
create unique index branches_sibling_name_idx
  on public.branches (
    coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(btrim(name))
  );
create index branches_parent_idx on public.branches (parent_id);

comment on table public.branches is
  'Places, nested (0042, D79). A circle sits in at most one; its reach is that '
  'branch and every ancestor. Written only through the branch RPCs.';

create table public.branch_stewards (
  branch_id  uuid not null references public.branches (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (branch_id, user_id)
);
create index branch_stewards_user_idx on public.branch_stewards (user_id);

comment on table public.branch_stewards is
  'Who runs a branch and everything under it (0042, D79). Organisers are '
  'stewards of every branch without a row here.';

-- RESTRICT, so a branch holding circles cannot be deleted out from under them.
alter table public.groups
  add column branch_id uuid references public.branches (id) on delete restrict;
create index groups_branch_idx on public.groups (branch_id);

comment on column public.groups.branch_id is
  'The branch this circle sits in (0042, D79). Set only through '
  'decide_branch_request / request_branch; not in the client''s update grant.';

-- One open request per circle. Asking again replaces it.
create table public.branch_requests (
  group_id     uuid primary key references public.groups (id) on delete cascade,
  branch_id    uuid not null references public.branches (id) on delete cascade,
  requested_by uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);
create index branch_requests_branch_idx on public.branch_requests (branch_id);

-- ----------------------------------------------------------------------------
-- Helpers
-- ----------------------------------------------------------------------------

-- A branch and every branch above it. The depth guard stops a cycle (which the
-- RPCs cannot create, since a parent is fixed at birth) from looping forever.
create or replace function private.branch_lineage(b uuid)
  returns setof uuid
  language sql security definer stable set search_path = '' as $$
  with recursive up (id, parent_id, depth) as (
    select br.id, br.parent_id, 0 from public.branches br where br.id = b
    union all
    select p.id, p.parent_id, up.depth + 1
      from public.branches p
      join up on p.id = up.parent_id
     where up.depth < 32
  )
  select id from up;
$$;

-- A branch and every branch below it.
create or replace function private.branch_subtree(b uuid)
  returns setof uuid
  language sql security definer stable set search_path = '' as $$
  with recursive down (id, depth) as (
    select br.id, 0 from public.branches br where br.id = b
    union all
    select c.id, down.depth + 1
      from public.branches c
      join down on c.parent_id = down.id
     where down.depth < 32
  )
  select id from down;
$$;

create or replace function private.is_steward_of(b uuid)
  returns boolean
  language sql security definer stable set search_path = '' as $$
  select private.is_super_admin()
      or exists (
           select 1
             from public.branch_stewards s
            where s.user_id = (select auth.uid())
              and s.branch_id in (select private.branch_lineage(b))
         );
$$;

-- Every branch whose events reach the caller: each branch one of their circles
-- sits in, and everything above it. Organisers and stewards are NOT given more
-- here; what they manage is `is_steward_of`, a different question.
create or replace function private.my_reach()
  returns setof uuid
  language sql security definer stable set search_path = '' as $$
  select distinct l
    from public.memberships m
    join public.groups g on g.id = m.group_id
   cross join lateral private.branch_lineage(g.branch_id) as l
   where m.user_id = (select auth.uid())
     and g.branch_id is not null;
$$;

revoke all on function private.branch_lineage(uuid) from public;
revoke all on function private.branch_subtree(uuid) from public;
revoke all on function private.is_steward_of(uuid) from public;
revoke all on function private.my_reach() from public;
grant execute on function private.branch_lineage(uuid) to authenticated;
grant execute on function private.branch_subtree(uuid) to authenticated;
grant execute on function private.is_steward_of(uuid) to authenticated;
grant execute on function private.my_reach() to authenticated;

-- ----------------------------------------------------------------------------
-- RLS and grants. Every write goes through an RPC below, so the client gets
-- SELECT and nothing else.
-- ----------------------------------------------------------------------------

alter table public.branches enable row level security;
alter table public.branch_stewards enable row level security;
alter table public.branch_requests enable row level security;

-- Branch NAMES are readable by anyone signed in: a circle admin has to pick one
-- to ask to join. A branch is a place, not a person, and holds nothing else.
create policy branches_select_signed_in on public.branches
  for select to authenticated using (true);

-- Your own appointments, and the stewards of anything you run.
create policy branch_stewards_select on public.branch_stewards
  for select to authenticated
  using (user_id = (select auth.uid()) or private.is_steward_of(branch_id));

-- The circle's admins see their own request; the branch's stewards see it to
-- decide it.
create policy branch_requests_select on public.branch_requests
  for select to authenticated
  using (private.is_group_admin(group_id) or private.is_steward_of(branch_id));

grant select on public.branches, public.branch_stewards, public.branch_requests
  to authenticated;
grant select, insert, update, delete
  on public.branches, public.branch_stewards, public.branch_requests
  to service_role;

-- ----------------------------------------------------------------------------
-- Branches
-- ----------------------------------------------------------------------------

create or replace function public.create_branch(p_parent uuid, p_name text)
  returns uuid
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_caller_profile();
  v_id  uuid;
begin
  -- A new tree is a new organisation, which only an organiser starts.
  if p_parent is null then
    if not private.is_super_admin() then
      raise exception 'only an organiser can start a new top-level branch';
    end if;
  elsif not private.is_steward_of(p_parent) then
    raise exception 'you do not run that branch';
  end if;

  begin
    insert into public.branches (parent_id, name, created_by)
    values (p_parent, btrim(p_name), v_uid)
    returning id into v_id;
  exception
    when unique_violation then
      raise exception 'there is already a branch with that name there';
    when check_violation then
      raise exception 'a branch name is 1 to 80 characters';
  end;

  insert into public.audit_log (actor_id, action, detail)
  values (v_uid, 'create_branch',
          jsonb_build_object('branch_id', v_id, 'parent_id', p_parent,
                             'name', btrim(p_name)));
  return v_id;
end;
$$;

create or replace function public.rename_branch(p_branch uuid, p_name text)
  returns void
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_caller_profile();
begin
  if not private.is_steward_of(p_branch) then
    raise exception 'you do not run that branch';
  end if;
  begin
    update public.branches set name = btrim(p_name) where id = p_branch;
  exception
    when unique_violation then
      raise exception 'there is already a branch with that name there';
    when check_violation then
      raise exception 'a branch name is 1 to 80 characters';
  end;
  insert into public.audit_log (actor_id, action, detail)
  values (v_uid, 'rename_branch',
          jsonb_build_object('branch_id', p_branch, 'name', btrim(p_name)));
end;
$$;

-- Only an EMPTY branch goes: no sub-branches, no circles, no events. Each is
-- checked so the refusal names what is in the way, rather than surfacing a
-- foreign-key error.
create or replace function public.delete_branch(p_branch uuid)
  returns void
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid    uuid := private.require_caller_profile();
  v_parent uuid;
begin
  select parent_id into v_parent from public.branches where id = p_branch;
  if not found then
    raise exception 'branch not found';
  end if;
  -- You cannot delete the branch you were appointed to; whoever runs the one
  -- above can. An organiser can delete anything empty.
  if not (private.is_super_admin()
          or (v_parent is not null and private.is_steward_of(v_parent))) then
    raise exception 'only someone who runs the branch above can delete this one';
  end if;
  if exists (select 1 from public.branches where parent_id = p_branch) then
    raise exception 'delete or move the branches inside it first';
  end if;
  if exists (select 1 from public.groups where branch_id = p_branch) then
    raise exception 'circles are still in this branch';
  end if;

  delete from public.branches where id = p_branch;

  insert into public.audit_log (actor_id, action, detail)
  values (v_uid, 'delete_branch', jsonb_build_object('branch_id', p_branch));
end;
$$;

-- ----------------------------------------------------------------------------
-- Stewards — appointed by exact email, as organisers are (D56). No directory.
-- ----------------------------------------------------------------------------

create or replace function public.appoint_steward(p_branch uuid, p_email text)
  returns table (user_id uuid, name text)
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid    uuid := private.require_caller_profile();
  v_target uuid;
  v_name   text;
begin
  if not private.is_steward_of(p_branch) then
    raise exception 'you do not run that branch';
  end if;

  select u.id into v_target
    from auth.users u
   where lower(u.email) = lower(btrim(p_email));
  if v_target is null then
    raise exception 'no account with that email address';
  end if;

  insert into public.branch_stewards (branch_id, user_id, created_by)
  values (p_branch, v_target, v_uid)
  on conflict do nothing;
  if not found then
    raise exception 'that person already runs this branch';
  end if;

  insert into public.audit_log (actor_id, action, target_user_id, detail)
  values (v_uid, 'appoint_steward', v_target,
          jsonb_build_object('branch_id', p_branch));

  select p.name into v_name from public.profiles p where p.id = v_target;
  return query select v_target, v_name;
end;
$$;

-- Standing yourself down is allowed. There is no "last steward" rule, unlike
-- organisers: an organiser is always above every branch, so no branch can be
-- left with nobody able to run it.
create or replace function public.remove_steward(p_branch uuid, p_user uuid)
  returns void
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_caller_profile();
begin
  if not (p_user = v_uid or private.is_steward_of(p_branch)) then
    raise exception 'you do not run that branch';
  end if;
  delete from public.branch_stewards
   where branch_id = p_branch and user_id = p_user;
  insert into public.audit_log (actor_id, action, target_user_id, detail)
  values (v_uid, 'remove_steward', p_user,
          jsonb_build_object('branch_id', p_branch));
end;
$$;

-- Email beside the name, because a name does not identify a person (D56).
create or replace function public.list_branch_stewards(p_branch uuid)
  returns table (user_id uuid, name text, email text)
  language sql security definer stable set search_path = '' as $$
  select s.user_id, p.name, u.email::text
    from public.branch_stewards s
    join public.profiles p on p.id = s.user_id
    join auth.users u      on u.id = s.user_id
   where s.branch_id = p_branch
     and private.is_steward_of(p_branch)
   order by p.name nulls last;
$$;

-- ----------------------------------------------------------------------------
-- Circles joining a branch
-- ----------------------------------------------------------------------------

-- The circle's admin asks. A steward of that branch asking for their own
-- circle needs nobody's approval, so it lands at once.
create or replace function public.request_branch(p_group uuid, p_branch uuid)
  returns text
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_caller_profile();
begin
  if not private.is_group_admin(p_group) then
    raise exception 'only the circle''s owner or a co-admin can do this';
  end if;
  if not exists (select 1 from public.branches where id = p_branch) then
    raise exception 'branch not found';
  end if;

  if private.is_steward_of(p_branch) then
    delete from public.branch_requests where group_id = p_group;
    update public.groups set branch_id = p_branch where id = p_group;
    insert into public.audit_log (actor_id, action, group_id, detail)
    values (v_uid, 'join_branch', p_group,
            jsonb_build_object('branch_id', p_branch, 'approved_by', v_uid));
    return 'joined';
  end if;

  insert into public.branch_requests (group_id, branch_id, requested_by)
  values (p_group, p_branch, v_uid)
  on conflict (group_id) do update
    set branch_id = excluded.branch_id,
        requested_by = excluded.requested_by,
        created_at = now();
  insert into public.audit_log (actor_id, action, group_id, detail)
  values (v_uid, 'request_branch', p_group,
          jsonb_build_object('branch_id', p_branch));
  return 'requested';
end;
$$;

create or replace function public.cancel_branch_request(p_group uuid)
  returns void
  language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_caller_profile();
  if not private.is_group_admin(p_group) then
    raise exception 'only the circle''s owner or a co-admin can do this';
  end if;
  delete from public.branch_requests where group_id = p_group;
end;
$$;

create or replace function public.decide_branch_request(
  p_group uuid,
  p_approve boolean
)
  returns void
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid    uuid := private.require_caller_profile();
  v_branch uuid;
begin
  select branch_id into v_branch
    from public.branch_requests where group_id = p_group
     for update;
  if v_branch is null then
    raise exception 'that request is no longer open';
  end if;
  if not private.is_steward_of(v_branch) then
    raise exception 'you do not run that branch';
  end if;

  delete from public.branch_requests where group_id = p_group;
  if p_approve then
    update public.groups set branch_id = v_branch where id = p_group;
  end if;

  insert into public.audit_log (actor_id, action, group_id, detail)
  values (v_uid,
          case when p_approve then 'join_branch' else 'decline_branch' end,
          p_group,
          jsonb_build_object('branch_id', v_branch, 'approved_by', v_uid));
end;
$$;

-- Either side can end it: the circle's admin by leaving, or a steward of the
-- branch it is in by removing it.
create or replace function public.leave_branch(p_group uuid)
  returns void
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid    uuid := private.require_caller_profile();
  v_branch uuid;
begin
  select branch_id into v_branch from public.groups where id = p_group;
  if v_branch is null then
    return;
  end if;
  if not (private.is_group_admin(p_group) or private.is_steward_of(v_branch)) then
    raise exception 'only the circle''s admins or the branch''s stewards can do this';
  end if;
  update public.groups set branch_id = null where id = p_group;
  insert into public.audit_log (actor_id, action, group_id, detail)
  values (v_uid, 'leave_branch', p_group,
          jsonb_build_object('branch_id', v_branch));
end;
$$;

-- What a steward reads about the circles in a branch: a name and a head-count.
-- `pending` rows are the open requests to join it.
create or replace function public.branch_circles(p_branch uuid)
  returns table (group_id uuid, name text, members integer, pending boolean,
                 requested_at timestamptz)
  language sql security definer stable set search_path = '' as $$
  select g.id, g.name,
         (select count(*)::integer from public.memberships m where m.group_id = g.id),
         false, null::timestamptz
    from public.groups g
   where g.branch_id = p_branch
     and private.is_steward_of(p_branch)
  union all
  select g.id, g.name,
         (select count(*)::integer from public.memberships m where m.group_id = g.id),
         true, r.created_at
    from public.branch_requests r
    join public.groups g on g.id = r.group_id
   where r.branch_id = p_branch
     and private.is_steward_of(p_branch)
   order by 4 desc, 2;
$$;

-- Every branch the caller runs, with its whole subtree, flattened with a depth
-- and the number of open requests — the admin screen's one read.
create or replace function public.my_steward_tree()
  returns table (id uuid, parent_id uuid, name text, depth integer,
                 circles integer, pending integer, direct boolean)
  language sql security definer stable set search_path = '' as $$
  with recursive tops as (
    -- An organiser runs every root; a steward, the branches they were given
    -- that do not sit under another branch they were given.
    select b.id
      from public.branches b
     where private.is_super_admin() and b.parent_id is null
    union
    select s.branch_id
      from public.branch_stewards s
     where s.user_id = (select auth.uid())
       and not private.is_super_admin()
       and not exists (
             select 1
               from public.branch_stewards s2
              where s2.user_id = s.user_id
                and s2.branch_id <> s.branch_id
                and s2.branch_id in (select private.branch_lineage(s.branch_id))
           )
  ),
  tree (id, parent_id, name, depth, path) as (
    select b.id, b.parent_id, b.name, 0, array[lower(b.name)]
      from public.branches b join tops t on t.id = b.id
    union all
    select c.id, c.parent_id, c.name, tree.depth + 1, tree.path || lower(c.name)
      from public.branches c join tree on c.parent_id = tree.id
     where tree.depth < 32
  )
  select t.id, t.parent_id, t.name, t.depth,
         (select count(*)::integer from public.groups g where g.branch_id = t.id),
         (select count(*)::integer from public.branch_requests r where r.branch_id = t.id),
         exists (select 1 from public.branch_stewards s
                  where s.branch_id = t.id and s.user_id = (select auth.uid()))
    from tree t
   order by t.path;
$$;

-- The picker a circle admin chooses from: every branch, with its full path as
-- one readable label ("Victoria › Melbourne › South East").
create or replace function public.branch_directory()
  returns table (id uuid, label text, depth integer)
  language sql security definer stable set search_path = '' as $$
  with recursive tree (id, label, depth, path) as (
    select b.id, b.name, 0, array[lower(b.name)]
      from public.branches b where b.parent_id is null
    union all
    select c.id, tree.label || ' › ' || c.name, tree.depth + 1,
           tree.path || lower(c.name)
      from public.branches c join tree on c.parent_id = tree.id
     where tree.depth < 32
  )
  select id, label, depth from tree
   where (select auth.uid()) is not null
   order by path;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.create_branch(uuid, text)',
    'public.rename_branch(uuid, text)',
    'public.delete_branch(uuid)',
    'public.appoint_steward(uuid, text)',
    'public.remove_steward(uuid, uuid)',
    'public.list_branch_stewards(uuid)',
    'public.request_branch(uuid, uuid)',
    'public.cancel_branch_request(uuid)',
    'public.decide_branch_request(uuid, boolean)',
    'public.leave_branch(uuid)',
    'public.branch_circles(uuid)',
    'public.my_steward_tree()',
    'public.branch_directory()'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;
