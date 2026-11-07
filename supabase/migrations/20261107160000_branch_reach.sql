-- ============================================================================
-- Migration 0046: what reaches a branch, in one read (D82)
-- ----------------------------------------------------------------------------
-- The owner could not see how roadmaps and events cascade (2026-11-07). The
-- branch page becomes the hub: for one branch, every roadmap, weekly halaqah
-- and upcoming camp that reaches its circles, and whether it was set HERE or
-- comes from a branch ABOVE.
--
-- Security definer because a steward of a lower branch cannot otherwise read
-- what an organiser set higher up (`events_select` lets them see their own
-- subtree, not their ancestors'). It is safe to show them: those items reach
-- the very circles the steward runs. Titles, times and the source branch only;
-- no RSVPs, no names.
--
-- A draft camp above is not shown to a lower steward: a draft is its author's.
-- ============================================================================

create or replace function public.branch_reach(p_branch uuid)
  returns table (
    kind             text,          -- 'roadmap' | 'series' | 'camp'
    id               uuid,
    title            text,
    status           text,          -- roadmap: 'published'|'draft'; camp: event status; series: 'active'|'off'
    starts_at        timestamptz,   -- camps
    ends_at          timestamptz,   -- camps
    timezone         text,          -- camps and series
    weekday          smallint,      -- series
    start_time       time,          -- series
    from_branch      uuid,
    from_branch_name text,
    inherited        boolean
  )
  language plpgsql security definer stable set search_path = '' as $$
begin
  if not private.is_steward_of(p_branch) then
    raise exception 'you do not run that branch';
  end if;

  return query
    with up as (
      select l.id as bid, (l.id <> p_branch) as inh
        from private.branch_lineage(p_branch) as l(id)
    )
    select 'roadmap'::text, r.id, r.name,
           case when r.published then 'published' else 'draft' end,
           null::timestamptz, null::timestamptz, null::text,
           null::smallint, null::time,
           b.id, b.name, up.inh
      from up
      join public.branch_roadmaps br on br.branch_id = up.bid
      join public.roadmaps r on r.id = br.roadmap_id
      join public.branches b on b.id = up.bid
    union all
    select 'series', s.id, s.title,
           case when s.active then 'active' else 'off' end,
           null, null, s.timezone, s.weekday, s.start_time,
           b.id, b.name, up.inh
      from up
      join public.event_series s on s.branch_id = up.bid
      join public.branches b on b.id = up.bid
     where s.active or not up.inh
    union all
    select 'camp', e.id, e.title, e.status,
           e.starts_at, e.ends_at, e.timezone, null, null,
           b.id, b.name, up.inh
      from up
      join public.events e on e.branch_id = up.bid and e.kind = 'camp'
      join public.branches b on b.id = up.bid
     where e.ends_at > now()
       and (e.status <> 'draft' or not up.inh);
end;
$$;

revoke all on function public.branch_reach(uuid) from public, anon;
grant execute on function public.branch_reach(uuid) to authenticated;
