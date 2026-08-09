-- ============================================================================
-- Migration 0029 — the Islamic Development Program becomes CONTENT, not a seed
-- ----------------------------------------------------------------------------
-- The booklet's programme has lived in `supabase/seed.sql` since it was
-- transcribed, and the seed's own header says why that could not last:
--
--     "NEVER runs against production (prod is never reset)."
--
-- So the administration's real programme existed on every developer's machine
-- and in CI, and nowhere else. `supabase db push` carries migrations; it does
-- not carry the seed. A production deploy of the roadmap feature would have
-- landed the tables, the policies and the screens, and left them EMPTY — the
-- Roadmap tab correctly reporting that there is no programme, because on that
-- database there wasn't one.
--
-- This file is that content, moved across UNCHANGED in shape (D55: content is
-- authored by migration, keyed on stable ids so `roadmap_progress` always has
-- something real to point at). What stays behind in the seed is only what is
-- genuinely a dev fixture: which local circle FOLLOWS the programme, and
-- Ahmad's part-finished progress against it.
--
-- THE DATES ARE PINNED, where the seed derived them from `current_date`. A
-- migration is a historical record: it says what the 2026 programme is, and
-- D55 already settled that a new year opens a NEW roadmap row rather than
-- editing last year's. A relative window would also have meant local and
-- production drifting apart the moment the calendar turned — CI resetting into
-- 2027 while prod still held 2026.
--
-- IDEMPOTENT (`on conflict … do nothing`), so re-running it is safe and so a
-- database that already has this content from the seed is left exactly as it
-- is. That matters for every existing local stack: `db reset` will now apply
-- this file where the seed used to insert the same rows, with the same ids.
--
-- STILL OPEN, and deliberately shipped as it stands (Q1): level 3's Qur'an
-- reading ("2 Khatm" vs "1 Khatm with Interpretation" — the covers settled it
-- as the latter) and the reward FIGURES, whose working value is $1,000 per
-- level toward the international trip. They are the owner's to confirm. They
-- are no longer blocked on an engineer either way: 0030 gives an organiser the
-- controls to correct both in the app.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- REAL content, transcribed from the administration's booklet — the levels,
-- books, khatms, surah ranges, tajweed texts, lecture titles, minute budgets,
-- cover artwork, prose and the twenty-two lecture LINKS are all as published.
--
-- The `url` column is NULL in the inserts below and filled at the bottom of
-- this file, and that split is a correction rather than a style. This seed
-- originally shipped every link NULL, on the reasoning that the booklet's URLs
-- were placeholders — which is what the printed text says
-- ("www.youtube.com/playlist1"). The real links are PDF **annotations**, an
-- object graph no text extraction touches. They exist, all twenty-two, and the
-- owner had to point out they were missing.
--
-- Level structure, and why it is sequential rather than nested: the
-- memorisation blocks are 93–114, then 86–92, then 78–85 — contiguous,
-- non-overlapping, and running backwards through the mushaf, together making
-- up exactly Juz 'Amma. Level 2 continues where level 1 stopped; it does not
-- contain it.
-- ============================================================================

