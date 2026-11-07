-- ============================================================================
-- Logic + grants test suite: 0043 (events, RSVPs, polls, questions, D80)
-- ----------------------------------------------------------------------------
-- Pins who an event reaches (its branch and everything under it, never beside),
-- that RSVP names go to stewards only, that nobody can read who asked a
-- question or who voted for what, and the rules on capacity, deadlines,
-- cancelling and editing a weekly series.
-- ============================================================================

begin;
create extension if not exists pgtap with schema extensions;
set search_path to public, extensions;
select no_plan();

create function pg_temp.impersonate(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end;
$$;
create function pg_temp.reset_role() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', null, true);
end;
$$;

-- S steward of Melbourne · A, B in the south-east circle · N in the north
-- circle · Q in Queensland · X in no circle · H a halaqah host (in no circle).
insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('cd000000-0000-0000-0000-000000000005', 's@ev.test', '{"name":"S"}', 'authenticated', 'authenticated'),
  ('cd000000-0000-0000-0000-00000000000a', 'a@ev.test', '{"name":"A"}', 'authenticated', 'authenticated'),
  ('cd000000-0000-0000-0000-00000000000b', 'b@ev.test', '{"name":"B"}', 'authenticated', 'authenticated'),
  ('cd000000-0000-0000-0000-00000000000d', 'n@ev.test', '{"name":"N"}', 'authenticated', 'authenticated'),
  ('cd000000-0000-0000-0000-00000000000c', 'q@ev.test', '{"name":"Q"}', 'authenticated', 'authenticated'),
  ('cd000000-0000-0000-0000-00000000000e', 'x@ev.test', '{"name":"X"}', 'authenticated', 'authenticated'),
  ('cd000000-0000-0000-0000-000000000006', 'h@ev.test', '{"name":"H"}', 'authenticated', 'authenticated');

insert into public.branches (id, parent_id, name) values
  ('cd000000-0000-0000-0000-000000000100', null, 'YN'),
  ('cd000000-0000-0000-0000-000000000102', 'cd000000-0000-0000-0000-000000000100', 'Melbourne'),
  ('cd000000-0000-0000-0000-000000000103', 'cd000000-0000-0000-0000-000000000102', 'South East'),
  ('cd000000-0000-0000-0000-000000000104', 'cd000000-0000-0000-0000-000000000102', 'North'),
  ('cd000000-0000-0000-0000-000000000105', 'cd000000-0000-0000-0000-000000000100', 'Queensland');
insert into public.branch_stewards (branch_id, user_id) values
  ('cd000000-0000-0000-0000-000000000102', 'cd000000-0000-0000-0000-000000000005');

insert into public.groups (id, name, created_by, branch_id) values
  ('cd000000-0000-0000-0000-000000000200', 'SE', 'cd000000-0000-0000-0000-00000000000a', 'cd000000-0000-0000-0000-000000000103'),
  ('cd000000-0000-0000-0000-000000000201', 'North', 'cd000000-0000-0000-0000-00000000000d', 'cd000000-0000-0000-0000-000000000104'),
  ('cd000000-0000-0000-0000-000000000202', 'QLD', 'cd000000-0000-0000-0000-00000000000c', 'cd000000-0000-0000-0000-000000000105');
insert into public.memberships (user_id, group_id, role) values
  ('cd000000-0000-0000-0000-00000000000a', 'cd000000-0000-0000-0000-000000000200', 'owner'),
  ('cd000000-0000-0000-0000-00000000000b', 'cd000000-0000-0000-0000-000000000200', 'member'),
  ('cd000000-0000-0000-0000-00000000000d', 'cd000000-0000-0000-0000-000000000201', 'owner'),
  ('cd000000-0000-0000-0000-00000000000c', 'cd000000-0000-0000-0000-000000000202', 'owner');

-- A place to keep ids between statements.
create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated;

-- ---- a camp: draft, then published -----------------------------------------
select pg_temp.impersonate('cd000000-0000-0000-0000-00000000000b');
select throws_ok(
  $$ select public.save_camp(null, 'cd000000-0000-0000-0000-000000000102', 'Camp', '', '',
       now() + interval '10 days', now() + interval '12 days', 'Australia/Melbourne',
       null, null, 'draft') $$,
  'you do not run that branch',
  'a member cannot post a camp');
select pg_temp.reset_role();

select pg_temp.impersonate('cd000000-0000-0000-0000-000000000005');
select throws_ok(
  $$ select public.save_camp(null, 'cd000000-0000-0000-0000-000000000105', 'Camp', '', '',
       now() + interval '10 days', now() + interval '12 days', 'Australia/Melbourne',
       null, null, 'draft') $$,
  'you do not run that branch',
  'the Melbourne steward cannot post in Queensland');
select throws_ok(
  $$ select public.save_camp(null, 'cd000000-0000-0000-0000-000000000102', 'Camp', '', '',
       now() + interval '10 days', now() + interval '12 days', 'Mars/Olympus',
       null, null, 'draft') $$,
  'unknown time zone',
  'an unknown time zone is refused');
select throws_ok(
  $$ select public.save_camp(null, 'cd000000-0000-0000-0000-000000000102', 'Camp', '', '',
       now() + interval '12 days', now() + interval '10 days', 'Australia/Melbourne',
       null, null, 'draft') $$,
  'the end must be after the start',
  'an end before the start is refused');

insert into ids values ('camp', public.save_camp(null, 'cd000000-0000-0000-0000-000000000102',
  'Winter camp', 'Bring a sleeping bag', 'Lake Eildon',
  now() + interval '10 days', now() + interval '12 days', 'Australia/Melbourne',
  null, 1, 'draft'));
select pg_temp.reset_role();

select pg_temp.impersonate('cd000000-0000-0000-0000-00000000000b');
select is((select count(*) from public.events), 0::bigint,
  'a draft is invisible to members');
select is((select count(*) from public.my_upcoming_events()), 0::bigint,
  'and is not in their upcoming list');
select pg_temp.reset_role();

select pg_temp.impersonate('cd000000-0000-0000-0000-000000000005');
select lives_ok(
  $$ select public.save_camp((select v from ids where k = 'camp'), 'cd000000-0000-0000-0000-000000000102',
       'Winter camp', 'Bring a sleeping bag', 'Lake Eildon',
       now() + interval '10 days', now() + interval '12 days', 'Australia/Melbourne',
       null, 1, 'published') $$,
  'the steward publishes it');
select throws_ok(
  $$ select public.save_camp((select v from ids where k = 'camp'), 'cd000000-0000-0000-0000-000000000102',
       'Winter camp', '', '', now() + interval '10 days', now() + interval '12 days',
       'Australia/Melbourne', null, 1, 'draft') $$,
  'a published camp can be cancelled, not unpublished',
  'a published camp cannot slip back into a draft');
select pg_temp.reset_role();

-- ---- reach -----------------------------------------------------------------
select pg_temp.impersonate('cd000000-0000-0000-0000-00000000000b');
select is((select count(*) from public.my_upcoming_events()), 1::bigint,
  'a south-east member sees the Melbourne camp');
select is((select venue from public.event_detail((select v from ids where k = 'camp'))),
  'Lake Eildon', 'with its venue');
select pg_temp.reset_role();

select pg_temp.impersonate('cd000000-0000-0000-0000-00000000000d');
select is((select count(*) from public.my_upcoming_events()), 1::bigint,
  'so does a north member: the camp is for all of Melbourne');
select pg_temp.reset_role();

select pg_temp.impersonate('cd000000-0000-0000-0000-00000000000c');
select is((select count(*) from public.my_upcoming_events()), 0::bigint,
  'Queensland does not');
select is((select count(*) from public.event_detail((select v from ids where k = 'camp'))), 0::bigint,
  'not even by id');
select is((select count(*) from public.events), 0::bigint,
  'nor through the table');
select throws_ok(
  $$ select public.set_rsvp((select v from ids where k = 'camp'), 'going') $$,
  'event not found',
  'and cannot answer it');
select pg_temp.reset_role();

select pg_temp.impersonate('cd000000-0000-0000-0000-00000000000e');
select is((select count(*) from public.my_upcoming_events()), 0::bigint,
  'someone in no circle sees no events');
select pg_temp.reset_role();

-- ---- RSVPs -----------------------------------------------------------------
select pg_temp.impersonate('cd000000-0000-0000-0000-00000000000b');
select is(public.set_rsvp((select v from ids where k = 'camp'), 'going', 'vegetarian'),
  'going', 'one call answers');
select is(public.set_rsvp((select v from ids where k = 'camp'), 'going'),
  'going', 'answering again is harmless');
select is((select note from public.event_rsvps), 'vegetarian',
  'and a tap without a note keeps the note');
select throws_ok(
  $$ select public.set_rsvp((select v from ids where k = 'camp'), 'perhaps') $$,
  'answer going, maybe or no',
  'only the three answers exist');
select pg_temp.reset_role();

select pg_temp.impersonate('cd000000-0000-0000-0000-00000000000d');
select throws_ok(
  $$ select public.set_rsvp((select v from ids where k = 'camp'), 'going') $$,
  'this event is full',
  'capacity is enforced');
select is(public.set_rsvp((select v from ids where k = 'camp'), 'maybe'),
  'maybe', 'maybe does not take a place');
select is((select count(*) from public.event_rsvps), 1::bigint,
  'a member reads only their own answer');
select is((select going from public.event_detail((select v from ids where k = 'camp'))), 1,
  'but sees how many are going');
select is((select maybe from public.event_detail((select v from ids where k = 'camp'))), 1,
  'and how many might');
select is((select count(*) from public.event_attendees((select v from ids where k = 'camp'))), 0::bigint,
  'and never who (stewards only)');
select pg_temp.reset_role();

select pg_temp.impersonate('cd000000-0000-0000-0000-000000000005');
select is((select count(*) from public.event_attendees((select v from ids where k = 'camp'))), 2::bigint,
  'the steward sees who answered');
select is((select note from public.event_attendees((select v from ids where k = 'camp')) where name = 'B'),
  'vegetarian', 'with their note');
select pg_temp.reset_role();

select pg_temp.impersonate('cd000000-0000-0000-0000-00000000000b');
select is(public.set_rsvp((select v from ids where k = 'camp'), null), null,
  'null clears the answer');
select pg_temp.reset_role();

update public.events set rsvp_closes_at = now() - interval '1 minute'
 where id = (select v from ids where k = 'camp');
select pg_temp.impersonate('cd000000-0000-0000-0000-00000000000b');
select throws_ok(
  $$ select public.set_rsvp((select v from ids where k = 'camp'), 'going') $$,
  'replies have closed',
  'after the deadline nobody can answer');
select pg_temp.reset_role();
update public.events set rsvp_closes_at = null
 where id = (select v from ids where k = 'camp');

-- ---- cancelling ------------------------------------------------------------
select pg_temp.impersonate('cd000000-0000-0000-0000-000000000005');
-- 0047 (D87) lets a camp be deleted in any state; pgTAP 028 pins it, and
-- that a weekly session is cancelled rather than deleted.
select lives_ok(
  $$ select public.set_event_cancelled((select v from ids where k = 'camp'), true) $$,
  'cancelling works');
select pg_temp.reset_role();

select pg_temp.impersonate('cd000000-0000-0000-0000-00000000000d');
select is((select status from public.my_upcoming_events()), 'cancelled',
  'members still see it, marked cancelled');
select throws_ok(
  $$ select public.set_rsvp((select v from ids where k = 'camp'), 'going') $$,
  'this event is not taking replies',
  'and cannot answer it');
select pg_temp.reset_role();

-- ---- a weekly halaqah in South East ----------------------------------------
select pg_temp.impersonate('cd000000-0000-0000-0000-000000000005');
insert into ids values ('series', public.save_series(null, 'cd000000-0000-0000-0000-000000000103',
  'Thursday halaqah', '', 'Masjid', 4::smallint, '19:00'::time, 90, 'Australia/Melbourne', true));
select ok(
  (select count(*) from public.events where series_id = (select v from ids where k = 'series')) between 5 and 6,
  'saving a series lays out the coming weeks');
select is(
  (select count(distinct extract(dow from starts_at at time zone 'Australia/Melbourne'))::integer
     from public.events where series_id = (select v from ids where k = 'series')),
  1, 'all on the same weekday');
select is(
  (select min(to_char(starts_at at time zone 'Australia/Melbourne', 'HH24:MI'))
     from public.events where series_id = (select v from ids where k = 'series')),
  '19:00', 'at 7pm Melbourne time');
insert into ids values ('week1', (select id from public.events
  where series_id = (select v from ids where k = 'series') order by starts_at limit 1));
insert into ids values ('week2', (select id from public.events
  where series_id = (select v from ids where k = 'series') order by starts_at offset 1 limit 1));
select throws_ok(
  $$ select private.materialise_series((select v from ids where k = 'series')) $$,
  '42501', null,
  'a client cannot run the generator itself');
select pg_temp.reset_role();
select lives_ok(
  $$ select private.materialise_series((select v from ids where k = 'series')) $$,
  'laying out again (the daily job) is harmless');

select ok(
  (select count(*) from public.events where series_id = (select v from ids where k = 'series')) between 5 and 6,
  'and adds no duplicates');

select pg_temp.impersonate('cd000000-0000-0000-0000-00000000000d');
select is(
  (select count(*) from public.my_upcoming_events() where kind = 'halaqah'), 0::bigint,
  'a north member does not see a south-east halaqah');
select pg_temp.reset_role();

-- ---- hosts and polls -------------------------------------------------------
select pg_temp.impersonate('cd000000-0000-0000-0000-000000000005');
select is((select name from public.appoint_series_host((select v from ids where k = 'series'), 'h@ev.test')),
  'H', 'the steward appoints a host');
select pg_temp.reset_role();

select pg_temp.impersonate('cd000000-0000-0000-0000-00000000000b');
select throws_ok(
  $$ select public.create_poll((select v from ids where k = 'week1'), 'food', 'Dinner?', array['Pizza', 'Kebab']) $$,
  'only the event''s stewards or hosts can run a poll',
  'a member cannot run a poll');
select pg_temp.reset_role();

select pg_temp.impersonate('cd000000-0000-0000-0000-000000000006');
select is((select count(*) from public.event_detail((select v from ids where k = 'week1'))), 1::bigint,
  'the host sees their halaqah though they are in no circle');
select ok((select count(*) from public.my_upcoming_events()) >= 5,
  'and finds its sessions in their events list');
select throws_ok(
  $$ select public.create_poll((select v from ids where k = 'week1'), 'food', 'Dinner?', array['Pizza', ' ']) $$,
  'a poll has 2 to 8 options',
  'blank options do not count');
insert into ids values ('poll', public.create_poll((select v from ids where k = 'week1'),
  'food', 'Dinner?', array['Pizza', 'Kebab', 'Curry']));
select is((select count(*) from public.event_attendees((select v from ids where k = 'week1'))), 0::bigint,
  'a host does not get RSVP names');
select pg_temp.reset_role();

select pg_temp.impersonate('cd000000-0000-0000-0000-00000000000b');
select lives_ok(
  $$ select public.vote_poll((select v from ids where k = 'poll'),
       (select option_id from public.event_polls((select v from ids where k = 'week1')) where label = 'Pizza')) $$,
  'a member votes');
select lives_ok(
  $$ select public.vote_poll((select v from ids where k = 'poll'),
       (select option_id from public.event_polls((select v from ids where k = 'week1')) where label = 'Curry')) $$,
  'and changes their mind');
select is(
  (select string_agg(label || '=' || votes || case when mine then '*' else '' end, ',' order by sort_order)
     from public.event_polls((select v from ids where k = 'week1'))),
  'Pizza=0,Kebab=0,Curry=1*',
  'one vote each, moved, and marked as theirs');
select is((select my_open_votes from public.my_upcoming_events() where id = (select v from ids where k = 'week1')), 1,
  'the upcoming list knows they have voted');
select throws_ok(
  $$ select * from public.poll_votes $$,
  '42501', null,
  'nobody can read who voted for what');
select throws_ok(
  $$ select public.vote_poll((select v from ids where k = 'poll'),
       (select id from public.events limit 1)) $$,
  'that is not an option in this poll',
  'a stray id is refused');
select pg_temp.reset_role();

select pg_temp.impersonate('cd000000-0000-0000-0000-00000000000d');
select throws_ok(
  $$ select public.vote_poll((select v from ids where k = 'poll'), null) $$,
  'poll not found',
  'a member outside the branch cannot vote');
select pg_temp.reset_role();

-- ---- anonymous questions ---------------------------------------------------
select pg_temp.impersonate('cd000000-0000-0000-0000-00000000000b');
insert into ids values ('q1', public.ask_question((select v from ids where k = 'week1'), 'What is ihsan?'));
select lives_ok($$ select public.ask_question((select v from ids where k = 'week1'), 'Two') $$, 'second');
select lives_ok($$ select public.ask_question((select v from ids where k = 'week1'), 'Three') $$, 'third');
select lives_ok($$ select public.ask_question((select v from ids where k = 'week1'), 'Four') $$, 'fourth');
select lives_ok($$ select public.ask_question((select v from ids where k = 'week1'), 'Five') $$, 'fifth');
select throws_ok(
  $$ select public.ask_question((select v from ids where k = 'week1'), 'Six') $$,
  'you have asked 5 questions for this event already',
  'five each per event');
select is((select count(*) from public.event_question_list((select v from ids where k = 'week1')) where mine), 5::bigint,
  'the asker can find their own');
select throws_ok(
  $$ select * from public.event_questions $$,
  '42501', null,
  'nobody can read the table, so nobody can read asker_id');
select pg_temp.reset_role();

select pg_temp.impersonate('cd000000-0000-0000-0000-00000000000a');
select is((select count(*) from public.event_question_list((select v from ids where k = 'week1')) where mine), 0::bigint,
  'another member sees the questions as not theirs');
select lives_ok(
  $$ select public.upvote_question((select v from ids where k = 'q1'), true) $$,
  'and upvotes one');
select is((select body from public.event_question_list((select v from ids where k = 'week1')) limit 1),
  'What is ihsan?', 'the upvoted question rises to the top');
select throws_ok(
  $$ select public.delete_my_question((select v from ids where k = 'q1')) $$,
  'question not found',
  'nobody deletes a question that is not theirs');
select pg_temp.reset_role();

select pg_temp.impersonate('cd000000-0000-0000-0000-000000000006');
select lives_ok(
  $$ select public.set_question_state((select id from public.event_question_list((select v from ids where k = 'week1')) where body = 'Two'), false, true) $$,
  'the host hides one');
select lives_ok(
  $$ select public.set_question_state((select v from ids where k = 'q1'), true, false) $$,
  'and marks one answered');
select is((select count(*) from public.event_question_list((select v from ids where k = 'week1'))), 5::bigint,
  'the host still sees the hidden one');
select pg_temp.reset_role();

select pg_temp.impersonate('cd000000-0000-0000-0000-00000000000a');
select is((select count(*) from public.event_question_list((select v from ids where k = 'week1'))), 4::bigint,
  'members do not');
select is((select body from public.event_question_list((select v from ids where k = 'week1')) order by answered desc limit 1),
  'What is ihsan?', 'the answered one is marked');
select throws_ok(
  $$ select public.set_question_state((select v from ids where k = 'q1'), false, true) $$,
  'question not found',
  'a member cannot hide a question');
select pg_temp.reset_role();

-- ---- editing a series ------------------------------------------------------
-- Week 1 has a poll and questions; week 2 has an RSVP; the rest are untouched.
select pg_temp.impersonate('cd000000-0000-0000-0000-00000000000b');
select is(public.set_rsvp((select v from ids where k = 'week2'), 'going'), 'going',
  'a member says they are coming to week 2');
select pg_temp.reset_role();

select pg_temp.impersonate('cd000000-0000-0000-0000-000000000005');
select lives_ok(
  $$ select public.save_series((select v from ids where k = 'series'), 'cd000000-0000-0000-0000-000000000103',
       'Thursday halaqah', '', 'New masjid', 4::smallint, '20:00'::time, 90, 'Australia/Melbourne', true) $$,
  'the steward moves it to 8pm');
select pg_temp.reset_role();

select ok(exists (select 1 from public.events where id = (select v from ids where k = 'week1')),
  'the week with a poll keeps its slot');
select ok(exists (select 1 from public.events where id = (select v from ids where k = 'week2')),
  'the week with an RSVP keeps its slot');
select is(
  (select count(*) from public.events
    where series_id = (select v from ids where k = 'series')
      and to_char(starts_at at time zone 'Australia/Melbourne', 'HH24:MI') = '20:00'),
  (select count(*) from public.events
    where series_id = (select v from ids where k = 'series')) - 2,
  'every untouched week moves to 8pm');
select is(
  (select count(distinct venue) from public.events where series_id = (select v from ids where k = 'series')),
  1::bigint, 'and the new venue reaches every week to come');

select pg_temp.impersonate('cd000000-0000-0000-0000-000000000005');
select lives_ok(
  $$ select public.save_series((select v from ids where k = 'series'), 'cd000000-0000-0000-0000-000000000103',
       'Thursday halaqah', '', 'New masjid', 4::smallint, '20:00'::time, 90, 'Australia/Melbourne', false) $$,
  'switching the series off');
select pg_temp.reset_role();
select is(
  (select count(*) from public.events
    where series_id = (select v from ids where k = 'series') and status <> 'cancelled'),
  0::bigint, 'cancels every week still to come');

-- ---- the leader's list, and the branch guard -------------------------------
select pg_temp.impersonate('cd000000-0000-0000-0000-000000000005');
select ok((select count(*) from public.events_i_lead()) >= 3,
  'the steward lists what they run');
select lives_ok(
  $$ select public.save_camp(null, (select public.create_branch('cd000000-0000-0000-0000-000000000102', 'Lonely')),
       'Draft camp', '', '', now() + interval '3 days', now() + interval '4 days',
       'Australia/Melbourne', null, null, 'draft') $$,
  'a draft camp in an otherwise empty branch');
select throws_ok(
  $$ select public.delete_branch((select id from public.branches where name = 'Lonely')) $$,
  'this branch still has events',
  'a branch with events cannot be deleted');
select pg_temp.reset_role();

select pg_temp.impersonate('cd000000-0000-0000-0000-00000000000b');
select is((select count(*) from public.events_i_lead()), 0::bigint,
  'a member leads nothing');
select pg_temp.reset_role();

-- ---- grants ----------------------------------------------------------------
select ok(not has_table_privilege('authenticated', 'public.events', 'insert'),
  'the client cannot write events directly');
select ok(not has_table_privilege('authenticated', 'public.event_rsvps', 'insert'),
  'nor RSVPs');
select ok(not has_table_privilege('authenticated', 'public.event_questions', 'select'),
  'nor read questions');
select ok(not has_function_privilege('anon', 'public.my_upcoming_events(integer)', 'execute'),
  'anon cannot list events');

select * from finish();
rollback;
