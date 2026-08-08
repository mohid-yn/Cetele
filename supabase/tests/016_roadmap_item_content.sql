-- ============================================================================
-- Logic + grants test suite — 0027 (an organiser edits an item, D57)
-- ----------------------------------------------------------------------------
-- D55 let NO client write roadmap content. 0027 opens exactly three columns to
-- exactly one role, so the assertions that matter are the ones about the line:
--
--   * THE NEGATIVE THAT KEEPS D55 — a plain member cannot edit anything, and a
--     circle OWNER cannot either. Leading a circle that follows the programme
--     is not authorship of it
--   * THE STRUCTURAL COLUMNS SURVIVE. level / category / title / unit / target
--     / compulsory are untouched by an edit, because they decide what
--     COMPLETION means and moving them re-judges progress already earned. The
--     RPC has no parameter for them; this asserts the row proves it
--   * `javascript:` IS REFUSED. The URL is rendered as an anchor to every
--     member of every circle following the programme — the widest blast radius
--     in the app, reachable from one compromised organiser account
--   * BLANK CLEARS. The form always submits all three fields, so "" has to mean
--     "remove it" or a wrong URL could never be taken back
--   * every edit is audited (D27), and a REFUSED edit writes nothing
-- ============================================================================

begin;
create extension if not exists pgtap with schema extensions;
set search_path to public, extensions;
select no_plan();

-- ----------------------------------------------------------------------------
-- Fixture — one programme, one item, and three readers
-- ----------------------------------------------------------------------------
--   S  — an organiser
--   O  — the OWNER of a circle that follows the programme (the interesting
--        negative: maximum authority INSIDE a circle, none over the programme)
--   M  — a plain member of that circle
-- ----------------------------------------------------------------------------
insert into auth.users (id, instance_id, email, aud, role) values
  ('e1000000-0000-0000-0000-00000000000e', '00000000-0000-0000-0000-000000000000', 'ed-s@example.com', 'authenticated', 'authenticated'),
  ('e1000000-0000-0000-0000-00000000000f', '00000000-0000-0000-0000-000000000000', 'ed-o@example.com', 'authenticated', 'authenticated'),
  ('e1000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000000', 'ed-m@example.com', 'authenticated', 'authenticated')
on conflict (id) do nothing;

update public.profiles set is_super_admin = false where is_super_admin;
update public.profiles set is_super_admin = true
  where id = 'e1000000-0000-0000-0000-00000000000e';

insert into public.roadmaps (id, name, starts_on, ends_on, published)
values ('e2000000-0000-0000-0000-000000000001', 'Editable Programme',
        current_date - 10, current_date + 100, true);

insert into public.roadmap_items
  (id, roadmap_id, level, category, title, unit, target, compulsory, sort_order)
values ('e3000000-0000-0000-0000-000000000001',
        'e2000000-0000-0000-0000-000000000001', 1, 'book',
        'A Book', 'book', 1, true, 1);

insert into public.groups (id, name, created_by)
values ('e4000000-0000-0000-0000-000000000001', 'Editable Circle',
        'e1000000-0000-0000-0000-00000000000f');

-- Following is a row since 0028, not a column.
insert into public.group_roadmaps (group_id, roadmap_id)
values ('e4000000-0000-0000-0000-000000000001',
        'e2000000-0000-0000-0000-000000000001');

insert into public.memberships (user_id, group_id, role) values
  ('e1000000-0000-0000-0000-00000000000f', 'e4000000-0000-0000-0000-000000000001', 'owner'),
  ('e1000000-0000-0000-0000-00000000000c', 'e4000000-0000-0000-0000-000000000001', 'member');

