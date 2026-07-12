-- ============================================================================
-- CET-11 · Migration 0014 — save_push_subscription (fixes a live M8 bug)
-- ----------------------------------------------------------------------------
-- Reported from a real iPhone: allowing notifications then failed with
-- `permission denied for table push_subscriptions`.
--
-- Why: the client saved the device with PostgREST's `upsert`, which compiles to
-- `INSERT … ON CONFLICT DO UPDATE SET …` — so it needs UPDATE privilege. But
-- push_subscriptions is deliberately INSERT/DELETE-only (0013): a browser never
-- mutates a subscription, it re-subscribes with a NEW endpoint. There is no
-- UPDATE grant and no UPDATE policy, so the write was refused.
--
-- (Same trap as the reminders write, which 0013 already moved to an RPC. The
-- e2e can't cover this one — Playwright cannot mint a real push subscription —
-- so it shipped. pgTAP now pins BOTH halves: the direct write is refused, and
-- the RPC works.)
--
-- The fix is an RPC rather than an UPDATE grant, because the conflict case is
-- real and needs care: the SAME endpoint can come back for a DIFFERENT user
-- (a shared phone, a second account on one browser). ON CONFLICT must therefore
-- reassign user_id to whoever just subscribed — otherwise their reminders would
-- be pushed to the previous owner's device.
-- ============================================================================

create or replace function public.save_push_subscription(
  p_endpoint   text,
  p_p256dh     text,
  p_auth       text,
  p_user_agent text
) returns void
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_caller_profile();
begin
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (v_uid, p_endpoint, p_p256dh, p_auth, p_user_agent)
  on conflict (endpoint) do update
    set user_id    = excluded.user_id,   -- the device now belongs to whoever just subscribed
        p256dh     = excluded.p256dh,
        auth       = excluded.auth,
        user_agent = excluded.user_agent;
end;
$$;

revoke all on function public.save_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;

-- Writes are now RPC-only, matching reminders. Reads + delete (unsubscribe this
-- device) stay direct under RLS.
revoke insert on public.push_subscriptions from authenticated;
