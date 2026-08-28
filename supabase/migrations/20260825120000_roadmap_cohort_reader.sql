-- ============================================================================
-- Migration 0035 — the cohort report is for whoever LEADS a circle (D69)
-- ----------------------------------------------------------------------------
-- Owner: "only group owners and co admins should see member progress for the
-- groups roadmap."
--
-- WHAT WAS ACTUALLY WRONG, and what was not. The DATA was never leaking:
-- `private.can_read_roadmap_progress` (0025, widened in 0028) has always had
-- exactly three arms — your own row, a super admin, or an owner/admin of a
-- circle you share that FOLLOWS the programme — and pgTAP 014 pins the negative
-- that distinguishes the third from `shares_group_as_admin`. Nothing here
-- touches that policy, and nothing should: a member reading their own progress
-- is what draws their own roadmap screen.
--
-- What leaked was the SCREEN. `/programme/[roadmapId]` offered "Members'
-- progress" to every reader on the argument that the report is RLS-scoped, so
-- a plain member would simply see themselves. True, and still wrong: they land
-- on a page headed "Members' progress", carrying a cohort strip and a roster,
-- and the roster is a list of one — themselves. The screen tells them nothing
-- and reads as though the circle has one person on the programme. A report
-- about the cohort is an ADMINISTRATIVE reading (D26/D28: the fortnight is
-- admins-only for the same reason), so the door belongs to the same people.
--
-- WHY A FUNCTION AND NOT AN `exists` IN THE PAGE. Both roadmap screens now need
-- the same answer, and the app deciding it in TypeScript is the second copy of
-- a database rule that `progress/page.tsx`'s own header refuses to grow. This
-- is `private.can_read_roadmap_progress`'s third arm, ITEM-FREE — the same
-- relationship `roadmap_roster` (0025) already has to it — so the three readers
-- keep one definition and a future widening moves one place.
--
-- It is `public` and client-callable because the pages call it directly; it
-- leaks nothing a caller cannot already establish about their OWN memberships.
-- ============================================================================

create or replace function public.can_read_roadmap_cohort(p_roadmap uuid)
  returns boolean
  language sql security definer stable set search_path = '' as $$
  select private.is_super_admin()
      or exists (
        select 1
        from public.group_roadmaps gr
        join public.memberships me on me.group_id = gr.group_id
        where gr.roadmap_id = p_roadmap
          and me.user_id = (select auth.uid())
          and me.role in ('owner', 'admin')
      );
$$;

revoke all on function public.can_read_roadmap_cohort(uuid) from public, anon;
grant execute on function public.can_read_roadmap_cohort(uuid) to authenticated;

comment on function public.can_read_roadmap_cohort(uuid) is
  'May the caller read the COHORT for this programme — everyone''s progress '
  'rather than their own (0035, D69)? Super admin, or owner/co-admin of a '
  'circle that follows it. This is private.can_read_roadmap_progress'' third '
  'arm without the item, exactly as roadmap_roster() is: it gates the SCREEN, '
  'while the row-level answer stays with the policy.';
