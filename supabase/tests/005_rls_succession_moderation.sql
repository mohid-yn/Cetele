-- ============================================================================
-- RLS + grants + logic test suite — M7 (succession + moderation, 0011)
-- ----------------------------------------------------------------------------
-- Run with `supabase test db` (pgTAP; one rolled-back transaction).
--
-- Covers the M7 invariants:
--   * audit_log / reports: grant + RLS posture (writes locked; reads scoped;
--     anon nothing); the super-admin sees audit/report metadata, not content
--   * group_owner_absent: active owner / dormant ≥14d / gone
--   * claim_ownership: co-admin only · blocked while owner active · works when
--     absent (roles flip, created_by moves, audited)
--   * reassign_owner: super-admin only · member-target required · audited
--   * resolve_report: super-admin only · status lifecycle · audited
--   * report filing: reporter = self; moderation columns server-controlled
--   * proxy-log trigger writes audit_log; a self-edit does not
-- ============================================================================

begin;
create extension if not exists pgtap with schema extensions;
set search_path to public, extensions;
select no_plan();

-- ----------------------------------------------------------------------------
-- Fixture: o=owner a=co-admin m=member s=super-admin x=outsider
-- g1 = dormant-owner circle (o joined 40d ago, no logs); g2 = active-owner
-- circle (o2 has a recent log). g1 has one task.
-- ----------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('f7000000-0000-0000-0000-000000000001', 'o@m7.test', '{"name":"O"}', 'authenticated', 'authenticated'),
  ('f7000000-0000-0000-0000-000000000002', 'a@m7.test', '{"name":"A"}', 'authenticated', 'authenticated'),
  ('f7000000-0000-0000-0000-000000000003', 'm@m7.test', '{"name":"M"}', 'authenticated', 'authenticated'),
  ('f7000000-0000-0000-0000-000000000009', 's@m7.test', '{"name":"S"}', 'authenticated', 'authenticated'),
  ('f7000000-0000-0000-0000-000000000008', 'x@m7.test', '{"name":"X"}', 'authenticated', 'authenticated');

update public.profiles set is_super_admin = true where id = 'f7000000-0000-0000-0000-000000000009';

-- g1 owner = o (no logs → dormant). g2 owner = x, a DIFFERENT person who IS
-- active (a recent log). Distinct owners matter: group_owner_absent judges the
-- owner's activity GLOBALLY (an owner active anywhere isn't "gone"), so o's
-- dormancy for g1 must not be masked by another circle's activity.
insert into public.groups (id, name, created_by) values
  ('f7000000-0000-0000-0000-0000000000b1', 'Dormant Circle', 'f7000000-0000-0000-0000-000000000001'),
  ('f7000000-0000-0000-0000-0000000000b2', 'Active Circle',  'f7000000-0000-0000-0000-000000000008');

insert into public.memberships (user_id, group_id, role, created_at) values
  ('f7000000-0000-0000-0000-000000000001', 'f7000000-0000-0000-0000-0000000000b1', 'owner',  current_date - 40),
  ('f7000000-0000-0000-0000-000000000002', 'f7000000-0000-0000-0000-0000000000b1', 'admin',  current_date - 40),
  ('f7000000-0000-0000-0000-000000000003', 'f7000000-0000-0000-0000-0000000000b1', 'member', current_date - 40),
  ('f7000000-0000-0000-0000-000000000008', 'f7000000-0000-0000-0000-0000000000b2', 'owner',  current_date - 40),
  ('f7000000-0000-0000-0000-000000000002', 'f7000000-0000-0000-0000-0000000000b2', 'admin',  current_date - 40);

insert into public.tasks (id, group_id, label, target_count) values
  ('f7000000-0000-0000-0000-0000000000c1', 'f7000000-0000-0000-0000-0000000000b1', 'Salawat', 10),
  ('f7000000-0000-0000-0000-0000000000c2', 'f7000000-0000-0000-0000-0000000000b2', 'Salawat', 10);

-- g2's owner (x) is ACTIVE (a recent log); g1's owner (o) has none → dormant.
insert into public.logs (user_id, task_id, date, count) values
  ('f7000000-0000-0000-0000-000000000008', 'f7000000-0000-0000-0000-0000000000c2', current_date - 1, 5);

