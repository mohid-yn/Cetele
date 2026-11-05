-- ============================================================================
-- Migration 0039 — an AI app's connection lasts seven days (docs/MCP_PLAN.md)
-- ----------------------------------------------------------------------------
-- A refresh token never expires, so without this a connector stays signed in
-- forever, and a stolen token keeps working until someone notices. Supabase's own
-- session limits are project-wide and on the Pro plan, so using them would sign
-- out every member too. `auth.sessions.oauth_client_id` marks the sessions that
-- came from an OAuth app, which lets this apply to those alone.
--
-- TWO HALVES, because each covers what the other cannot:
--   mcp_session_active()    asked by /api/mcp on every request. Refuses a session
--                           the moment it is too old, or once it has been deleted,
--                           though the access token itself is still valid.
--   expire_mcp_sessions()   deletes the old rows hourly. `auth.refresh_tokens`
--                           references sessions ON DELETE CASCADE, so this is what
--                           ends the ability to renew.
--
-- WHAT THIS DOES NOT DO: an access token that was already issued keeps working
-- directly against Supabase until it expires, up to an hour by default. That path
-- never reaches /api/mcp.
--
-- App sign-ins have a null `oauth_client_id`, and nothing here touches them.
-- ============================================================================

create or replace function private.mcp_session_max_age() returns interval
  language sql immutable set search_path = '' as $$
  select interval '7 days';
$$;

create or replace function public.mcp_session_active() returns boolean
  language sql security definer stable set search_path = '' as $$
  select exists (
    select 1
      from auth.sessions s
     where s.id = nullif(auth.jwt() ->> 'session_id', '')::uuid
       and s.user_id = auth.uid()
       and s.oauth_client_id is not null
       and s.created_at > now() - private.mcp_session_max_age()
  );
$$;

comment on function public.mcp_session_active() is
  'Is the caller''s token from a live OAuth app session under seven days old '
  '(0039)? An app sign-in is never active here, because it has no client.';

create or replace function private.expire_mcp_sessions() returns integer
  language sql security definer set search_path = '' as $$
  with gone as (
    delete from auth.sessions
     where oauth_client_id is not null
       and created_at <= now() - private.mcp_session_max_age()
    returning 1
  )
  select count(*)::integer from gone;
$$;

revoke all on function private.mcp_session_max_age() from public, anon, authenticated;
revoke all on function private.expire_mcp_sessions() from public, anon, authenticated;
revoke all on function public.mcp_session_active() from public, anon;
grant execute on function public.mcp_session_active() to authenticated;

select cron.schedule(
  'expire-mcp-sessions',
  '20 * * * *',
  $$select private.expire_mcp_sessions()$$
);
