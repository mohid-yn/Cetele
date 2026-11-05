-- ============================================================================
-- Migration 0040: an organiser can take part in a roadmap directly (D76)
-- ----------------------------------------------------------------------------
-- Recording progress needs `follows_roadmap`, which means belonging to a circle
-- on that roadmap. An organiser is usually in none (D27), so the person who runs
-- a programme could not do it without joining or inventing a circle.
--
-- A row here is the same entitlement without a circle, and only an organiser can
-- have one. Membership stays what it was: this grants no view of any circle and
-- nothing about anyone's dhikr.
--
-- ENDS WITH THE ROLE. Every reader also asks `is_super_admin`, so someone stood
-- down stops being on the roadmap at once, without this having to be cleaned up
-- when the role is revoked. Their recorded progress stays (D55).
--
-- THEY COUNT IN THE COHORT REPORT, because the report lists whoever is enrolled.
-- Only an organiser sees that row: a circle's admins read their own circle.
-- ============================================================================

create table public.roadmap_participants (
  roadmap_id uuid not null references public.roadmaps (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (roadmap_id, user_id)
);

create index roadmap_participants_user_idx
  on public.roadmap_participants (user_id);

comment on table public.roadmap_participants is
  'Organisers taking part in a roadmap without a circle (0040, D76). Written only '
  'through take_part_in_roadmap, and counted only while the role is held.';

alter table public.roadmap_participants enable row level security;

create policy roadmap_participants_select_organiser
  on public.roadmap_participants
  for select to authenticated
  using (private.is_super_admin());

grant select on public.roadmap_participants to authenticated;
grant select, insert, update, delete on public.roadmap_participants to service_role;

create or replace function private.follows_roadmap(r uuid) returns boolean
  language sql security definer stable set search_path = '' as $$
  select exists (
    select 1
    from public.memberships m
    join public.group_roadmaps gr on gr.group_id = m.group_id
    where m.user_id = (select auth.uid())
      and gr.roadmap_id = r
  )
  or (
    private.is_super_admin()
    and exists (
      select 1
      from public.roadmap_participants p
      where p.user_id = (select auth.uid())
        and p.roadmap_id = r
    )
  );
$$;

-- The circle half is unchanged from 0028. The second half can only ever add the
-- caller themselves or, for an organiser reading the cohort, other organisers.
create or replace function public.roadmap_roster()
  returns table (roadmap_id uuid, user_id uuid, name text)
  language sql security definer stable set search_path = '' as $$
  select distinct gr.roadmap_id, pr.id, pr.name
  from public.memberships them
  join public.group_roadmaps gr on gr.group_id = them.group_id
  join public.profiles pr       on pr.id = them.user_id
  where them.user_id = (select auth.uid())
     or private.is_super_admin()
     or exists (
          select 1
          from public.memberships me
          where me.group_id = gr.group_id
            and me.user_id = (select auth.uid())
            and me.role in ('owner', 'admin')
        )
  union
  select p.roadmap_id, pr.id, pr.name
  from public.roadmap_participants p
  join public.profiles pr on pr.id = p.user_id
  where pr.is_super_admin
    and private.is_super_admin();
$$;

create or replace function public.take_part_in_roadmap(
  p_roadmap uuid,
  p_take_part boolean
)
  returns void
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_caller_profile();
begin
  if not private.is_super_admin() then
    raise exception 'organisers only';
  end if;

  if p_take_part then
    if not exists (
      select 1 from public.roadmaps r
       where r.id = p_roadmap and r.published
    ) then
      raise exception 'that roadmap is not published';
    end if;

    insert into public.roadmap_participants (roadmap_id, user_id)
    values (p_roadmap, v_uid)
    on conflict do nothing;

    insert into public.audit_log (actor_id, action, target_user_id, detail)
    values (v_uid, 'take_part_in_roadmap', v_uid,
            jsonb_build_object('roadmap_id', p_roadmap));
  else
    -- Progress is untouched: leaving a roadmap never revokes what was recorded.
    delete from public.roadmap_participants
     where roadmap_id = p_roadmap and user_id = v_uid;

    insert into public.audit_log (actor_id, action, target_user_id, detail)
    values (v_uid, 'stop_taking_part_in_roadmap', v_uid,
            jsonb_build_object('roadmap_id', p_roadmap));
  end if;
end;
$$;

revoke all on function public.take_part_in_roadmap(uuid, boolean) from public, anon;
grant execute on function public.take_part_in_roadmap(uuid, boolean) to authenticated;

comment on function public.take_part_in_roadmap(uuid, boolean) is
  'An organiser joins or leaves a roadmap as themselves, with no circle (D76). '
  'Only ever writes the caller''s own row.';