create function pg_temp.impersonate(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

-- ----------------------------------------------------------------------------
-- Grant posture (0011)
-- ----------------------------------------------------------------------------
select ok(has_table_privilege('authenticated','public.audit_log','select'), 'audit_log readable (RLS-scoped)');
select ok(not has_table_privilege('authenticated','public.audit_log','insert'), 'audit_log INSERT is trigger/RPC-only');
select ok(not has_table_privilege('authenticated','public.audit_log','update'), 'audit_log UPDATE locked (append-only)');
select ok(not has_table_privilege('authenticated','public.audit_log','delete'), 'audit_log DELETE locked (append-only)');
select ok(not has_table_privilege('anon','public.audit_log','select'), 'anon has no audit_log read');
select ok(has_table_privilege('authenticated','public.reports','select'), 'reports readable (RLS-scoped)');
select ok(has_column_privilege('authenticated','public.reports','reason','insert'), 'reports filable');
select ok(not has_column_privilege('authenticated','public.reports','status','insert'), 'reports.status not client-settable');
select ok(not has_table_privilege('authenticated','public.reports','update'), 'reports UPDATE via resolve_report only');
select ok(not has_table_privilege('anon','public.reports','select'), 'anon has no reports read');
select ok(has_function_privilege('authenticated','public.claim_ownership(uuid)','execute'), 'claim_ownership callable');
select ok(not has_function_privilege('anon','public.reassign_owner(uuid,uuid)','execute'), 'anon cannot reassign');
select ok(not has_function_privilege('authenticated','private.audit_proxy_log()','execute'), 'audit trigger fn not client-callable');

-- ----------------------------------------------------------------------------
-- group_owner_absent
-- ----------------------------------------------------------------------------
select ok(private.group_owner_absent('f7000000-0000-0000-0000-0000000000b1'), 'dormant owner (no logs, joined 40d ago) → absent');
select ok(not private.group_owner_absent('f7000000-0000-0000-0000-0000000000b2'), 'active owner (recent log) → not absent');

-- ----------------------------------------------------------------------------
-- claim_ownership — co-admin only · blocked while active · works when absent
-- ----------------------------------------------------------------------------
select pg_temp.impersonate('f7000000-0000-0000-0000-000000000003'); -- m (plain member)
select throws_matching(
  $$select public.claim_ownership('f7000000-0000-0000-0000-0000000000b1')$$,
  'only a co-admin', 'a plain member cannot claim ownership');
reset role;

select pg_temp.impersonate('f7000000-0000-0000-0000-000000000002'); -- a (co-admin of g2, active owner)
select throws_matching(
  $$select public.claim_ownership('f7000000-0000-0000-0000-0000000000b2')$$,
  'still active', 'cannot claim while the owner is active');
reset role;

select pg_temp.impersonate('f7000000-0000-0000-0000-000000000002'); -- a claims dormant g1
select lives_ok(
  $$select public.claim_ownership('f7000000-0000-0000-0000-0000000000b1')$$,
  'a co-admin claims a dormant-owner group');
reset role;
select is((select role from public.memberships where group_id='f7000000-0000-0000-0000-0000000000b1' and user_id='f7000000-0000-0000-0000-000000000002'),
  'owner', 'claimer is now the owner');
select is((select role from public.memberships where group_id='f7000000-0000-0000-0000-0000000000b1' and user_id='f7000000-0000-0000-0000-000000000001'),
  'admin', 'the dormant owner is demoted to co-admin (kept in the circle)');
select is((select created_by from public.groups where id='f7000000-0000-0000-0000-0000000000b1'),
  'f7000000-0000-0000-0000-000000000002'::uuid, 'the owner pointer moved');
select is((select count(*) from public.audit_log where action='claim_ownership' and actor_id='f7000000-0000-0000-0000-000000000002'),
  1::bigint, 'the claim is audited');

-- ----------------------------------------------------------------------------
-- reassign_owner — super-admin only · member target · audited
-- ----------------------------------------------------------------------------
select pg_temp.impersonate('f7000000-0000-0000-0000-000000000003'); -- m (not super-admin)
select throws_matching(
  $$select public.reassign_owner('f7000000-0000-0000-0000-0000000000b1','f7000000-0000-0000-0000-000000000003')$$,
  'super-admin only', 'a non-super-admin cannot reassign');
reset role;

select pg_temp.impersonate('f7000000-0000-0000-0000-000000000009'); -- s (super-admin)
select throws_matching(
  $$select public.reassign_owner('f7000000-0000-0000-0000-0000000000b1','f7000000-0000-0000-0000-000000000008')$$,
  'must be a member', 'cannot reassign to a non-member');
select lives_ok(
  $$select public.reassign_owner('f7000000-0000-0000-0000-0000000000b1','f7000000-0000-0000-0000-000000000003')$$,
  'a super-admin reassigns the owner (recovery)');
reset role;
select is((select role from public.memberships where group_id='f7000000-0000-0000-0000-0000000000b1' and user_id='f7000000-0000-0000-0000-000000000003'),
  'owner', 'reassign target is now the owner');
select is((select count(*) from public.audit_log where action='reassign_owner'),
  1::bigint, 'the reassignment is audited');

-- ----------------------------------------------------------------------------
-- reports — filing (self only) + RLS + resolve_report (super-admin)
-- ----------------------------------------------------------------------------
select pg_temp.impersonate('f7000000-0000-0000-0000-000000000003'); -- m files a report
select lives_ok(
  $$insert into public.reports (reporter_id, group_id, reported_user_id, reason)
    values ('f7000000-0000-0000-0000-000000000003','f7000000-0000-0000-0000-0000000000b1','f7000000-0000-0000-0000-000000000001','spam')$$,
  'a member files a report as themselves');
select throws_ok(
  $$insert into public.reports (reporter_id, reason)
    values ('f7000000-0000-0000-0000-000000000001','forged')$$,
  '42501', null, 'cannot file a report as someone else');
select is((select count(*) from public.reports), 1::bigint, 'reporter sees their own report');
reset role;

select pg_temp.impersonate('f7000000-0000-0000-0000-000000000008'); -- x (unrelated, not super)
select is((select count(*) from public.reports), 0::bigint, 'an unrelated user sees no reports');
reset role;

select pg_temp.impersonate('f7000000-0000-0000-0000-000000000009'); -- s (super-admin)
select is((select count(*) from public.reports), 1::bigint, 'a super-admin sees all reports');
select throws_matching(
  $$select public.resolve_report((select id from public.reports limit 1), 'bogus')$$,
  'invalid status', 'resolve_report rejects an invalid status');
select lives_ok(
  $$select public.resolve_report((select id from public.reports limit 1), 'actioned', 'handled')$$,
  'a super-admin resolves a report');
reset role;
select is((select status from public.reports limit 1), 'actioned', 'the report status advanced');
select is((select count(*) from public.audit_log where action='resolve_report'), 1::bigint, 'the resolution is audited');

-- a plain member cannot resolve
select pg_temp.impersonate('f7000000-0000-0000-0000-000000000003');
select throws_matching(
  $$select public.resolve_report((select id from public.reports limit 1), 'dismissed')$$,
  'super-admin only', 'a member cannot resolve reports');
reset role;

-- ----------------------------------------------------------------------------
-- proxy-log audit trigger (D29) + audit_log RLS
-- ----------------------------------------------------------------------------
-- proxy edit: an admin (a, now owner of g1) sets m's count via set_count
select pg_temp.impersonate('f7000000-0000-0000-0000-000000000002'); -- a
select lives_ok(
  $$select public.set_count('f7000000-0000-0000-0000-000000000003','f7000000-0000-0000-0000-0000000000c1', current_date-1, 7)$$,
  'admin proxy-logs a member');
reset role;
select is((select count(*) from public.audit_log where action='proxy_log' and target_user_id='f7000000-0000-0000-0000-000000000003'),
  1::bigint, 'a proxy edit is audited');

-- self-edit: m corrects their own count → NOT a proxy → no new audit row
select pg_temp.impersonate('f7000000-0000-0000-0000-000000000003'); -- m
select lives_ok(
  $$select public.set_count('f7000000-0000-0000-0000-000000000003','f7000000-0000-0000-0000-0000000000c1', current_date-1, 4)$$,
  'member self-corrects');
reset role;
select is((select count(*) from public.audit_log where action='proxy_log'),
  1::bigint, 'a self-edit is not audited as a proxy');

-- audit_log RLS: the target member sees their own proxy entry; an outsider none
select pg_temp.impersonate('f7000000-0000-0000-0000-000000000003'); -- m (target)
select ok((select count(*) from public.audit_log where target_user_id='f7000000-0000-0000-0000-000000000003') > 0,
  'the affected member sees their own audit entry (D29)');
reset role;
select pg_temp.impersonate('f7000000-0000-0000-0000-000000000008'); -- x
select is((select count(*) from public.audit_log), 0::bigint, 'an outsider sees no audit entries');
reset role;
select pg_temp.impersonate('f7000000-0000-0000-0000-000000000009'); -- s (super-admin)
select ok((select count(*) from public.audit_log) >= 3, 'a super-admin sees the full audit trail');
reset role;

select * from finish();
rollback;
