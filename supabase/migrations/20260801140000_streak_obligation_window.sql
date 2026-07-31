-- ============================================================================
-- Migration 0020 — joining a second circle no longer erases your streak
-- ----------------------------------------------------------------------------
-- `private.is_day_complete` asked "is every task in every group I am in NOW at
-- target on this day", with no notion of when those obligations began. So a
-- past day was always judged by today's obligations. Measured before writing
-- this: a member who kept circle A every day for 10 days, then joined circle B
-- yesterday and kept that too, rebuilt to a streak of **2**. Every day before
-- they joined B counted as missed, because B's tasks — which did not apply to
-- them then — were unmet.
--
-- The live stored streak is largely shielded by refresh_streak's "never demote
-- implicitly" guard, so this does not present as an instant loss. It bites on
-- REBUILD, which is exactly what D48 is for: back-filling a missed day is meant
-- to repair the visible chain, and this silently capped the repair at the most
-- recent join. Punishing someone for joining a second circle is what D8 forbids.
--
-- THE RULE, AND THE ESCAPE HATCH THAT MAKES IT SAFE
--
-- A task counts against day D if the member was in its group on D — OR if they
-- have logged something in that group on D. The second half is not a nicety, it
-- is what keeps D48 working: `increment_count`'s 14-day window is NOT bounded by
-- join date (0016 checks membership and the date range, nothing else), so a new
-- member legitimately back-fills days from before they joined, and D48 says
-- those days rebuild the chain. A bare membership bound would have silently
-- stopped counting exactly those days — it broke three existing D48 assertions
-- when tried, which is how this escape hatch was found.
--
-- Claiming a day claims the whole GROUP's task list for it, not just the task
-- you happened to log. Otherwise back-filling 1 of 3 tasks would mark the day
-- complete and over-credit the member.
--
-- The non-empty check is load-bearing, not decoration: `not exists(...)` over an
-- empty obligation set is vacuously TRUE, so without it a day on which the
-- member owed nothing would count as kept, and refresh_streak would walk back
-- through 13 such days handing out a fortnight's streak to anyone who completed
-- a single day. A day with no obligations is not a day you kept.
--
-- Direction of change: a past day can only become MORE complete, never less.
-- No existing streak can shorten because of this migration.
--
-- NOT FIXED HERE, deliberately — see STATUS. The same retroactivity applies to
-- TASKS: an admin adding a second task collapses a rebuilt streak from 10 to 1,
-- for every member at once. Fixing it needs a `tasks.created_at` and a decision
-- that collides with D48 (a brand-new circle's tasks did not exist for the days
-- its members are allowed to back-fill, so bounding by task age would stop a new
-- member's back-fill counting at all). That is a product call, not a patch.
-- ============================================================================

create or replace function private.is_day_complete(p_user uuid, p_day date) returns boolean
  language sql security definer set search_path = '' as $$
  with obligations as (
    select t.id, t.target_count
    from public.tasks t
    join public.memberships m on m.group_id = t.group_id
    where m.user_id = p_user
      and (
        -- I was in this circle on that day...
        m.created_at::date <= p_day
        -- ...or I have claimed that day in this circle by logging in it (D48:
        -- the back-fill window reaches back past a join date on purpose).
        or exists (
             select 1
             from public.logs l2
             join public.tasks t2 on t2.id = l2.task_id
             where l2.user_id = p_user
               and l2.date    = p_day
               and t2.group_id = t.group_id
           )
      )
  )
  select count(*) > 0
     and count(*) filter (
           where coalesce((
                   select l.count from public.logs l
                   where l.user_id = p_user
                     and l.task_id = obligations.id
                     and l.date    = p_day
                 ), 0) < obligations.target_count
         ) = 0
  from obligations;
$$;

revoke all on function private.is_day_complete(uuid, date) from public, anon, authenticated;
