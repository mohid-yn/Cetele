-- ============================================================================
-- Migration 0034 — one act, logged once, counted in every circle (D64)
-- ----------------------------------------------------------------------------
-- Owner: "if he has one car he can update both groups by just toggling car off
-- on one group."
--
-- A member in three circles that all carry salawat does the dhikr ONCE and logs
-- it three times. Nothing in the schema has ever been able to say "these two
-- tasks are the same act", so the only honest options were to repeat the same
-- sitting into every circle, or to let two circles disagree about a day that
-- genuinely happened. A link is the member's claim that circle A's task and
-- circle B's task are one thing.
--
-- FAN OUT ON WRITE. NEVER ALIAS ON READ.
--
-- The rejected design was a shared count both tasks read. It would have had to
-- move `private.obligations`, `is_day_complete`, `refresh_streak`,
-- `daily_completion` and the collective goal — every predicate the app is
-- judged by, and three of them rewritten by 0024 and 0032 already. Worse, it
-- would let one circle's target changes decide how ANOTHER circle judges its
-- members, which is not a thing a circle admin should be able to do.
--
-- Writing two `logs` rows instead changes nothing downstream. `logs` is already
-- keyed `(user_id, task_id, date)`, so two rows is the shape the table was
-- built for: each circle goes on judging its own task by its own target (0024)
-- and its own share (0032), and not one existing reader is touched by this
-- migration. The only functions replaced below are the two write paths.
--
-- THE FAN-OUT MIRRORS THE OPERATION, NOT THE RESULTING VALUE
--
-- `increment_count` carries the same DELTA; `set_count` the same ABSOLUTE. Two
-- tasks that drifted apart before they were linked therefore stay drifted,
-- rather than being silently reconciled by whichever one happened to be tapped
-- next — a member who really did log 40 in one circle and 10 in the other did
-- not thereby ask for the smaller to be overwritten.
--
-- THE RAW COUNT TRAVELS; THE COMPLETION DOES NOT
--
-- Circle A asks 1 and circle B asks 500. Logging 1 closes the day in A and
-- leaves B at 1-of-500, which is TRUE — the member did it once. Mirroring
-- "doneness" instead would post 500 counts nobody performed into B's collective
-- total, and a shared bar that counts work nobody did is the one failure that
-- makes the whole collective figure worthless. Wildly mismatched targets are
-- allowed without a warning (owner's call): for dhikr the raw count is the
-- honest unit and the member can see both numbers.
--
-- THE LINK IS THE MEMBER'S
--
-- Own-row RLS, invisible to admins — `member_task_goals`' posture (0018), not
-- `member_task_shares`' (0032). A share is the circle's ask and belongs in the
-- open; a link is a claim about the member's own life, and an admin does not
-- get to decide that your Car is their Car.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- member_task_links — a cluster of tasks one member performs as a single act
-- ----------------------------------------------------------------------------
-- CLUSTERS, NOT PAIRS. Three circles sharing one act would otherwise need three
-- pair rows and a transitive closure to read them; membership of a shared
-- cluster id makes "the others" a single self-join, and makes a cycle
-- impossible to express rather than something to defend against.

create table public.member_task_links (
  user_id    uuid not null references public.profiles on delete cascade,
  task_id    uuid not null references public.tasks    on delete cascade,
  -- The cluster this task is in FOR THIS MEMBER. Not a foreign key to anything:
  -- a cluster has no properties of its own, it is only the name of a set, and a
  -- parent table would exist solely to be deleted when the set empties.
  cluster_id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- One cluster per task per member — the constraint that makes "the same act"
  -- a partition rather than an opinion. A task in two clusters would fan a
  -- single tap into two unrelated sets of circles.
  primary key (user_id, task_id)
);

-- The read is always "this member's siblings of this task", which is the
-- cluster lookup; the FK side needs its own index (the B7 lesson, 0005).
create index member_task_links_cluster_idx
  on public.member_task_links (user_id, cluster_id);
create index member_task_links_task_idx
  on public.member_task_links (task_id);

comment on table public.member_task_links is
  'Tasks one MEMBER performs as a single act (0034, D64). Shared cluster_id = '
  'the same act. Logging any member of a cluster fans the same operation out to '
  'the others, so one sitting is recorded in every circle that asked for it. '
  'The member''s own — never visible to a circle admin.';

comment on column public.member_task_links.cluster_id is
  'The set this task belongs to for this member. Linking two tasks already in '
  'clusters MERGES them; a cluster that falls to one row is dissolved.';

alter table public.member_task_links enable row level security;

-- Yours alone. A link is a statement about the member's own life, and a circle
-- admin seeing that your Salawat is also somebody else's circle's Salawat would
-- expose the membership of a circle they are not in.
create policy member_task_links_select_self on public.member_task_links
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Read-only to clients. Every write goes through the RPCs below, which hold the
-- merge, the dissolve-at-one rule and the same-circle refusal — none of which a
-- direct insert could enforce, and all of which decide where a member's taps
-- land.
grant select on public.member_task_links to authenticated;

-- ----------------------------------------------------------------------------
-- private.linked_tasks — this member's LIVE siblings of a task
-- ----------------------------------------------------------------------------
-- The membership check is the dormancy rule, and it is 0019's, third
-- application. That migration hit this exact fork for reminders and wrote the
-- argument down: deleting member-owned state when a membership goes is worse on
-- the case that actually happens (an accidental removal, or a leave-and-rejoin,
-- with the setting gone), and deleting "defends only the paths we thought of",
-- whereas a guard at the point of USE covers every way the state can outlive a
-- membership — including the ones not written yet. 0026 applied it a second
-- time to roadmap progress.
--
-- So the row survives a member leaving circle B, this function simply stops
-- returning it, and the links screen shows it greyed with a Remove the member
-- can press themselves. The check costs nothing that was not already owed: a
-- fan-out into a circle you are not in has to be refused regardless.

create or replace function private.linked_tasks(p_user uuid, p_task uuid)
  returns table (task_id uuid)
  language sql security definer stable set search_path = '' as $$
  select sib.task_id
  from public.member_task_links self
  join public.member_task_links sib
    on sib.user_id = self.user_id
   and sib.cluster_id = self.cluster_id
   and sib.task_id <> self.task_id
  where self.user_id = p_user
    and self.task_id = p_task
    -- Still in that circle? (0019's rule — see the header.)
    and exists (
          select 1
          from public.tasks t
          join public.memberships m
            on m.group_id = t.group_id and m.user_id = p_user
          where t.id = sib.task_id
        );
$$;

revoke all on function private.linked_tasks(uuid, uuid)
  from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- increment_count — the tap, now landing in every circle that asked for it
-- ----------------------------------------------------------------------------
-- Body repeated from 0032 rather than patched, because `create or replace
-- function` needs the whole of it. Two changes only:
--
--   * the fan-out loop, after the member's own write;
--   * `refresh_streak` moves BELOW it, so the streak is recomputed once, after
--     every row this tap wrote. It walks the member's tasks across all their
--     circles already (0016), so one call still covers both sides.
--
-- The far cap is CLAMPED, not raised. A cap is a sanity bound on a single
-- write (D36a), not a product rule, and refusing the member's real act because
-- a circle they also belong to asks for less would make the near tap fail for a
-- reason that is invisible on the screen they are looking at. Caps are
-- generous — `greatest(target * 10, target + 1000)` is at least 1,001 even for
-- a target of 1 — so this is a backstop, not a routine path.

create or replace function public.increment_count(p_task uuid, p_date date, p_delta integer)
  returns integer
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid        uuid := private.require_caller_profile();
  v_target     integer;
  v_today      date;
  v_count      integer;
  v_cap        integer;
  v_link       uuid;
  v_far_target integer;
  v_far_cap    integer;
  v_far_count  integer;
begin
  if p_delta is null or p_delta < 1 or p_delta > 500 then
    raise exception 'delta out of range (1..500)';
  end if;
  if not private.is_task_group_member(p_task) then
    raise exception 'task not found';    -- no oracle: absent and forbidden look alike
  end if;

  v_today := private.user_today(v_uid);
  -- The cap is measured against what this member is asked for TODAY, not on
  -- p_date: it bounds the write, and a back-fill into a day with a smaller
  -- historical share must not be refused (0024's correction-window argument).
  v_target := private.effective_target(p_task, v_uid, v_today);
  if p_date is null or p_date > v_today or p_date < v_today - 13 then
    raise exception 'date outside the 14-day logging window';
  end if;

  insert into public.logs (user_id, task_id, date, count)
  values (v_uid, p_task, p_date, p_delta)
  on conflict (user_id, task_id, date)
  do update set count = public.logs.count + excluded.count,
                updated_at = now()
  returning count into v_count;

  v_cap := greatest(v_target * 10, v_target + 1000);
  if v_count > v_cap then
    raise exception 'count exceeds the sanity cap for this task';
  end if;

  -- D64 — the same act, into every circle that asked for it. The DELTA travels,
  -- not the resulting total: linking does not reconcile two counts that had
  -- already drifted apart.
  for v_link in select lt.task_id from private.linked_tasks(v_uid, p_task) lt loop
    insert into public.logs (user_id, task_id, date, count)
    values (v_uid, v_link, p_date, p_delta)
    on conflict (user_id, task_id, date)
    do update set count = public.logs.count + excluded.count,
                  updated_at = now()
    returning count into v_far_count;

    v_far_target := private.effective_target(v_link, v_uid, v_today);
    v_far_cap    := greatest(v_far_target * 10, v_far_target + 1000);
    if v_far_count > v_far_cap then
      update public.logs
         set count = v_far_cap, updated_at = now()
       where user_id = v_uid and task_id = v_link and date = p_date;
    end if;
  end loop;

  perform private.refresh_streak(v_uid, p_date);   -- D48: back-fills repair too

  return v_count;
end;
$$;

-- ----------------------------------------------------------------------------
-- set_count — the correction and the proxy log, fanned out the same way
-- ----------------------------------------------------------------------------
-- Body repeated from 0032. The fan-out here carries the ABSOLUTE count, because
-- that is the operation being mirrored: "this day was 40" means it was 40 in
-- every circle that asked for the same act.
--
-- AN ADMIN'S PROXY LOG DOES FAN OUT, and that is a deliberate widening of D29
-- (owner's call). The far write does NOT re-check `is_task_group_admin`: it
-- cannot, because the admin is very often not in the far circle at all. The
-- authority is the MEMBER'S LINK, not the admin's role — the member said these
-- two are one act, and an admin recording that act is recording it once. The
-- consequence is real and worth naming: an admin of circle A can move a
-- member's numbers in circle B.
--
-- `logs.logged_by` still records who wrote it, on both rows. Circle B cannot
-- RENDER that name — `profiles` is readable only to members of a shared circle
-- (0001), so the lookup misses and the attribution simply does not draw. The
-- row is not lying; the far circle just cannot resolve the person. Better than
-- the alternative of writing NULL, which would claim the member did it
-- themselves.

create or replace function public.set_count(p_user uuid, p_task uuid, p_date date, p_count integer)
  returns integer
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid        uuid := private.require_caller_profile();
  v_self       boolean;
  v_target     integer;
  v_today      date;
  v_cap        integer;
  v_link       uuid;
  v_far_target integer;
  v_far_cap    integer;
  v_far_count  integer;
begin
  v_self := (p_user = v_uid);
  if not v_self and not private.is_task_group_admin(p_task) then
    raise exception 'only the member or a group admin can set counts';
  end if;
  if v_self and not private.is_task_group_member(p_task) then
    raise exception 'task not found';
  end if;
  -- proxy target must actually be in the task's group
  if not v_self and not exists (
    select 1 from public.tasks tk
    join public.memberships m on m.group_id = tk.group_id
    where tk.id = p_task and m.user_id = p_user
  ) then
    raise exception 'that person is not in this group';
  end if;

  -- 14-day window by the TARGET member's own clock (their day boundaries).
  v_today := private.user_today(p_user);

  -- The cap belongs to the person the count is FOR, not to the admin writing
  -- it: an admin logging for a member with a 2000 share must be able to write
  -- 2000, and must not be able to write 2000 against a member whose share is
  -- 100 just because somebody else in the circle carries more.
  v_target := private.effective_target(p_task, p_user, v_today);
  v_cap := greatest(v_target * 10, v_target + 1000);
  if p_count is null or p_count < 0 or p_count > v_cap then
    raise exception 'count out of range';
  end if;

  if p_date is null or p_date > v_today or p_date < v_today - 13 then
    raise exception 'date outside the 14-day correction window';
  end if;

  insert into public.logs (user_id, task_id, date, count, logged_by)
  values (p_user, p_task, p_date, p_count, case when v_self then null else v_uid end)
  on conflict (user_id, task_id, date)
  do update set count      = excluded.count,
                logged_by  = excluded.logged_by, -- self-edit clears attribution (D29 mock)
                updated_at = now();

  -- D64 — the ABSOLUTE count into every circle that asked for the same act.
  -- Clamped per far task, for increment_count's reason.
  for v_link in select lt.task_id from private.linked_tasks(p_user, p_task) lt loop
    v_far_target := private.effective_target(v_link, p_user, v_today);
    v_far_cap    := greatest(v_far_target * 10, v_far_target + 1000);
    v_far_count  := least(p_count, v_far_cap);

    insert into public.logs (user_id, task_id, date, count, logged_by)
    values (p_user, v_link, p_date, v_far_count,
            case when v_self then null else v_uid end)
    on conflict (user_id, task_id, date)
    do update set count      = excluded.count,
                  logged_by  = excluded.logged_by,
                  updated_at = now();
  end loop;

  perform private.refresh_streak(p_user, p_date);   -- D48: back-fills repair too

  return p_count;
end;
$$;

-- ----------------------------------------------------------------------------
-- public.link_tasks — the member says two tasks are one act
-- ----------------------------------------------------------------------------
-- Returns the cluster the two now share.
--
-- SAME-CIRCLE LINKS ARE REFUSED. Two tasks in one circle sharing a fan-out
-- would count a single act twice inside that circle's own collective total —
-- the one number the whole group reads together. It is also never what the
-- feature is for: the point is that circles ask for the same thing, not that a
-- circle asks for it twice.
--
-- MERGING is what makes clusters worth having. Link A–B, then B–C, and all
-- three are one act — with pairs, C would have had to be linked to A by hand or
-- discovered by walking the graph at every write.

create or replace function public.link_tasks(p_task_a uuid, p_task_b uuid)
  returns uuid
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid     uuid := private.require_caller_profile();
  v_group_a uuid;
  v_group_b uuid;
  v_clus_a  uuid;
  v_clus_b  uuid;
  v_cluster uuid;
  v_size    integer;
begin
  if p_task_a is null or p_task_b is null or p_task_a = p_task_b then
    raise exception 'two different tasks are needed';
  end if;

  -- Membership of BOTH, checked as the member themselves — no admin path here.
  -- Absent and forbidden look alike (the increment_count convention).
  if not private.is_task_group_member(p_task_a)
     or not private.is_task_group_member(p_task_b) then
    raise exception 'task not found';
  end if;

  select group_id into v_group_a from public.tasks where id = p_task_a;
  select group_id into v_group_b from public.tasks where id = p_task_b;

  if v_group_a = v_group_b then
    -- Said out loud rather than silently dropped: this repo's standing rule for
    -- a refused write (D51, D61) — a rule enforced silently is one nobody learns.
    raise exception 'those two tasks are in the same circle';
  end if;

  select cluster_id into v_clus_a
    from public.member_task_links where user_id = v_uid and task_id = p_task_a;
  select cluster_id into v_clus_b
    from public.member_task_links where user_id = v_uid and task_id = p_task_b;

  if v_clus_a is not null and v_clus_a = v_clus_b then
    return v_clus_a;                       -- already one act; nothing to do
  end if;

  v_cluster := coalesce(v_clus_a, v_clus_b, gen_random_uuid());

  -- A ceiling on the fan-out, not a judgement about how many circles is
  -- sensible: every linked task is another row written by a single tap, inside
  -- the transaction the member is waiting on.
  select count(*) into v_size
  from public.member_task_links
  where user_id = v_uid and cluster_id in (v_clus_a, v_clus_b);
  if v_size >= 10 then
    raise exception 'that is as many tasks as one act can cover (10)';
  end if;

  -- Merge whichever side already had a cluster into the surviving one, then add
  -- the two tasks themselves. Doing the merge FIRST means the upserts below
  -- cannot collide with a stale row still carrying the old cluster.
  if v_clus_a is not null and v_clus_b is not null then
    update public.member_task_links
       set cluster_id = v_cluster
     where user_id = v_uid and cluster_id in (v_clus_a, v_clus_b);
  end if;

  insert into public.member_task_links (user_id, task_id, cluster_id)
  values (v_uid, p_task_a, v_cluster), (v_uid, p_task_b, v_cluster)
  on conflict (user_id, task_id) do update set cluster_id = excluded.cluster_id;

  return v_cluster;
end;
$$;

revoke all on function public.link_tasks(uuid, uuid) from public, anon;
grant execute on function public.link_tasks(uuid, uuid) to authenticated;

comment on function public.link_tasks(uuid, uuid) is
  'Declare two of the caller''s tasks to be one act (0034). Different circles '
  'only. Merges existing clusters. The only write path into member_task_links.';

-- ----------------------------------------------------------------------------
-- public.unlink_task — take one task back out of its cluster
-- ----------------------------------------------------------------------------
-- A CLUSTER OF ONE IS DISSOLVED, not left standing. A single row fans out to
-- nothing, so keeping it would leave the member a link they can see, cannot
-- use, and have to remove a second time — and it would make "am I linked?" a
-- question the UI has to answer by counting rather than by looking.

create or replace function public.unlink_task(p_task uuid)
  returns void
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid     uuid := private.require_caller_profile();
  v_cluster uuid;
  v_left    integer;
begin
  -- No membership check, deliberately: this is how a member removes a link into
  -- a circle they have LEFT (0019's dormancy — the row outlives the membership,
  -- so the control that clears it has to as well).
  delete from public.member_task_links
   where user_id = v_uid and task_id = p_task
  returning cluster_id into v_cluster;

  if v_cluster is null then
    return;                                -- nothing was linked; not an error
  end if;

  select count(*) into v_left
  from public.member_task_links
  where user_id = v_uid and cluster_id = v_cluster;

  if v_left = 1 then
    delete from public.member_task_links
     where user_id = v_uid and cluster_id = v_cluster;
  end if;
end;
$$;

revoke all on function public.unlink_task(uuid) from public, anon;
grant execute on function public.unlink_task(uuid) to authenticated;

comment on function public.unlink_task(uuid) is
  'Remove one of the caller''s tasks from its cluster (0034), dissolving the '
  'cluster if only one task would be left. Works for a task in a circle the '
  'member has left.';
