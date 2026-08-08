-- Local dev fixture. RE-RUN AFTER EVERY `supabase db reset`:
--
--   docker exec -i supabase_db_Cetele psql -U postgres -q < scripts/dev-fixture.sql
--
-- Never runs anywhere but a local stack — it writes `auth.users` directly and
-- names fixed seed UUIDs that exist nowhere else.
--
-- RUN IT WITH `-v ON_ERROR_STOP=1`. Without it psql carries on past a failed
-- statement, and this file has already failed that way once: migration 0028
-- dropped `groups.roadmap_id`, every statement after the first `insert into
-- groups` was skipped, and the fixture reported success while producing a
-- circle with no members. A fixture that lies is worse than one that breaks.
--
-- PART 1 is the fix for the seed defect STATUS.md records: seed.sql inserts
-- auth.users with only id/email/meta/aud/role, leaving instance_id, the
-- timestamps and six token columns NULL. GoTrue looks users up by instance_id
-- (so it never finds Ahmad, tries to re-insert him, and 500s on a duplicate
-- email) and then fails scanning NULLs into non-nullable Go types. Without
-- this you cannot sign in as a seeded user at all.
--
-- PART 2 is demo state for looking at the roadmap: a second circle on the same
-- programme, and two people partway up it.

-- 1. Make the seeded users signable-in ---------------------------------------

update auth.users
set instance_id                = coalesce(instance_id, '00000000-0000-0000-0000-000000000000'),
    created_at                 = coalesce(created_at, now()),
    updated_at                 = coalesce(updated_at, now()),
    email_confirmed_at         = coalesce(email_confirmed_at, now()),
    confirmation_token         = coalesce(confirmation_token, ''),
    recovery_token             = coalesce(recovery_token, ''),
    email_change_token_new     = coalesce(email_change_token_new, ''),
    email_change_token_current = coalesce(email_change_token_current, ''),
    email_change               = coalesce(email_change, ''),
    phone_change               = coalesce(phone_change, ''),
    phone_change_token         = coalesce(phone_change_token, ''),
    reauthentication_token     = coalesce(reauthentication_token, ''),
    encrypted_password         = coalesce(encrypted_password, ''),
    is_sso_user                = coalesce(is_sso_user, false),
    is_anonymous               = coalesce(is_anonymous, false),
    raw_app_meta_data          = coalesce(raw_app_meta_data, '{"provider":"email","providers":["email"]}'::jsonb)
where instance_id is null or created_at is null;

insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at, last_sign_in_at)
select gen_random_uuid(), u.id, u.id::text, 'email',
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       now(), now(), now()
from auth.users u
where u.email like '%@example.com'
  and not exists (
    select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email'
  );

-- 2. Demo state ---------------------------------------------------------------

-- A second circle on the SAME programme, which Ahmad is in no way part of —
-- this is what makes the super-admin reader visibly different from a circle
-- owner's. Bilal owns it.
insert into auth.users (id, instance_id, email, raw_user_meta_data, aud, role,
  created_at, updated_at, email_confirmed_at, confirmation_token, recovery_token,
  email_change_token_new, email_change_token_current, email_change, phone_change,
  phone_change_token, reauthentication_token, encrypted_password, is_sso_user,
  is_anonymous, raw_app_meta_data)
values ('00000000-0000-0000-0000-0000000000a4','00000000-0000-0000-0000-000000000000',
  'bilal@example.com','{"name":"Bilal"}'::jsonb,'authenticated','authenticated',
  now(),now(),now(),'','','','','','','','','',false,false,
  '{"provider":"email","providers":["email"]}'::jsonb)
on conflict (id) do nothing;

insert into public.groups (id, name, created_by)
values ('00000000-0000-0000-0000-0000000000b2','Asr Circle',
        '00000000-0000-0000-0000-0000000000a4')
on conflict (id) do nothing;

-- Following is a ROW since 0028, not a column on `groups`.
insert into public.group_roadmaps (group_id, roadmap_id)
values ('00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-0000000000f1')
on conflict do nothing;

insert into public.memberships (user_id, group_id, role, created_at) values
  ('00000000-0000-0000-0000-0000000000a4','00000000-0000-0000-0000-0000000000b2','owner',  current_date - 10),
  -- Yusuf in TWO circles, so Today's group switcher has something to switch to
  -- (it hides itself for a single-circle member, by design).
  ('00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000b2','member', current_date - 5)
on conflict (user_id, group_id) do nothing;

-- Yusuf has finished level 1, Zayd levels 1 and 2 — so the cohort strip has a
-- shape to show rather than one flat "nobody has started" band.
insert into public.roadmap_progress (user_id, item_id, done)
select '00000000-0000-0000-0000-0000000000a2', i.id, i.target
from public.roadmap_items i
where i.level = 1
  -- SCOPED to the Islamic Development Program. Without this it matched level 1
  -- of EVERY roadmap, so the Ramadan fixture came out 100% complete for someone
  -- who had never touched it — which looked exactly like a completion bug.
  and i.roadmap_id = '00000000-0000-0000-0000-0000000000f1'
on conflict (user_id, item_id) do update set done = excluded.done;

insert into public.roadmap_progress (user_id, item_id, done)
select '00000000-0000-0000-0000-0000000000a3', i.id, i.target
from public.roadmap_items i
where i.level in (1, 2)
  and i.roadmap_id = '00000000-0000-0000-0000-0000000000f1'
on conflict (user_id, item_id) do update set done = excluded.done;

-- 3. An organiser ------------------------------------------------------------
-- In NO circle, which is the whole point of the role. This is the account to
-- sign in as to see what the fixes actually changed.
insert into auth.users (id, instance_id, email, raw_user_meta_data, aud, role,
  created_at, updated_at, email_confirmed_at, confirmation_token, recovery_token,
  email_change_token_new, email_change_token_current, email_change, phone_change,
  phone_change_token, reauthentication_token, encrypted_password, is_sso_user,
  is_anonymous, raw_app_meta_data)
values ('00000000-0000-0000-0000-0000000000a9','00000000-0000-0000-0000-000000000000',
  'organiser@example.com','{"name":"Organiser"}'::jsonb,'authenticated','authenticated',
  now(),now(),now(),'','','','','','','','','',false,false,
  '{"provider":"email","providers":["email"]}'::jsonb)
on conflict (id) do nothing;

insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at, last_sign_in_at)
select gen_random_uuid(), '00000000-0000-0000-0000-0000000000a9',
       '00000000-0000-0000-0000-0000000000a9', 'email',
       jsonb_build_object('sub','00000000-0000-0000-0000-0000000000a9','email','organiser@example.com','email_verified',true),
       now(), now(), now()
where not exists (
  select 1 from auth.identities where user_id = '00000000-0000-0000-0000-0000000000a9'
);

insert into public.profiles (id, name) values ('00000000-0000-0000-0000-0000000000a9','Organiser')
on conflict (id) do update set name = excluded.name;

update public.profiles set is_super_admin = true
where id = '00000000-0000-0000-0000-0000000000a9';

-- Ahmad is an organiser AS WELL AS a circle owner — the account that can reach
-- every surface at once, which is what makes it the useful one to demo with.
update public.profiles set is_super_admin = true
where id = '00000000-0000-0000-0000-0000000000a1';

select p.name, p.is_super_admin,
       private.levels_complete(p.id, '00000000-0000-0000-0000-0000000000f1') as levels
from public.profiles p order by p.name;
