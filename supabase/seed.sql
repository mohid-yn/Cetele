-- ============================================================================
-- Local / dev seed — runs automatically on `supabase db reset` (and local start).
-- NEVER runs against production (prod is never reset). Purely to (a) stop
-- `db reset` erroring on the missing file config.toml points at, and (b) give a
-- fresh local/CI/preview DB some data to render.
--
-- Runs as the `postgres` superuser, so it bypasses RLS and the column locks.
-- Grows as tables land: identity + one group now; tasks/logs seed arrives with
-- M2/M3 (they don't exist yet). Idempotent (`on conflict … do nothing`) so a
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
insert into public.groups (id, name, invite_code, created_by)
values ('00000000-0000-0000-0000-0000000000b1', 'Fajr Circle', 'FAJR2026', '00000000-0000-0000-0000-0000000000a1')
on conflict (id) do nothing;

insert into public.memberships (user_id, group_id, role)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'owner'),
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000b1', 'admin'),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000b1', 'member')
on conflict (user_id, group_id) do nothing;
