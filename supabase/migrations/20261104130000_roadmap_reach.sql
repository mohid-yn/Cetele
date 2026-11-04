-- ============================================================================
-- Migration 0038: how many PEOPLE a roadmap reaches (D72)
-- ----------------------------------------------------------------------------
-- The roadmap admin page says "Live for N members in M circles". N was the sum of
-- each circle's head-count, so someone in two circles counted twice: a roadmap
-- reaching 3 people said 5, and the Withdraw warning repeated the wrong number.
--
-- The answer has to come from the server. `memberships` stays unreadable to an
-- organiser (D27), so the client can only add up the per-circle totals that
-- `roadmap_circles` returns. This returns one more number and still nothing
-- about who those people are.
-- ============================================================================

create or replace function public.roadmap_reach(p_roadmap uuid)
  returns integer
  language plpgsql security definer stable set search_path = '' as $$
begin
  if not private.is_super_admin() then
    raise exception 'organisers only';
  end if;

  return (
    select count(distinct m.user_id)::integer
      from public.group_roadmaps gr
      join public.memberships m on m.group_id = gr.group_id
     where gr.roadmap_id = p_roadmap
  );
end;
$$;

revoke all on function public.roadmap_reach(uuid) from public, anon;
grant execute on function public.roadmap_reach(uuid) to authenticated;
