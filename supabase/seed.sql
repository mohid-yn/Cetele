-- ============================================================================
-- Local / dev seed — runs automatically on `supabase db reset` (and local start).
-- NEVER runs against production (prod is never reset). Purely to (a) stop
-- `db reset` erroring on the missing file config.toml points at, and (b) give a
-- fresh local/CI/preview DB some data to render.
--
-- Runs as the `postgres` superuser, so it bypasses RLS and the column locks.
-- Grows as tables land: identity + one group + tasks + an open invite (M2);
-- logs seed arrives with M3. Idempotent (`on conflict … do nothing`) so a
-- re-run is safe.
-- ============================================================================

-- Auth users. The `on_auth_user_created` trigger auto-creates the matching
-- `public.profiles` row from `raw_user_meta_data.name`.
--
-- THESE ACCOUNTS COULD NOT BE SIGNED INTO until the three columns below were
-- filled in, which made the seed's own data unreachable through the app — most
-- of what a seed is for. Asking for a magic link came back "500: Database error
-- saving new user (duplicate key users_email_partial_key)", and each column is
-- one step of that:
--
--   instance_id        GoTrue looks users up by the zero uuid, never by NULL, so
--                      a NULL here means it does not find the row, takes the
--                      SIGN-UP path, and collides with the email index it could
--                      not see. This is the one that produced the 500.
--   email_confirmed_at without it the address is not usable for sign-in.
--   auth.identities    GoTrue resolves an address through the identity table,
--                      not through `auth.users.email` — see below.
insert into auth.users (id, instance_id, email, email_confirmed_at, raw_user_meta_data, aud, role)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'ahmad@example.com', now(), '{"name":"Ahmad"}'::jsonb, 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000000', 'yusuf@example.com', now(), '{"name":"Yusuf"}'::jsonb, 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-000000000000', 'zayd@example.com',  now(), '{"name":"Zayd"}'::jsonb,  'authenticated', 'authenticated')
on conflict (id) do nothing;

-- GoTrue scans these columns into Go types that cannot take a NULL — strings for
-- the tokens, `time.Time` for the timestamps — and the schema defaults them all
-- to NULL, so a hand-written row has to fill them in. Each one surfaces as a 500
-- naming only the column it tripped on ("converting NULL to string is
-- unsupported"), one at a time, which is why they are listed exhaustively here
-- rather than discovered again by whoever adds the next seeded account.
update auth.users
   set created_at                 = coalesce(created_at, now()),
       updated_at                 = coalesce(updated_at, now()),
       confirmation_token         = coalesce(confirmation_token, ''),
       recovery_token             = coalesce(recovery_token, ''),
       email_change               = coalesce(email_change, ''),
       email_change_token_new     = coalesce(email_change_token_new, ''),
       email_change_token_current = coalesce(email_change_token_current, ''),
       phone_change               = coalesce(phone_change, ''),
       phone_change_token         = coalesce(phone_change_token, ''),
       reauthentication_token     = coalesce(reauthentication_token, '')
 where id in (
   '00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000a2',
   '00000000-0000-0000-0000-0000000000a3'
 );

-- The email identity behind each of them. GoTrue resolves an address through
-- `auth.identities`, not through `auth.users.email`, so a seeded user with no
-- identity row is one it cannot find by the only thing anybody types.
insert into auth.identities (provider_id, user_id, provider, identity_data,
                             last_sign_in_at, created_at, updated_at)
select u.id::text, u.id, 'email',
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       now(), now(), now()
from auth.users u
where u.id in (
  '00000000-0000-0000-0000-0000000000a1',
  '00000000-0000-0000-0000-0000000000a2',
  '00000000-0000-0000-0000-0000000000a3'
)
on conflict (provider, provider_id) do nothing;

-- One group owned by Ahmad (a1), with Zayd as co-admin and Yusuf as member.
-- Inserted directly (not via create_group) because the seed has no auth session.
insert into public.groups (id, name, created_by)
values ('00000000-0000-0000-0000-0000000000b1', 'Fajr Circle', '00000000-0000-0000-0000-0000000000a1')
on conflict (id) do nothing;

-- Backdated joins (created_at, M6) so the members have an enrolled span for the
-- steadfastness rollup — a brand-new "joined today" member has no completed days.
insert into public.memberships (user_id, group_id, role, created_at)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'owner',  current_date - 40),
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000b1', 'admin',  current_date - 40),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000b1', 'member', current_date - 40)
on conflict (user_id, group_id) do nothing;

