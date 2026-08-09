-- ============================================================================
-- Migration 0031 — a bucket for roadmap cover art, so an organiser can UPLOAD
-- ----------------------------------------------------------------------------
-- AMENDS D57, which put the booklet's covers in `public/roadmap/` and said so
-- deliberately: "versioned with the repo — no bucket, no external host". That
-- was right for the eighteen pictures that arrived WITH the booklet, and it is
-- the wrong answer for the nineteenth. 0030 lets an organiser add work to a
-- programme without an engineer; a picture for that work would still have
-- needed a commit, a review and a deploy, which makes the new item strictly
-- worse than the ones that shipped in the repo.
--
-- The repo path does not go away and nothing is migrated. `image_url` is text
-- and always has been: `/roadmap/calling-to-good.png` keeps working exactly as
-- it does today, and an uploaded cover is simply an absolute URL into this
-- bucket. Both already render through `RoadmapCover`, which is a plain <img>
-- with an onError fallback for precisely this reason.
--
-- PUBLIC BUCKET, and that is the honest setting rather than a shortcut. A cover
-- is shown to every member of every circle following the programme, and the
-- member's roadmap screen is a Server Component rendering an <img> — a signed
-- URL would have to be minted per request, expire mid-page, and buy nothing:
-- the picture is a book jacket the publisher sells on a shelf.
--
-- WRITES ARE THE DATABASE'S DECISION, not the app's. The policies below put
-- `private.is_super_admin()` on insert, update and delete, so an upload by a
-- circle owner is refused by Postgres and not by a check in a route handler
-- that could be forgotten. Same reader as every roadmap policy since 0025.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'roadmap',
  'roadmap',
  true,
  -- 2 MB. A cover renders at 96px wide on a phone and 48px in a list; anything
  -- larger is a photograph somebody dragged in by mistake, and the limit is
  -- enforced by storage itself rather than by the browser we happen to ship.
  2097152,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ----------------------------------------------------------------------------
-- Policies on storage.objects, scoped to this one bucket
-- ----------------------------------------------------------------------------
-- `storage.objects` is owned by `supabase_storage_admin` and already has RLS
-- enabled by the storage extension, so this migration only adds policies. Each
-- one names the bucket, so nothing here can widen or narrow any other bucket.
drop policy if exists roadmap_covers_read on storage.objects;
create policy roadmap_covers_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'roadmap');

drop policy if exists roadmap_covers_insert on storage.objects;
create policy roadmap_covers_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'roadmap' and private.is_super_admin());

-- Update and delete are separate policies rather than one `for all`: replacing
-- a cover is an upsert (insert + update) and removing one is a delete, and a
-- single combined policy would have made "who may overwrite" harder to read
-- than "who may add".
drop policy if exists roadmap_covers_update on storage.objects;
create policy roadmap_covers_update on storage.objects
  for update to authenticated
  using (bucket_id = 'roadmap' and private.is_super_admin())
  with check (bucket_id = 'roadmap' and private.is_super_admin());

drop policy if exists roadmap_covers_delete on storage.objects;
create policy roadmap_covers_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'roadmap' and private.is_super_admin());