insert into public.roadmaps (id, name, starts_on, ends_on, published)
values ('00000000-0000-0000-0000-0000000000f1', 'Islamic Development Program',
        -- Pinned, not derived from current_date: see the header. This row IS
        -- the 2026 programme; 2027's is a new row, made in the app (0030).
        date '2026-01-01', date '2026-12-31',
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
  ('00000000-0000-0000-0000-00000002a005', '00000000-0000-0000-0000-0000000000f1', 2, 'quran_studies', 'Tajweed Book 3 (Theory)', null, null, 'book', 1, false, 1),
  -- SETTLED BY THE ARTWORK, not by preference. The overview (p.07) says
  -- "Tajweed Book 3 Reading" and the detail page (p.09) says "iRead", and the
  -- seed originally took the overview while taking the DETAIL page for the
  -- level-3 Qur'an — two contradictions resolved in opposite directions, which
  -- is what flagged it. The BOOK COVER on p.09 reads "TAJWEED BOOK 3 (iRead)".
  -- iRead is the title; "Reading" was the overview paraphrasing it.
  ('00000000-0000-0000-0000-00000002a006', '00000000-0000-0000-0000-0000000000f1', 2, 'quran_studies', 'Tajweed Book 3 (iRead)', null, null, 'book', 1, false, 2),
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
-- ---------------------------------------------------------------------------
-- Descriptions and pictures (0027, D57)
-- ---------------------------------------------------------------------------
-- The prose is the BOOKLET's own, transcribed from the three Book pages. It is
-- separated from the inserts above so the structural rows stay readable and so
-- this block can be re-run on its own while the copy is still being reviewed.
--
-- Only the ten books have both. The covers are the booklet's own artwork,
-- extracted from the PDF and served from `public/roadmap/` — versioned with the
-- repo, so there is no bucket to provision and no external host to trust.
--
-- The lectures have no picture, and now that their real links are in (see the
-- bottom of this file) that is a CHOICE rather than a gap: a YouTube thumbnail
-- would have to be fetched from a third party at render time, on a screen every
-- member opens, which is a tracking request the app does not otherwise make.
-- They render as the category's drawn icon instead. An organiser can paste one
-- per item if they want it (D57).
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

-- ---------------------------------------------------------------------------
-- The REAL lecture links (0027)
-- ---------------------------------------------------------------------------
-- These were shipped NULL on the claim that the booklet's URLs were
-- placeholders. That was wrong, and the mistake is worth recording because it
-- will recur: `pdftotext` extracts VISIBLE TEXT, and what is printed under each
-- lecture really is a placeholder ("www.youtube.com/playlist1"). The working
-- links are PDF **link annotations** — a separate object graph the text layer
-- knows nothing about, where the annotation carries a /Rect and points at an
-- action object holding the /URI. Twenty-two of them, and not one appears in
-- any text extraction.
--
-- TWO of the booklet's links are `http://`; they are stored as `https://`, and
-- that is the ONLY edit made to any of them. It preserves the destination
-- exactly (YouTube redirects anyway) and avoids shipping a plaintext link into
-- every member's browser. Everything else — including the `ab_channel`
-- attribution on the Sawda talk — is byte-for-byte what the booklet carries.
--
-- MAPPED BY POSITION, NOT BY ORDER. Each annotation's rectangle was aligned
-- against the word boxes on its page (`pdftotext -bbox`), so every URL below is
-- the one sitting on that lecture's own placeholder line — playlist1 through
-- playlist15 and watch1 through watch8, each landing exactly where it should.
-- Ordering alone would have looked identical and proved nothing.
update public.roadmap_items set url = v.url
from (values
  -- Level 1 (booklet p.06)
  ('00000000-0000-0000-0000-00000001a009'::uuid, 'https://www.youtube.com/playlist?list=PLukPSg97-iL5Smi_OsysIdxo8NvC5Do0q'),  -- The Believers Heart Realm
  ('00000000-0000-0000-0000-00000001a010'::uuid, 'https://www.youtube.com/playlist?list=PLUwKu6hisEQGzTklJ3OLfEFh7Un4VbDsb'),  -- Angels in Your Presence 1
  ('00000000-0000-0000-0000-00000001a011'::uuid, 'https://www.youtube.com/watch?v=SvKJhy-lQRc'),                                -- Guarding the Tongue
  ('00000000-0000-0000-0000-00000001a012'::uuid, 'https://www.youtube.com/watch?v=Ac1NYpU_JFg'),                                -- The Qur'an: A Clear Guidance
  ('00000000-0000-0000-0000-00000001a013'::uuid, 'https://www.youtube.com/watch?v=pFX-G12Mm8c'),                                -- In the Wake of Calamity
  ('00000000-0000-0000-0000-00000001a014'::uuid, 'https://www.youtube.com/playlist?list=PLukPSg97-iL4iptAKEZ7psEoQFj4TBu42'),  -- The Way of Ascension's Light
  ('00000000-0000-0000-0000-00000001a015'::uuid, 'https://www.youtube.com/watch?v=7yrTMiCMIY8'),                                -- Nusaybah bint Ka'ab
  ('00000000-0000-0000-0000-00000001a016'::uuid, 'https://www.youtube.com/watch?v=BQHGk6swoc8'),                                -- Ubadah ibn al-Samit
  ('00000000-0000-0000-0000-00000001a017'::uuid, 'https://www.youtube.com/watch?v=KzlHreolLu8&ab_channel=TheFirsts%7CTheForerunnersofIslam'), -- Sawda Bint Zama'a
  ('00000000-0000-0000-0000-00000001a018'::uuid, 'https://www.youtube.com/watch?v=Vf7nYNbYuQY&list=PLa4GKxenTk5XyfP1cC1Zjm1aQCjXuVdg9'), -- Lessons From The Qur'an

  -- Level 2 (booklet p.11)
  ('00000000-0000-0000-0000-00000002a009'::uuid, 'https://www.youtube.com/playlist?list=PLukPSg97-iL5c67q6nH71H7tcd0mbMoQu'),  -- Towards the Morality of Qur'an
  ('00000000-0000-0000-0000-00000002a010'::uuid, 'https://www.youtube.com/playlist?list=PL4Wio4jCwX5HjZieVHP_X1nsC6oijMsRp'),  -- Sacred Text Messages 1
  ('00000000-0000-0000-0000-00000002a011'::uuid, 'https://www.youtube.com/playlist?list=PLQ02IYL5pmhH9L4PfFvCo0L_hSuRGdMiv'),  -- Angels In Their Presence 2
  ('00000000-0000-0000-0000-00000002a012'::uuid, 'https://www.youtube.com/playlist?list=PLukPSg97-iL52Y0OOL1BuYWEMk79W8fSg'),  -- Question & Answers
  ('00000000-0000-0000-0000-00000002a013'::uuid, 'https://www.youtube.com/watch?v=aKFdDikKS6Y'),                                -- Tufayl ibn Amr
  ('00000000-0000-0000-0000-00000002a014'::uuid, 'https://www.youtube.com/watch?v=JQCWaPze9gI'),                                -- Zaynab bint Jahsh

  -- Level 3 (booklet p.16)
  ('00000000-0000-0000-0000-00000003a009'::uuid, 'https://www.youtube.com/playlist?list=PLukPSg97-iL5KtxXVVx3To-XBjOzDp-WO'),  -- Lights on the Road
  ('00000000-0000-0000-0000-00000003a010'::uuid, 'https://www.youtube.com/watch?v=4kwnB8aJqPA&list=PLQ02IYL5pmhHvZ02LKQVeey8H-2XBKMGb'), -- Meeting Muhammad ﷺ
  ('00000000-0000-0000-0000-00000003a011'::uuid, 'https://www.youtube.com/watch?v=bEjeDEHkWn8&list=PLukPSg97-iL4tZv_cc0i-3H5iAURtadG8'), -- Life Beyond Death
  ('00000000-0000-0000-0000-00000003a012'::uuid, 'https://www.youtube.com/watch?v=DCYGJ-6GTdc&list=PLQ02IYL5pmhGLpO-oUMpZbuI_5dT9m4fi'), -- Jannah: Home at Last
  ('00000000-0000-0000-0000-00000003a013'::uuid, 'https://www.youtube.com/watch?v=cw6WoTssw7o&list=PLa4GKxenTk5WX6SyGIukLM2yGY9uZoIAf'), -- The Great Imams
  ('00000000-0000-0000-0000-00000003a014'::uuid, 'https://www.youtube.com/playlist?list=PLLWosYrkNwE_K9VRWJofr4nyFTXHRi8SV')   -- Sacred Text Messages 2
) as v(id, url)
where public.roadmap_items.id = v.id;

-- ---------------------------------------------------------------------------
-- The memorisation tables, in full (0027)
-- ---------------------------------------------------------------------------
-- The booklet prints every chapter with its NUMBER and its VERSE COUNT, and the
-- roadmap carried only the range ("Chapters 93–114"). The verse counts are what
-- a member actually plans around — 22 surahs sounds like one thing when it is
-- 148 verses and quite another at 219 — so they belong on the item.
update public.roadmap_items set description = v.description
from (values
  ('00000000-0000-0000-0000-00000001a008'::uuid,
   'Chapters 93–114, the last twenty-two of the mushaf — 148 verses in all. Ad-Duha (11) · Al-Inshirah (8) · At-Tin (8) · Al-''Alaq (19) · Al-Qadr (5) · Al-Bayyinah (8) · Az-Zalzalah (8) · Al-''Adiyat (11) · Al-Qari''ah (11) · At-Takathur (8) · Al-''Asr (3) · Al-Humazah (9) · Al-Fil (5) · Quraysh (4) · Al-Ma''un (7) · Al-Kawthar (3) · Al-Kafirun (6) · An-Nasr (3) · Al-Masad (5) · Al-Ikhlas (4) · Al-Falaq (5) · An-Nas (6).'),
  ('00000000-0000-0000-0000-00000002a008'::uuid,
   'Chapters 86–92, continuing backwards from where level 1 stopped — 148 verses. At-Tariq (17) · Al-A''la (19) · Al-Ghashiyah (26) · Al-Fajr (30) · Al-Balad (20) · Ash-Shams (15) · Al-Layl (21).'),
  ('00000000-0000-0000-0000-00000003a008'::uuid,
   'Chapters 78–85, completing Juz ''Amma — 259 verses. An-Naba (40) · An-Nazi''at (46) · ''Abasa (42) · At-Takwir (29) · Al-Infitar (19) · Al-Mutaffifin (36) · Al-Inshiqaq (25) · Al-Buruj (22).')
) as v(id, description)
where public.roadmap_items.id = v.id;


-- ---------------------------------------------------------------------------
-- The Qur'an and Qur'an-studies covers, and what the booklet actually shows
-- ---------------------------------------------------------------------------
-- Another miss the owner had to point out, and the same root cause as the
-- links: the FIRST pass took only the three Book pages and assumed the rest of
-- the programme had no artwork. It does. Pages 04, 09 and 14 each carry a
-- mushaf under "Qur'an" and the study texts under "Qur'an Studies" — nine more
-- covers, and with them the real identity of two items the booklet names only
-- in the abstract.
--
-- Placement was read off the RENDERED pages, not off extraction order, because
-- `pdfimages` emits in content-stream order and that is not reading order (the
-- level-1 Book page hands back the third cover first).
update public.roadmap_items
   set image_url   = v.image_url,
       source      = coalesce(v.source, public.roadmap_items.source),
       description = coalesce(v.description, public.roadmap_items.description)
from (values
  -- Qur'an: the same mushaf on all three pages, so one file serves all three.
  ('00000000-0000-0000-0000-00000001a004'::uuid, '/roadmap/mushaf.png', null, null),
  ('00000000-0000-0000-0000-00000002a004'::uuid, '/roadmap/mushaf.png', null, null),
  ('00000000-0000-0000-0000-00000003a005'::uuid, '/roadmap/mushaf.png', null, null),

  -- The tajweed texts are a SERIES, which the booklet shows and the roadmap
  -- never said: "The Madinah Series", published by Madinah Education.
  ('00000000-0000-0000-0000-00000001a005'::uuid, '/roadmap/tajweed-book-1.png',
   'The Madinah Series · Madinah Education', null),
  ('00000000-0000-0000-0000-00000001a006'::uuid, '/roadmap/tajweed-book-2.png',
   'The Madinah Series · Madinah Education', null),
  ('00000000-0000-0000-0000-00000002a005'::uuid, '/roadmap/tajweed-book-3-theory.png',
   'The Madinah Series · Madinah Education', null),
  ('00000000-0000-0000-0000-00000002a006'::uuid, '/roadmap/tajweed-book-3-iread.png',
   'The Madinah Series · Madinah Education', null),

  -- "Tafseer" is one word in the booklet and TWO books on the page. Both are
  -- named here rather than one being picked: the booklet shows them side by
  -- side and says nothing about choosing, so neither may be dropped silently.
  ('00000000-0000-0000-0000-00000003a006'::uuid, '/roadmap/the-study-quran.png',
   'The Study Quran (Seyyed Hossein Nasr) · The Qur''an with Annotated Interpretation (Ali Ünal)',
   'The booklet shows two editions under Tafseer: The Study Quran — A New Translation and Commentary, edited by Seyyed Hossein Nasr, and The Qur''an with Annotated Interpretation in Modern English by Ali Ünal.')
) as v(id, image_url, source, description)
where public.roadmap_items.id = v.id;

-- The level-3 khatm is read WITH interpretation, and the booklet shows which
-- edition on the same page: Ali Ünal's annotated interpretation.
update public.roadmap_items
   set image_url = '/roadmap/quran-annotated-interpretation.png',
       source = 'With Ali Ünal''s Annotated Interpretation in Modern English'
 where id = '00000000-0000-0000-0000-00000003a005';