create function pg_temp.impersonate(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

create function pg_temp.reset_role() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', null, true);
end $$;

-- ----------------------------------------------------------------------------
-- 1. THE NEGATIVES — D55's "no client authors content" still holds for everyone
--    who is not an organiser
-- ----------------------------------------------------------------------------

select pg_temp.impersonate('e1000000-0000-0000-0000-00000000000c');
select throws_ok(
  $$ select public.set_roadmap_item_content('e3000000-0000-0000-0000-000000000001',
       'https://evil.example', 'mine now', null) $$,
  'organisers only',
  'a plain member cannot edit a roadmap item');
select pg_temp.reset_role();

-- The one worth having. An OWNER has every authority inside their circle and
-- the circle genuinely follows this programme — and still may not author it.
-- The programme is the administration's, not the circle's (D55).
select pg_temp.impersonate('e1000000-0000-0000-0000-00000000000f');
select throws_ok(
  $$ select public.set_roadmap_item_content('e3000000-0000-0000-0000-000000000001',
       'https://evil.example', 'mine now', null) $$,
  'organisers only',
  'THE NEGATIVE: a circle OWNER whose circle follows the programme cannot edit it');
select pg_temp.reset_role();

-- No client may write the columns directly either, whatever the RPC does.
select ok(not has_table_privilege('authenticated', 'public.roadmap_items', 'update'),
  'authenticated has no direct UPDATE on roadmap_items — the RPC is the only door');

-- ----------------------------------------------------------------------------
-- 2. The organiser's edit
-- ----------------------------------------------------------------------------

select pg_temp.impersonate('e1000000-0000-0000-0000-00000000000e');

select lives_ok(
  $$ select public.set_roadmap_item_content('e3000000-0000-0000-0000-000000000001',
       'https://youtube.com/playlist?list=abc', 'What it is.', '/roadmap/x.png') $$,
  'an organiser sets the link, description and picture');

select pg_temp.reset_role();
select is(
  (select url from public.roadmap_items where id = 'e3000000-0000-0000-0000-000000000001'),
  'https://youtube.com/playlist?list=abc', '...the link landed');
select is(
  (select description from public.roadmap_items where id = 'e3000000-0000-0000-0000-000000000001'),
  'What it is.', '...the description landed');
select is(
  (select image_url from public.roadmap_items where id = 'e3000000-0000-0000-0000-000000000001'),
  '/roadmap/x.png', '...the picture landed');

-- THE ASSERTION THE WHOLE COLUMN SPLIT RESTS ON. An edit must not be able to
-- move anything completion is computed from — otherwise a member who finished
-- this item yesterday is un-finished today by an edit they never saw.
select results_eq(
  $$ select level, category, title, unit, target, compulsory
       from public.roadmap_items where id = 'e3000000-0000-0000-0000-000000000001' $$,
  $$ values (1, 'book', 'A Book', 'book', 1, true) $$,
  'THE STRUCTURAL COLUMNS ARE UNTOUCHED — an edit cannot re-judge completion');

-- ----------------------------------------------------------------------------
-- 3. What a link is allowed to be
-- ----------------------------------------------------------------------------

select pg_temp.impersonate('e1000000-0000-0000-0000-00000000000e');

-- Rendered as an anchor to every member of every circle following the
-- programme. One compromised organiser account is the whole blast radius.
select throws_ok(
  $$ select public.set_roadmap_item_content('e3000000-0000-0000-0000-000000000001',
       'javascript:alert(1)', null, null) $$,
  'a link must start with http:// or https://',
  'a javascript: URL is refused — stored XSS aimed at the whole cohort');

select throws_ok(
  $$ select public.set_roadmap_item_content('e3000000-0000-0000-0000-000000000001',
       'data:text/html;base64,PHNjcmlwdD4=', null, null) $$,
  'a link must start with http:// or https://',
  'a data: URL is refused too');

select throws_ok(
  $$ select public.set_roadmap_item_content('e3000000-0000-0000-0000-000000000001',
       null, null, 'javascript:alert(1)') $$,
  'a picture must be a link, or a path beginning with /',
  'and the PICTURE field is guarded on the same rule');

select lives_ok(
  $$ select public.set_roadmap_item_content('e3000000-0000-0000-0000-000000000001',
       'http://example.com/x', null, 'https://cdn.example.com/c.png') $$,
  'plain http and a remote https image are both allowed');

-- BLANK CLEARS. The form always submits all three fields, so "" must mean
-- "remove it" — otherwise a wrong URL could never be taken back through the UI,
-- which is the single most likely thing anyone will want to do here.
select lives_ok(
  $$ select public.set_roadmap_item_content('e3000000-0000-0000-0000-000000000001',
       '   ', '', null) $$,
  'whitespace and empty string are accepted');

select pg_temp.reset_role();
select ok(
  (select url is null and description is null and image_url is null
     from public.roadmap_items where id = 'e3000000-0000-0000-0000-000000000001'),
  '...and they CLEARED the fields rather than storing blanks');

-- ----------------------------------------------------------------------------
-- 4. Audited (D27 — every organiser action is logged)
-- ----------------------------------------------------------------------------

select is(
  (select count(*)::int from public.audit_log
    where action = 'edit_roadmap_item'
      and actor_id = 'e1000000-0000-0000-0000-00000000000e'),
  3,
  'every successful edit is audited, and only the successful ones');

select is(
  (select detail->>'item' from public.audit_log
    where action = 'edit_roadmap_item'
      and actor_id = 'e1000000-0000-0000-0000-00000000000e'
    order by created_at limit 1),
  'e3000000-0000-0000-0000-000000000001',
  '...naming which item was changed');

-- A refused edit rolled back, so nothing claims it happened. Three lives_ok
-- above, four throws_ok — the count is 3, not 7.
select is(
  (select count(*)::int from public.audit_log
    where action = 'edit_roadmap_item'
      and detail->>'url' = 'javascript:alert(1)'),
  0,
  'a REFUSED edit wrote no audit row');

-- ----------------------------------------------------------------------------
-- 5. Grants
-- ----------------------------------------------------------------------------

select ok(not has_function_privilege('anon',
  'public.set_roadmap_item_content(uuid, text, text, text)', 'execute'),
  'anon cannot call the editor');
select ok(has_function_privilege('authenticated',
  'public.set_roadmap_item_content(uuid, text, text, text)', 'execute'),
  'authenticated may CALL it — the function itself does the gating');

select * from finish();
rollback;
