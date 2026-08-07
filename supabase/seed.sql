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


-- ============================================================================
-- The Islamic Development Program, for the Fajr Circle to follow (0025, D55)
-- ----------------------------------------------------------------------------
-- REAL content, transcribed from the administration's booklet — the levels,
-- books, khatms, surah ranges, tajweed texts, lecture titles and minute
-- budgets are all as published. It lives in the SEED rather than in a content
-- migration because two things are still open:
--
--   * the booklet's lecture URLs are placeholders (`youtube.com/playlist1`),
--     so every `url` here is NULL — an item with no link renders as no link,
--     which is honest, where a fabricated link is not;
--   * the rewards are not settled (the owner's working figure is a $1,000
--     contribution per level toward an international trip).
--
-- When both are closed this moves to a content migration, unchanged in shape.
-- The seed never runs against production.
--
-- Level structure, and why it is sequential rather than nested: the
-- memorisation blocks are 93–114, then 86–92, then 78–85 — contiguous,
-- non-overlapping, and running backwards through the mushaf, together making
-- up exactly Juz 'Amma. Level 2 continues where level 1 stopped; it does not
-- contain it.
-- ============================================================================

insert into public.roadmaps (id, name, starts_on, ends_on, published)
values ('00000000-0000-0000-0000-0000000000f1', 'Islamic Development Program',
        date_trunc('year', current_date)::date,
        (date_trunc('year', current_date) + interval '1 year - 1 day')::date,
        true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Level 1
-- ---------------------------------------------------------------------------
insert into public.roadmap_items
  (id, roadmap_id, level, category, title, source, url, unit, target, compulsory, sort_order)
values
  ('00000000-0000-0000-0000-00000001a001', '00000000-0000-0000-0000-0000000000f1', 1, 'book', 'Calling to Good', 'M. Fethullah Gülen', null, 'book', 1, false, 1),
  ('00000000-0000-0000-0000-00000001a002', '00000000-0000-0000-0000-0000000000f1', 1, 'book', 'Belief and Unbelief', 'Bediüzzaman Said Nursi', null, 'book', 1, false, 2),
  ('00000000-0000-0000-0000-00000001a003', '00000000-0000-0000-0000-0000000000f1', 1, 'book', 'The Essential Hanafi Hand Book of Fiqh', 'Translation of Qadi Thanaa Ullah''s Ma la budda minhu', null, 'book', 1, false, 3),
  -- Half a khatm, counted in juz so a year-long read shows movement.
  ('00000000-0000-0000-0000-00000001a004', '00000000-0000-0000-0000-0000000000f1', 1, 'quran', '½ Khatm', 'Fifteen juz', null, 'juz', 15, false, 1),
  ('00000000-0000-0000-0000-00000001a005', '00000000-0000-0000-0000-0000000000f1', 1, 'quran_studies', 'Tajweed Book 1', null, null, 'book', 1, false, 1),
  ('00000000-0000-0000-0000-00000001a006', '00000000-0000-0000-0000-0000000000f1', 1, 'quran_studies', 'Tajweed Book 2', null, null, 'book', 1, false, 2),
  ('00000000-0000-0000-0000-00000001a007', '00000000-0000-0000-0000-0000000000f1', 1, 'quran_studies', 'Qur''an fluency', 'Approximately 5 minutes', null, 'assessment', 1, false, 3),
  ('00000000-0000-0000-0000-00000001a008', '00000000-0000-0000-0000-0000000000f1', 1, 'memorisation', 'Surahs Ad-Duha to An-Nas', 'Chapters 93–114', null, 'surahs', 22, false, 1),
  -- Listening is a BUDGET (see roadmap_level_requirements): 600 minutes from
  -- this menu, with the two compulsory lectures included whatever the total.
  ('00000000-0000-0000-0000-00000001a009', '00000000-0000-0000-0000-0000000000f1', 1, 'listening', 'The Believers Heart Realm', null, null, 'minutes', 135, true, 1),
  ('00000000-0000-0000-0000-00000001a010', '00000000-0000-0000-0000-0000000000f1', 1, 'listening', 'Angels in Your Presence 1', null, null, 'minutes', 150, true, 2),
  ('00000000-0000-0000-0000-00000001a011', '00000000-0000-0000-0000-0000000000f1', 1, 'listening', 'Guarding the Tongue', null, null, 'minutes', 33, false, 3),
  ('00000000-0000-0000-0000-00000001a012', '00000000-0000-0000-0000-0000000000f1', 1, 'listening', 'The Qur''an: A Clear Guidance for the People of Taqwa', null, null, 'minutes', 26, false, 4),
  ('00000000-0000-0000-0000-00000001a013', '00000000-0000-0000-0000-0000000000f1', 1, 'listening', 'In the Wake of Calamity', null, null, 'minutes', 30, false, 5),
  ('00000000-0000-0000-0000-00000001a014', '00000000-0000-0000-0000-0000000000f1', 1, 'listening', 'The Way of Ascension''s Light: Prayer', null, null, 'minutes', 134, false, 6),
  ('00000000-0000-0000-0000-00000001a015', '00000000-0000-0000-0000-0000000000f1', 1, 'listening', 'Nusaybah bint Ka''ab (ra): The Woman Warrior', null, null, 'minutes', 63, false, 7),
  ('00000000-0000-0000-0000-00000001a016', '00000000-0000-0000-0000-0000000000f1', 1, 'listening', 'Ubadah ibn al-Samit (ra): A Man Equal to a Thousand Men', null, null, 'minutes', 59, false, 8),
  ('00000000-0000-0000-0000-00000001a017', '00000000-0000-0000-0000-0000000000f1', 1, 'listening', 'Sawda Bint Zama''a (ra): The Prophet''s Joy', null, null, 'minutes', 43, false, 9),
  ('00000000-0000-0000-0000-00000001a018', '00000000-0000-0000-0000-0000000000f1', 1, 'listening', 'Lessons From The Qur''an', null, null, 'minutes', 555, false, 10),

-- ---------------------------------------------------------------------------
-- Level 2
-- ---------------------------------------------------------------------------
  ('00000000-0000-0000-0000-00000002a001', '00000000-0000-0000-0000-0000000000f1', 2, 'book', 'Reflections on the Qur''an', 'M. Fethullah Gülen', null, 'book', 1, false, 1),
  ('00000000-0000-0000-0000-00000002a002', '00000000-0000-0000-0000-0000000000f1', 2, 'book', 'The Staff of Moses', 'Bediüzzaman Said Nursi', null, 'book', 1, false, 2),
  ('00000000-0000-0000-0000-00000002a003', '00000000-0000-0000-0000-0000000000f1', 2, 'book', 'Riyad-us-Saliheen: The Book of Miscellany', 'Imam An-Nawawi', null, 'book', 1, false, 3),
  ('00000000-0000-0000-0000-00000002a004', '00000000-0000-0000-0000-0000000000f1', 2, 'quran', '1 Khatm', 'Thirty juz', null, 'juz', 30, false, 1),
  ('00000000-0000-0000-0000-00000002a005', '00000000-0000-0000-0000-0000000000f1', 2, 'quran_studies', 'Tajweed Book 3 — Theory', null, null, 'book', 1, false, 1),
  ('00000000-0000-0000-0000-00000002a006', '00000000-0000-0000-0000-0000000000f1', 2, 'quran_studies', 'Tajweed Book 3 — Reading', null, null, 'book', 1, false, 2),
  ('00000000-0000-0000-0000-00000002a007', '00000000-0000-0000-0000-0000000000f1', 2, 'quran_studies', 'Qur''an fluency', 'Approximately 4 minutes', null, 'assessment', 1, false, 3),
  ('00000000-0000-0000-0000-00000002a008', '00000000-0000-0000-0000-0000000000f1', 2, 'memorisation', 'Surahs At-Tariq to Al-Layl', 'Chapters 86–92', null, 'surahs', 7, false, 1),
  ('00000000-0000-0000-0000-00000002a009', '00000000-0000-0000-0000-0000000000f1', 2, 'listening', 'Towards the Morality of Qur''an', null, null, 'minutes', 200, true, 1),
  ('00000000-0000-0000-0000-00000002a010', '00000000-0000-0000-0000-0000000000f1', 2, 'listening', 'Sacred Text Messages 1', null, null, 'minutes', 267, true, 2),
  ('00000000-0000-0000-0000-00000002a011', '00000000-0000-0000-0000-0000000000f1', 2, 'listening', 'Angels In Their Presence 2', null, null, 'minutes', 240, false, 3),
  ('00000000-0000-0000-0000-00000002a012', '00000000-0000-0000-0000-0000000000f1', 2, 'listening', 'Question & Answers', null, null, 'minutes', 84, false, 4),
  ('00000000-0000-0000-0000-00000002a013', '00000000-0000-0000-0000-0000000000f1', 2, 'listening', 'Tufayl ibn Amr (ra): The Hidden Legend', null, null, 'minutes', 54, false, 5),
  ('00000000-0000-0000-0000-00000002a014', '00000000-0000-0000-0000-0000000000f1', 2, 'listening', 'Zaynab bint Jahsh (ra): The Longest Arm', null, null, 'minutes', 74, false, 6),

-- ---------------------------------------------------------------------------
-- Level 3
-- ---------------------------------------------------------------------------
  ('00000000-0000-0000-0000-00000003a001', '00000000-0000-0000-0000-0000000000f1', 3, 'book', 'Endeavor for Renewal', 'M. Fethullah Gülen', null, 'book', 1, false, 1),
  ('00000000-0000-0000-0000-00000003a002', '00000000-0000-0000-0000-0000000000f1', 3, 'book', 'The Gleams', 'Bediüzzaman Said Nursi', null, 'book', 1, false, 2),
  ('00000000-0000-0000-0000-00000003a003', '00000000-0000-0000-0000-0000000000f1', 3, 'book', 'Ihya Ulum al-Din: The Forty Principles of the Religion', 'Imam al-Ghazali, adapted summary', null, 'book', 1, false, 3),
  ('00000000-0000-0000-0000-00000003a004', '00000000-0000-0000-0000-0000000000f1', 3, 'book', 'Qualities of a Devoted Soul', 'İbrahim Öztürk', null, 'book', 1, false, 4),
  -- The booklet contradicts itself here: the level-3 overview says "2 Khatm",
  -- the level-3 detail page says "1 Khatm with Interpretation". The detail page
  -- is taken as authoritative and the discrepancy is an open question.
  ('00000000-0000-0000-0000-00000003a005', '00000000-0000-0000-0000-0000000000f1', 3, 'quran', '1 Khatm with interpretation', 'Thirty juz, with tafsir', null, 'juz', 30, false, 1),
  ('00000000-0000-0000-0000-00000003a006', '00000000-0000-0000-0000-0000000000f1', 3, 'quran_studies', 'Tafseer', null, null, 'course', 1, false, 1),
  ('00000000-0000-0000-0000-00000003a007', '00000000-0000-0000-0000-0000000000f1', 3, 'quran_studies', 'Qur''an fluency', 'Approximately 3 minutes', null, 'assessment', 1, false, 2),
  ('00000000-0000-0000-0000-00000003a008', '00000000-0000-0000-0000-0000000000f1', 3, 'memorisation', 'Surahs An-Naba to Al-Buruj', 'Chapters 78–85', null, 'surahs', 8, false, 1),
  ('00000000-0000-0000-0000-00000003a009', '00000000-0000-0000-0000-0000000000f1', 3, 'listening', 'Lights on the Road', null, null, 'minutes', 130, true, 1),
  ('00000000-0000-0000-0000-00000003a010', '00000000-0000-0000-0000-0000000000f1', 3, 'listening', 'Meeting Muhammad ﷺ', null, null, 'minutes', 250, true, 2),
  ('00000000-0000-0000-0000-00000003a011', '00000000-0000-0000-0000-0000000000f1', 3, 'listening', 'Life Beyond Death', null, null, 'minutes', 166, false, 3),
  ('00000000-0000-0000-0000-00000003a012', '00000000-0000-0000-0000-0000000000f1', 3, 'listening', 'Jannah: Home at Last', null, null, 'minutes', 330, false, 4),
  ('00000000-0000-0000-0000-00000003a013', '00000000-0000-0000-0000-0000000000f1', 3, 'listening', 'The Great Imams', null, null, 'minutes', 315, false, 5),
  ('00000000-0000-0000-0000-00000003a014', '00000000-0000-0000-0000-0000000000f1', 3, 'listening', 'Sacred Text Messages 2', null, null, 'minutes', 327, false, 6)
on conflict (id) do nothing;

-- The one budgeted category, per level: "you will need to listen to a total of
-- N minutes". Every other category is finished by finishing its items.
insert into public.roadmap_level_requirements (roadmap_id, level, category, min_total)
values
  ('00000000-0000-0000-0000-0000000000f1', 1, 'listening', 600),
  ('00000000-0000-0000-0000-0000000000f1', 2, 'listening', 900),
  ('00000000-0000-0000-0000-0000000000f1', 3, 'listening', 1200)
on conflict (roadmap_id, level, category) do nothing;

-- PLACEHOLDER rewards — thresholds count completed LEVELS. The owner's working
-- figure is $1,000 per level toward an international trip; the real labels and
-- amounts replace these when they are settled.
insert into public.roadmap_rewards (id, roadmap_id, threshold, label, description)
values
  ('00000000-0000-0000-0000-0000000000f8', '00000000-0000-0000-0000-0000000000f1', 1, 'Level 1 complete', '$1,000 toward the international trip'),
  ('00000000-0000-0000-0000-0000000000f9', '00000000-0000-0000-0000-0000000000f1', 2, 'Level 2 complete', 'A further $1,000 toward the international trip'),
  ('00000000-0000-0000-0000-0000000000fa', '00000000-0000-0000-0000-0000000000f1', 3, 'Level 3 complete', 'The full $3,000 contribution')
on conflict (id) do nothing;

update public.groups set roadmap_id = '00000000-0000-0000-0000-0000000000f1'
where id = '00000000-0000-0000-0000-0000000000b1';

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