-- The group's task list (M2). Targets small so local testing closes rings fast.
insert into public.tasks (id, group_id, label, subtitle, target_count, sort_order)
values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1', 'Salawat',     'Allahumma salli ala Muhammad', 100, 0),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000b1', 'Istighfar',   'Astaghfirullah',               100, 1),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000b1', 'Subhanallah', null,                            33, 2)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- A SECOND circle, so the cross-circle half of the app renders at all (D64).
-- ---------------------------------------------------------------------------
-- Until now the seed had one circle, which meant a linked task — the member's
-- claim that two circles are asking for ONE act — had nothing to be a link
-- between, and neither did the circle switcher. Yusuf is in both: on /profile he
-- is offered the pair below, and once he takes it a single tap lands in both.
--
-- The count in the Asr label is deliberate. The two circles ask for different
-- amounts of the same dhikr, which is exactly the case D64 exists for (the raw
-- count travels, the completion does not) and the case the name matcher has to
-- see past to notice these are the same thing at all.
insert into public.groups (id, name, created_by)
values ('00000000-0000-0000-0000-0000000000b2', 'Asr Circle', '00000000-0000-0000-0000-0000000000a2')
on conflict (id) do nothing;

insert into public.memberships (user_id, group_id, role, created_at)
values
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000b2', 'owner',  current_date - 40),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b2', 'member', current_date - 40)
on conflict (user_id, group_id) do nothing;

insert into public.tasks (id, group_id, label, subtitle, target_count, sort_order)
values
  ('00000000-0000-0000-0000-0000000000c4', '00000000-0000-0000-0000-0000000000b2', 'Salawat ×300', 'Allahumma salli ala Muhammad', 300, 0)
on conflict (id) do nothing;

-- A standing OPEN invite (reusable member link, D35) with a fixed code so
-- local dev / e2e can hit /join/FAJRSEED deterministically.
insert into public.invites (id, group_id, email, role, code)
values ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000b1', null, 'member', 'FAJRSEED')
on conflict (id) do nothing;

-- A little core-loop history (M3): Ahmad closed everything yesterday and is
-- part-way through Salawat today; Yusuf got half of one ring in yesterday.
-- (Dates are relative so the seed never goes stale.)
insert into public.logs (user_id, task_id, date, count)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c1', current_date - 1, 100),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c2', current_date - 1, 100),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c3', current_date - 1,  33),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c1', current_date,      40),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000c1', current_date - 1,  50)
on conflict (user_id, task_id, date) do nothing;

-- Ahmad arrives with a live streak (kept through yesterday).
update public.streaks
set current = 3, longest = 5, last_active = current_date - 1
where user_id = '00000000-0000-0000-0000-0000000000a1';

-- Populate the daily_completion rollup (M6) from the seeded logs so the 30-day
-- band, group-90 North Star, and steadfastness board render on a fresh DB. In
-- production the nightly pg_cron job does this; here we run it once inline.
select private.run_daily_rollup();

-- ============================================================================
-- The local circle FOLLOWS the booklet's programme, and Ahmad is partway in
-- ----------------------------------------------------------------------------
-- The PROGRAMME itself is no longer here. It moved to migration 0029, because
-- this file never runs against production and the administration's real
-- content cannot live somewhere production can't reach (D55). What is left
-- below is the part that genuinely IS a fixture: which local circle follows it,
-- and one member's progress, so a fresh `db reset` renders the states that only
-- appear with real data rather than an untouched programme.
--
-- The Ramadan Programme (example) that used to sit at the bottom of this file
-- is GONE, at the owner's request. It existed so "a circle may follow several"
-- (0028, D58) had something to demonstrate, back when a second programme could
-- only be authored by a migration. An organiser can now create one in the app
-- (0030), so the e2e suite makes its own and this file no longer ships a
-- programme nobody asked for.
-- ============================================================================

insert into public.group_roadmaps (group_id, roadmap_id)
values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000f1')
on conflict do nothing;

-- Ahmad is partway through LEVEL 1, so the screen renders the states that only
-- appear with real progress: a finished item, a part-finished one, a listening
-- budget under way with one compulsory lecture still outstanding.
insert into public.roadmap_progress (user_id, item_id, done)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000001a001', 1),   -- Calling to Good: read
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000001a004', 9),   -- 9 of 15 juz
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000001a005', 1),   -- Tajweed Book 1: done
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000001a008', 14),  -- 14 of 22 surahs
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000001a009', 135), -- compulsory: done
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000001a011', 33),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000001a014', 134)
on conflict (user_id, item_id) do nothing;
