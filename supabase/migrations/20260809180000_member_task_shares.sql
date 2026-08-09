-- ============================================================================
-- Migration 0032 — the cetele is SPLIT, so a member can carry a bigger share
-- ----------------------------------------------------------------------------
-- Owner: "need admins ability to increase the goals for specific users."
--
-- Until now `tasks.target_count` was the only obligation there was: one number
-- per task, set by the admin (D5/D6), owed identically by everyone who carries
-- it. That is not what a cetele is. A cetele is a shared goal SPLIT between
-- people — 1000 salawat across ten of them — and the split is not always equal,
-- because the people are not. Somebody who can carry 500 takes 500.
--
-- 0018 already let a member raise their OWN bar, and that is a different object
-- which this migration deliberately does not disturb:
--
--   `member_task_goals`  — my private STRETCH. Aspiration. Moves my ring and my
--                          reminder and nothing else; invisible to the circle.
--   `member_task_shares` — the circle's ASK of me. Obligation. What "done"
--                          means for me, what my streak is judged at, and what
--                          the circle counts on me for. Visible to everyone.
--
-- The two stack rather than compete: my ring fills toward
-- `greatest(my share, my stretch)`, and my day is complete at my share.
--
-- WHY THIS IS AN INTERVAL TABLE, FOR THE FIFTH TIME
--
-- `private.obligations` answers "what did this member owe on THIS DAY", for any
-- day in the 14-day window. A plain `(user, task, target)` row has no notion of
-- when, so raising Ahmet from 100 to 500 today would make every past day owe
-- 500 — and a day he genuinely kept at 100 becomes a miss, collapsing a chain he
-- earned. That is the retroactivity family this repo has now paid for four
-- times: 0020 (joining a circle, measured 10 -> 2), 0021 (adding a task, 10 -> 1),
-- 0023 (assignment, fixed by making it an interval instead of a set) and 0024
-- (the target and cycle themselves). The mechanism was identical every time.
--
-- So this table is shaped exactly like `task_config_versions` (0024) with the
-- member dimension added, and it is read through the same kind of as-of
-- predicate on the same member calendar. A share change is never destructive:
-- setting one closes the open interval and opens the next at the same instant,
-- and clearing one simply closes it. Rows are never deleted.
--
-- greatest(), NOT coalesce() — the 0018 argument, one table along
--
-- The effective obligation is
--
--     greatest(coalesce(my share, 0), the circle's target that day)
--
-- and not `coalesce(my share, the circle's target)`. The difference only shows
-- up later, and it is the whole reason 0018 is written the way it is: when an
-- admin raises the CIRCLE from 100 to 800, a member sitting on a 500 share must
-- move to 800 with everybody else. Under coalesce they would keep 500 and
-- quietly owe less than the circle asked — a stale row silently lowering
-- somebody's bar months after anyone remembers setting it. Under greatest the
-- circle simply wins, with no clamping trigger, no backfill and no dead row.
--
-- It is also why the RPC refuses a share below the circle's target OUT LOUD
-- rather than storing it: greatest() would ignore it anyway, and dead data that
-- looks meaningful is how a "his share is 50" bug gets reported against a
-- circle target of 100. (D51's lesson, verbatim — a rule the app enforces
-- silently is a rule nobody learns.)
--
-- LOWERING A MEMBER BELOW THE CIRCLE IS NOT BUILT
--
-- Deliberately out of scope, not an oversight. The ask was to increase, and a
-- share beneath the circle's target is a different product decision with a
-- different blast radius: it lowers the collective goal, so it changes what the
-- OTHER members are collectively judged against, and it needs an answer to
-- "does the circle still owe 1000 in total?" that nobody has given yet. The
-- table shape below supports it the day that answer exists — only the RPC's
-- floor check would move.
--
-- WHAT A RAISE DOES TO TODAY
--
-- It bites today, and today can therefore re-open: a member who closed their
-- ring at 100 this morning is at 100/500 this afternoon. That is not an
-- oversight either — it is exactly what raising the CIRCLE's target already
-- does (0024's trigger opens its interval at now(), and the half-open predicate
-- puts today under the new row). Inventing a kinder "raises start tomorrow"
-- rule here would make a per-member raise behave differently from a circle-wide
-- one for no reason a member could ever discover, which is the drift 0024's own
-- header argues against — fix the family, not the instance. Every COMPLETED day
-- is untouched, which was the actual bug.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- member_task_shares — what the circle asked of one member, and when
-- ----------------------------------------------------------------------------

create table public.member_task_shares (
  id             uuid primary key default gen_random_uuid(),
  task_id        uuid not null references public.tasks    on delete cascade,
  user_id        uuid not null references public.profiles on delete cascade,
  target_count   integer not null check (target_count > 0),
  effective_from timestamptz not null default now(),
  effective_to   timestamptz,
  -- Who set it. Attribution, the way `logs.logged_by` is: a member finding a
  -- bigger number against their name is entitled to know which admin put it
  -- there. `set null` on delete — the share outlives the admin's account.
  set_by         uuid references public.profiles on delete set null,
  check (effective_to is null or effective_to >= effective_from)
);

-- The lookup is always (task, member, day) and lands on one member's version
-- list for one task. Both FK sides also need an index of their own (the B7
-- lesson, 0005) — the composite covers task_id, so user_id gets its own.
create index member_task_shares_task_user_idx
  on public.member_task_shares (task_id, user_id, effective_from);
create index member_task_shares_user_idx
  on public.member_task_shares (user_id);

-- Exactly one OPEN share per (task, member). This is what makes "their current
-- share is the current row" unfalsifiable rather than a convention the RPC
-- happens to keep.
create unique index member_task_shares_one_open
  on public.member_task_shares (task_id, user_id)
  where effective_to is null;

comment on table public.member_task_shares is
  'What the circle asked of ONE member for one task, over time (0032). One row '
  'per interval: an admin change closes the open row and opens a new one. Never '
  'deleted — private.obligations judges a past day by the share in force on that '
  'day, so raising a share cannot un-keep a day already kept. Distinct from '
  'member_task_goals, which is the member''s own private stretch and is judged '
  'by nothing.';

comment on column public.member_task_shares.target_count is
  'This member''s share. The effective obligation is greatest(this, the circle''s '
  'target that day) — so a later circle-wide raise still wins (see the header).';

alter table public.member_task_shares enable row level security;

-- Read: any member of the circle the task belongs to — the same posture as
-- task_assignments (0023) and task_config_versions (0024), and deliberately NOT
-- the own-row posture of member_task_goals (0018).
--
-- The difference is the point. A stretch is private because it is an aspiration
-- nobody else is entitled to. A share is the opposite: it is the circle's ask,
-- it is how the collective goal is computed (the sum of shares, not target x
-- members), and the members tab already shows who carries which task. A split
-- the circle cannot see is not a split — it is a secret, and it would make the
-- collective bar unexplainable to everyone but the admin who set it.
create policy member_task_shares_select_member on public.member_task_shares
  for select to authenticated
  using (private.is_task_group_member(task_id));

-- No insert/update/delete policy and no write grant, in either direction. This
-- is membership-shaped authority (D42/D35/D43), and more sharply: a client that
-- could write here could rewrite the days its own streak is computed from.
grant select on public.member_task_shares to authenticated;

-- ----------------------------------------------------------------------------
-- private.member_share_on — "what was asked of THIS member that day"
-- ----------------------------------------------------------------------------
-- PARTIAL by design, and that is the difference from `private.task_config_on`.
-- That one is total — it must always return a row, because `obligations` LEFT
-- JOINs it laterally and a missing row would drop the task out of the join and
-- silently delete the D48 escape. This one returns NULL to mean "no share was
-- ever set for this member on this day, so the circle's target stands", which
-- is the overwhelmingly common answer and composes correctly because every
-- caller folds it through greatest()/coalesce() as a SCALAR, never as a join.
--
-- Both bounds reduce on the MEMBER's calendar via private.user_date (0024's
-- lesson): `p_day` is the member's own local date (D34), so comparing it
-- against a UTC-reduced timestamp puts the boundary a whole day out for a large
-- slice of every day. Measured there at one edit in eight for a +3 circle.
--
-- Half-open on the upper bound, matching task_config_on exactly: a share set
-- today governs today, and the day it is cleared is already back to the
-- circle's number.

