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
  -- SECOND booklet contradiction, and it is resolved the OPPOSITE way to the
  -- level-3 Qur'an one below — which is why both are flagged rather than
  -- quietly settled. The level-2 OVERVIEW (p.07) says "Tajweed Book 3 Reading";
  -- the level-2 DETAIL page (p.09) says "Tajweed Book 3 iRead". "iRead" reads
  -- like a product name and "Reading" like a description of the work, so the
  -- overview is taken — but for the Qur'an the DETAIL page is taken. One of
  -- these two choices is inconsistent with the other and only the owner can say
  -- which. Open question.
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
  -- ÖZÜBÜYÜK, and it took three goes. The author is on the cover artwork and
  -- not in the PDF's text layer: the first pass guessed "Öztürk" from nothing,
  -- the second read "Özbüyük" off a 400dpi upscale of a 190x300 image, and the
  -- embedded image simply does not carry enough pixels to settle it. Confirmed
  -- at 900dpi AND against the publisher's listing (ISBN 9781597842921). The
  -- rule this earned: a real person's name is never inferred. If the source
  -- cannot be read, go and find one that can.
  ('00000000-0000-0000-0000-00000003a004', '00000000-0000-0000-0000-0000000000f1', 3, 'book', 'Qualities of a Devoted Soul', 'İbrahim Özübüyük', null, 'book', 1, false, 4),
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

