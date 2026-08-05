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
insert into auth.users (id, email, raw_user_meta_data, aud, role)
values
  ('00000000-0000-0000-0000-0000000000a1', 'ahmad@example.com', '{"name":"Ahmad"}'::jsonb, 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a2', 'yusuf@example.com', '{"name":"Yusuf"}'::jsonb, 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a3', 'zayd@example.com',  '{"name":"Zayd"}'::jsonb,  'authenticated', 'authenticated')
on conflict (id) do nothing;

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

-- ----------------------------------------------------------------------------
-- A roadmap for the Fajr Circle to follow (0025, D55).
--
-- INVENTED CONTENT, and it lives here for exactly that reason: the real 2026
-- programme is the administration's to supply (STATUS §2, roadmap Q1), and a
-- migration that shipped placeholder titles would put them in production. The
-- seed never runs against prod.
-- ----------------------------------------------------------------------------
insert into public.roadmaps (id, name, starts_on, ends_on, published)
values ('00000000-0000-0000-0000-0000000000f1', '2026 programme',
        date_trunc('year', current_date)::date,
        (date_trunc('year', current_date) + interval '1 year - 1 day')::date,
        true)
on conflict (id) do nothing;

insert into public.roadmap_items (id, roadmap_id, kind, title, source, url, unit, target, sort_order)
values
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000f1', 'watch',  'Seerah series',           'Weekly lectures · 24 parts', 'https://example.org/seerah', 'videos',   24, 1),
  ('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000f1', 'watch',  'Fiqh of purification',    'Short course · 8 parts',     'https://example.org/fiqh',   'videos',    8, 2),
  ('00000000-0000-0000-0000-0000000000f4', '00000000-0000-0000-0000-0000000000f1', 'read',   'Purification of the Heart', 'Hamza Yusuf',              null,                          'chapters', 12, 3),
  ('00000000-0000-0000-0000-0000000000f5', '00000000-0000-0000-0000-0000000000f1', 'read',   'Nur al-Idah',             'Set text for the year',      null,                          'chapters',  9, 4),
  ('00000000-0000-0000-0000-0000000000f6', '00000000-0000-0000-0000-0000000000f1', 'custom', 'Winter retreat',          'Three days, attendance taken', null,                        'sessions',  1, 5),
  ('00000000-0000-0000-0000-0000000000f7', '00000000-0000-0000-0000-0000000000f1', 'custom', 'Teach one session',       'Any circle, any topic',      null,                          'sessions',  1, 6)
on conflict (id) do nothing;

insert into public.roadmap_rewards (id, roadmap_id, threshold, label, description)
values
  ('00000000-0000-0000-0000-0000000000f8', '00000000-0000-0000-0000-0000000000f1', 2, 'Circle kitab set',   'Collected at the halaqah'),
  ('00000000-0000-0000-0000-0000000000f9', '00000000-0000-0000-0000-0000000000f1', 4, 'Retreat place held', 'Winter retreat, travel covered'),
  ('00000000-0000-0000-0000-0000000000fa', '00000000-0000-0000-0000-0000000000f1', 6, 'Ijazah sitting',     'Invitation to the closing sitting')
on conflict (id) do nothing;

update public.groups set roadmap_id = '00000000-0000-0000-0000-0000000000f1'
where id = '00000000-0000-0000-0000-0000000000b1';

-- Ahmad is partway through, so the ladder renders with a rung already unlocked
-- and one marked "next" — the states that only appear with real progress.
insert into public.roadmap_progress (user_id, item_id, done)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000f2', 17),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000f3', 8),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000f4', 4),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000f7', 1)
on conflict (user_id, item_id) do nothing;