create or replace function private.member_share_on(
  p_task uuid,
  p_user uuid,
  p_day  date
) returns integer
  language sql security definer stable set search_path = '' as $$
  select s.target_count
  from public.member_task_shares s
  where s.task_id = p_task
    and s.user_id = p_user
    and private.user_date(p_user, s.effective_from) <= p_day
    and (s.effective_to is null
         or p_day < private.user_date(p_user, s.effective_to))
  -- The unique index makes at most one row OPEN, but a day can only ever be
  -- covered by one interval anyway; the ordering is a tie-break for the
  -- same-day set-then-change case, on the raw timestamp rather than the reduced
  -- date (task_config_on's note — equal dates would otherwise pick arbitrarily).
  order by s.effective_from desc
  limit 1;
$$;

revoke all on function private.member_share_on(uuid, uuid, date)
  from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- private.effective_target — the ONE definition of what a member owes that day
-- ----------------------------------------------------------------------------
-- Split out rather than inlined, for 0024's reason: `obligations` reads the
-- target in FOUR places (the returned value plus three D48 escapes), and the
-- reminder predicates read it twice more. Six copies of a greatest() is how the
-- two copies of the reminder predicate drifted apart in 0019.

create or replace function private.effective_target(
  p_task uuid,
  p_user uuid,
  p_day  date
) returns integer
  language sql security definer stable set search_path = '' as $$
  select greatest(
           coalesce(private.member_share_on(p_task, p_user, p_day), 0),
           coalesce(
             (select c.target from private.task_config_on(p_task, p_user, p_day) c),
             (select t.target_count from public.tasks t where t.id = p_task)
           )
         );
$$;

revoke all on function private.effective_target(uuid, uuid, date)
  from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- private.obligations — the target is now the MEMBER's, not the task's
-- ----------------------------------------------------------------------------
-- Repeated verbatim from 0024 rather than patched, because `create or replace
-- function` needs the whole body and this is the one predicate the entire app
-- is judged by.
--
-- The change is mechanical and total: every `coalesce(c.target, t.target_count)`
-- becomes `private.effective_target(...)`. All four had to move together, and
-- the three inside the escapes are the easy ones to miss — leaving an escape on
-- the circle's target would mean a member with a raised share gets their D48
-- repair credited at the wrong number.
--
-- Note the escapes are evaluated for the SAME member (`p_user`) on the same
-- day, so the share they resolve is that member's own. The membership escape's
-- inner query walks other TASKS, not other people.
--
-- `c` is still joined for the FREQUENCY, which stays a circle-wide fact: a
-- bigger share is a bigger number, not a different rhythm. A member wanting to
-- come round more often already has `member_task_goals.frequency_days` (0021),
-- which is their own axis and unaffected here.

create or replace function private.obligations(p_user uuid, p_day date)
  returns table (task_id uuid, group_id uuid, target integer)
  language sql security definer stable set search_path = '' as $$
  select t.id,
         t.group_id,
         private.effective_target(t.id, p_user, p_day)
  from public.tasks t
  join public.memberships m on m.group_id = t.group_id and m.user_id = p_user
  left join lateral private.task_config_on(t.id, p_user, p_day) c on true
  where (
          private.user_date(p_user, m.created_at) <= p_day
          or exists (
               select 1 from public.logs l2
               join public.tasks t2 on t2.id = l2.task_id
               where l2.user_id = p_user
                 and l2.date    = p_day
                 and t2.group_id = t.group_id
                 and l2.count >= private.effective_target(t2.id, p_user, p_day)
             )
        )
    and (
          private.task_due_on(
            private.user_date(p_user, t.created_at),
            coalesce(c.frequency, t.frequency_days),
            null,
            p_day
          )
          or exists (
               select 1 from public.logs l3
               where l3.user_id = p_user
                 and l3.task_id = t.id
                 and l3.date    = p_day
                 and l3.count >= private.effective_target(t.id, p_user, p_day)
             )
        )
    and (
          private.assigned_on(t.id, p_user, p_day)
          or exists (
               select 1 from public.logs l4
               where l4.user_id = p_user
                 and l4.task_id = t.id
                 and l4.date    = p_day
                 and l4.count >= private.effective_target(t.id, p_user, p_day)
             )
        );
$$;

revoke all on function private.obligations(uuid, date)
  from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- The counting RPCs — the sanity cap follows the member, not the circle
-- ----------------------------------------------------------------------------
-- 0024 decided the D36a cap deliberately keeps reading the LIVE target rather
-- than the as-of one, because a cap is a bound on what a client may write NOW
-- and pinning it to a lowered historical target would refuse a member the
-- correction window they are entitled to. That reasoning is unchanged and kept.
--
-- But "live target" now means the member's live SHARE, and this is a real bug
-- rather than a tidiness: with a circle target of 100 the cap is
-- greatest(1000, 1100) = 1100, so a member given a share of 2000 could not log
-- their own share — every write closing their ring would be refused, and the
-- admin who set it would have handed them an obligation the app forbids them to
-- meet. The cap has to be computed from the number they are actually asked for.
--
-- Bodies otherwise unchanged from 0017.

create or replace function public.increment_count(p_task uuid, p_date date, p_delta integer)
  returns integer
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid    uuid := private.require_caller_profile();
  v_target integer;
  v_today  date;
  v_count  integer;
  v_cap    integer;
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

  perform private.refresh_streak(v_uid, p_date);   -- D48: back-fills repair too

  return v_count;
end;
$$;

create or replace function public.set_count(p_user uuid, p_task uuid, p_date date, p_count integer)
  returns integer
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid    uuid := private.require_caller_profile();
  v_self   boolean;
  v_target integer;
  v_today  date;
  v_cap    integer;
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

  perform private.refresh_streak(p_user, p_date);   -- D48: back-fills repair too

  return p_count;
end;
$$;

-- ----------------------------------------------------------------------------
-- set_task_goal — my stretch now floors at MY share, not the circle's
-- ----------------------------------------------------------------------------
-- Otherwise the two features contradict each other in the member's face: given
-- a circle target of 100 and a share of 500, the old body would accept a
-- "stretch" of 200 and report it as an increase, while the member's ring —
-- greatest(share, stretch) — sits at 500 and their day completes at 500. They
-- would have been told they had raised their bar by lowering it.
--
-- Both the floor and the cap move together. A cap still computed from the
-- circle's 100 would be 1100, refusing a member with a 2000 share any stretch
-- at all, which is the same defect as the count cap one section up.
--
-- Body otherwise unchanged from 0022, including the DELETE-before-UPDATE order
-- and its CHECK-constraint reason.

create or replace function public.set_task_goal(p_task uuid, p_target integer)
  returns integer
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid    uuid := private.require_caller_profile();
  v_target integer;
  v_cap    integer;
begin
  if not private.is_task_group_member(p_task) then
    raise exception 'task not found';
  end if;

  -- What the circle asks of ME today — the share if I have one, else the
  -- circle's target. This is the floor a stretch must clear.
  v_target := private.effective_target(p_task, v_uid, private.user_today(v_uid));

  if p_target is null or p_target <= v_target then
    -- Clear the COUNT override only — deleting the row outright would silently
    -- take the member's frequency with it.
    --
    -- DELETE first, then UPDATE. The other order fails: `set target_count =
    -- null` on a row with no frequency override leaves both columns null, and
    -- the not-empty CHECK is evaluated on that statement, before any follow-up
    -- delete can tidy it away.
    delete from public.member_task_goals
     where user_id = v_uid and task_id = p_task and frequency_days is null;
    update public.member_task_goals
       set target_count = null, updated_at = now()
     where user_id = v_uid and task_id = p_task;
    return v_target;
  end if;

  v_cap := greatest(v_target * 10, v_target + 1000);
  if p_target > v_cap then
    raise exception 'goal exceeds the sanity cap for this task';
  end if;

  insert into public.member_task_goals (user_id, task_id, target_count)
  values (v_uid, p_task, p_target)
  on conflict (user_id, task_id)
  do update set target_count = excluded.target_count, updated_at = now();

  return p_target;
end;
$$;

-- ----------------------------------------------------------------------------
-- The reminder predicates — nag toward the share, then the stretch
-- ----------------------------------------------------------------------------
-- `greatest(t.target_count, g.target_count)` was already the 0018 shape; the
-- circle's target simply becomes the member's effective one. Without this an
-- admin raising somebody to 500 leaves them being told they are done at 100 —
-- the worst shape a notification bug can take, because the UI looks correct
-- (0019's lesson, and 0023's).
--
-- Both copies move together, for exactly that reason. They are the same
-- predicate written twice: `due_reminders` is the read-only one the pg_cron
-- tick uses, `claim_due_reminders` the one that claims and sends.

create or replace function private.due_reminders()
  returns table (reminder_id uuid, user_id uuid, task_id uuid, local_date date)
  language sql security definer set search_path = '' as $$
  select r.id, r.user_id, r.task_id, private.user_today(r.user_id)
  from public.reminders r
  join public.profiles p on p.id = r.user_id
  join public.tasks    t on t.id = r.task_id
  left join public.member_task_goals g
    on g.user_id = r.user_id and g.task_id = r.task_id
  where r.enabled
    and exists (
          select 1 from public.memberships m
          where m.group_id = t.group_id and m.user_id = r.user_id
        )
    and private.assigned_on(r.task_id, r.user_id, private.user_today(r.user_id))
    and private.task_due_on(
          private.user_date(r.user_id, t.created_at),
          t.frequency_days, g.frequency_days,
          private.user_today(r.user_id)
        )
    and (now() at time zone p.timezone)::time >= r.time_of_day
    and (now() at time zone p.timezone)::time <  r.time_of_day + interval '5 minutes'
    and (r.last_sent_on is null or r.last_sent_on <> private.user_today(r.user_id))
    and coalesce((
          select l.count from public.logs l
          where l.user_id = r.user_id
            and l.task_id = r.task_id
            and l.date    = private.user_today(r.user_id)
        ), 0) < greatest(
                  private.effective_target(
                    r.task_id, r.user_id, private.user_today(r.user_id)
                  ),
                  coalesce(g.target_count, 0)
                )
    and exists (
          select 1 from public.push_subscriptions s where s.user_id = r.user_id
        );
$$;

revoke all on function private.due_reminders() from public, anon, authenticated;

create or replace function public.claim_due_reminders()
  returns table (
    reminder_id   uuid,
    user_id       uuid,
    group_id      uuid,
    task_id       uuid,
    task_label    text,
    target_count  integer,
    current_count integer,
    endpoint      text,
    p256dh        text,
    auth          text
  )
  language plpgsql security definer set search_path = '' as $$
begin
  return query
  with due as (
    select d.reminder_id, d.user_id, d.task_id, d.local_date
    from private.due_reminders() d
  ),
  claimed as (
    update public.reminders r
       set last_sent_on = d.local_date
      from due d
     where r.id = d.reminder_id
    returning r.id, r.user_id, r.task_id
  )
  select
    c.id,
    c.user_id,
    t.group_id,
    c.task_id,
    t.label,
    greatest(
      private.effective_target(c.task_id, c.user_id, private.user_today(c.user_id)),
      coalesce(g.target_count, 0)
    ),
    coalesce(l.count, 0),
    s.endpoint,
    s.p256dh,
    s.auth
  from claimed c
  join public.tasks t on t.id = c.task_id
  join public.push_subscriptions s on s.user_id = c.user_id
  left join public.member_task_goals g
    on g.user_id = c.user_id and g.task_id = c.task_id
  left join public.logs l
    on l.user_id = c.user_id
   and l.task_id = c.task_id
   and l.date    = private.user_today(c.user_id);
end;
$$;

revoke all on function public.claim_due_reminders() from public, anon, authenticated;
grant execute on function public.claim_due_reminders() to service_role;

-- ----------------------------------------------------------------------------
-- public.set_member_task_share — the only way to write a share
-- ----------------------------------------------------------------------------
-- p_target NULL      → clear: the member goes back to the circle's target.
-- p_target <= circle → refused out loud (see the header's greatest() note).
--
-- Admin-only, and the authority check is `is_task_group_admin` — the same one
-- `set_count` uses for a proxy log, because this is the same kind of act by the
-- same people on the same screen. Assignment (0023) is the sibling: an admin
-- decides who carries a task, and now also how much of it.
--
-- Returns the member's EFFECTIVE target after the change, so the client
-- reconciles from the write rather than a refetch (D45) — including the clear
-- case, where what comes back is the circle's own number.

create or replace function public.set_member_task_share(
  p_task   uuid,
  p_user   uuid,
  p_target integer
) returns integer
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid    uuid := private.require_caller_profile();
  v_group  uuid;
  v_circle integer;
  v_cap    integer;
begin
  select group_id into v_group from public.tasks where id = p_task;

  -- Absent and forbidden look alike — no oracle for a task in a circle the
  -- caller cannot see (the increment_count convention, and set_task_assignees').
  if v_group is null or not private.is_group_admin(v_group) then
    raise exception 'task not found';
  end if;

  -- The member must actually be in this circle. Without this an admin could pin
  -- a share to a stranger's id and it would sit there inert until that person
  -- happened to join — set_task_assignees' argument, verbatim.
  if not exists (
    select 1 from public.memberships m
    where m.group_id = v_group and m.user_id = p_user
  ) then
    raise exception 'that person is not in this circle';
  end if;

  -- The circle's target as it stands NOW. Not the as-of one: this write says
  -- what the member owes going forward, so it is bounded by what the circle
  -- currently asks, not by what it asked a week ago.
  select target_count into v_circle from public.tasks where id = p_task;

  if p_target is null or p_target <= v_circle then
    -- CLEAR — back to the circle's share. Close the open interval; do not
    -- delete it. The days it covered are still judged by it (that is the whole
    -- point of the table), and `now()` is the half-open upper bound, so today
    -- is already back on the circle's number.
    update public.member_task_shares
       set effective_to = now()
     where task_id = p_task and user_id = p_user and effective_to is null;
    return v_circle;
  end if;

  -- The same sanity cap the count and the stretch use (D36a), against the
  -- circle's target — a share above it would be one no legal write could close.
  v_cap := greatest(v_circle * 10, v_circle + 1000);
  if p_target > v_cap then
    raise exception 'share exceeds the sanity cap for this task';
  end if;

  -- Close the open interval and open the next at the SAME instant, so the
  -- timeline has no hole (0024's task_version_roll, verbatim).
  update public.member_task_shares
     set effective_to = now()
   where task_id = p_task and user_id = p_user and effective_to is null;

  insert into public.member_task_shares
    (task_id, user_id, target_count, effective_from, set_by)
  values (p_task, p_user, p_target, now(), v_uid);

  return p_target;
end;
$$;

revoke all on function public.set_member_task_share(uuid, uuid, integer)
  from public, anon;
grant execute on function public.set_member_task_share(uuid, uuid, integer)
  to authenticated;

comment on function public.set_member_task_share(uuid, uuid, integer) is
  'Set one member''s share of a task (0032). NULL or <= the circle''s target '
  'clears it. Admin-only. Closes the open interval and opens a new one, so no '
  'past day''s verdict can change. `authenticated` holds no write grant on '
  'public.member_task_shares.';