-- ---------------------------------------------------------------------------
-- Descriptions and pictures (0027, D57)
-- ---------------------------------------------------------------------------
-- The prose is the BOOKLET's own, transcribed from the three Book pages. It is
-- separated from the inserts above so the structural rows stay readable and so
-- this block can be re-run on its own while the copy is still being reviewed.
--
-- Only the ten books have both. The covers are the booklet's own artwork,
-- extracted from the PDF and served from `public/roadmap/` — versioned with the
-- repo, so there is no bucket to provision and no external host to trust. The
-- lectures have no picture: their thumbnails live on YouTube behind URLs that
-- are still placeholders, and a fabricated thumbnail is the same lie as a
-- fabricated link. They render as the category's icon instead.
update public.roadmap_items set description = v.description, image_url = v.image_url
from (values
  ('00000000-0000-0000-0000-00000001a001'::uuid,
   '“Call to good and prevent wrong” — amr bil ma''ruf wa nahy an al munkar. Depending on the translations within the Qur''anic contexts, “calling to good” may be rendered as promoting the right, just, honorable, righteous behavior, and virtue; whereas “preventing wrong” is forbidding what is evil, dishonorable, and vice. The Qur''an urges believers to embrace this duty individually and collectively and praises them when they practice this obligation (Al ‘Imran 3:104, 110)',
   '/roadmap/calling-to-good.png'),

  ('00000000-0000-0000-0000-00000001a002'::uuid,
   'Belief and Unbelief by Bediüzzaman Said Nursi explores the profound implications of faith and doubt in human life. Drawing from Islamic teachings, Nursi presents a compelling argument for the centrality of belief in achieving spiritual fulfillment, moral clarity, and inner peace. The booklet examines the intellectual and emotional struggles of unbelief, providing insights into the transformative power of faith.',
   '/roadmap/belief-and-unbelief.png'),

  ('00000000-0000-0000-0000-00000001a003'::uuid,
   'This book was undertaken specifically with a view toward providing the English-speaking Muslim who possesses a knowledge of at least the fundamentals of Fiqh and Shariat with a reliable and authentic text book of standard Hanafi Fiqh.',
   '/roadmap/essential-hanafi-fiqh.png'),

  ('00000000-0000-0000-0000-00000002a001'::uuid,
   'A profound exploration of the spiritual, moral, and practical wisdom of the Qur''an. Through thematic reflections, Gülen provides insights into key verses, offering readers a deeper understanding of their significance in personal and communal life. The book emphasizes the timeless relevance of the Qur''an''s guidance, encouraging introspection, compassion, and commitment to universal values.',
   '/roadmap/reflections-on-the-quran.png'),

  ('00000000-0000-0000-0000-00000002a002'::uuid,
   'The Staff of Moses is a collection of Nursi''s writings concerning worship, youth, life after death, belief in the Hereafter and their relation with happiness in this world and the next.',
   '/roadmap/staff-of-moses.png'),

  ('00000000-0000-0000-0000-00000002a003'::uuid,
   'Riyad-us-Saliheen is a timeless collection of prophetic traditions compiled by Imam An-Nawawi. This section focuses on the foundational aspects of faith, ethics, and spiritual development, featuring hadiths that highlight themes such as sincerity, patience, gratitude, humility, and the importance of good intentions in daily life.',
   '/roadmap/riyad-us-saliheen.png'),

  ('00000000-0000-0000-0000-00000003a001'::uuid,
   'True renewal is realized by retaining the purity of the seed and the root, and by synthesizing an entire inheritance of values with new thoughts and wisdom appropriate to the age. A thorough revival can only be realized with the efforts of the spirit, intellect, feelings, and willpower working in concert.',
   '/roadmap/endeavor-for-renewal.png'),

  ('00000000-0000-0000-0000-00000003a002'::uuid,
   'The Gleams is a significant work within the Risale-i Nur collection, consisting of epistles that delve into the manifestations of divine attributes and spiritual truths. Using relatable analogies, clear explanations, and thought-provoking narratives, Nursi illustrates how the natural world and human experience reflect the wisdom and beauty of divine creation.',
   '/roadmap/the-gleams.png'),

  ('00000000-0000-0000-0000-00000003a003'::uuid,
   'A comprehensive distillation of Imam al-Ghazali''s magnum opus, Ihya Ulum ad-Din (The Revival of the Religious Sciences), in which he explores the spiritual depth of virtually every aspect of Islam. This condensed work presents profound insights regarding man''s lifelong struggle to draw closer to Allah in a simple framework.',
   '/roadmap/ihya-ulum-al-din.png'),

  ('00000000-0000-0000-0000-00000003a004'::uuid,
   'A believer is a devoted individual who has submitted his soul to its true owner. Faith is the greatest reality in the universe. It is a light that enters the heart through the guidance of God and transforms its fortunate bearer into a person of responsibility. This book is based on various essays and narrative stories that illustrate the profundity of faith.',
   '/roadmap/qualities-of-a-devoted-soul.png')
) as v(id, description, image_url)
where public.roadmap_items.id = v.id;

-- The non-book items get prose too, so no card on the timeline is bare. These
-- are NOT the booklet's words — it gives these only a line each — so they say
-- exactly what the row already asserts and claim nothing further.
update public.roadmap_items set description = v.description
from (values
  ('00000000-0000-0000-0000-00000001a004'::uuid, 'Read half of the Qur''an over the year — fifteen juz, at whatever pace suits you.'),
  ('00000000-0000-0000-0000-00000002a004'::uuid, 'A complete khatm: all thirty juz across the year.'),
  ('00000000-0000-0000-0000-00000003a005'::uuid, 'A complete khatm read WITH its interpretation, so the meaning is taken alongside the recitation.'),
  ('00000000-0000-0000-0000-00000001a008'::uuid, 'Surahs Ad-Duha to An-Nas — chapters 93 to 114, the last twenty-two of the mushaf.'),
  ('00000000-0000-0000-0000-00000002a008'::uuid, 'Surahs At-Tariq to Al-Layl — chapters 86 to 92, continuing backwards from where level 1 stopped.'),
  ('00000000-0000-0000-0000-00000003a008'::uuid, 'Surahs An-Naba to Al-Buruj — chapters 78 to 85, completing Juz ''Amma.')
) as v(id, description)
where public.roadmap_items.id = v.id;
