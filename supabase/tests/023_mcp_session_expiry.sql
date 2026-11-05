-- ============================================================================
-- Logic + grants test suite: 0039 (an AI app's connection lasts seven days)
-- ----------------------------------------------------------------------------
-- Pins that the limit reaches OAuth sessions only. A member's own sign-in must
-- survive however old it is, or this would sign the whole app out.
-- ============================================================================

begin;
create extension if not exists pgtap with schema extensions;
set search_path to public, extensions;
select no_plan();

insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('c5000000-0000-0000-0000-00000000000a', 'a@mcp.test', '{"name":"A"}', 'authenticated', 'authenticated'),
  ('c5000000-0000-0000-0000-00000000000b', 'b@mcp.test', '{"name":"B"}', 'authenticated', 'authenticated');

insert into auth.oauth_clients
  (id, client_name, registration_type, client_type, token_endpoint_auth_method,
   redirect_uris, grant_types)
values
  ('c5000000-0000-0000-0000-0000000000c1', 'Claude', 'manual', 'public', 'none',
   'https://claude.ai/api/mcp/auth_callback', 'authorization_code,refresh_token');

insert into auth.sessions (id, user_id, oauth_client_id, created_at) values
  -- OAuth, fresh
  ('c5000000-0000-0000-0000-0000000000d1', 'c5000000-0000-0000-0000-00000000000a',
   'c5000000-0000-0000-0000-0000000000c1', now() - interval '6 days 23 hours'),
  -- OAuth, too old
  ('c5000000-0000-0000-0000-0000000000d2', 'c5000000-0000-0000-0000-00000000000a',
   'c5000000-0000-0000-0000-0000000000c1', now() - interval '7 days 1 minute'),
  -- An app sign-in, new
  ('c5000000-0000-0000-0000-0000000000d3', 'c5000000-0000-0000-0000-00000000000a',
   null, now()),
  -- An app sign-in, months old
  ('c5000000-0000-0000-0000-0000000000d4', 'c5000000-0000-0000-0000-00000000000a',
   null, now() - interval '90 days');

insert into auth.refresh_tokens (token, user_id, session_id, revoked) values
  ('mcp-old', 'c5000000-0000-0000-0000-00000000000a', 'c5000000-0000-0000-0000-0000000000d2', false),
  ('mcp-new', 'c5000000-0000-0000-0000-00000000000a', 'c5000000-0000-0000-0000-0000000000d1', false);

create function pg_temp.active_for(p_user text, p_session text) returns boolean
  language plpgsql as $$
declare
  v_active boolean;
begin
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', p_user, 'role', 'authenticated', 'session_id', p_session)::text,
    true);
  execute 'set local role authenticated';
  select public.mcp_session_active() into v_active;
  execute 'reset role';
  perform set_config('request.jwt.claims', null, true);
  return v_active;
end;
$$;
grant execute on function pg_temp.active_for(text, text) to authenticated;

-- ---------------------------------------------------------------- who is active
select ok(pg_temp.active_for('c5000000-0000-0000-0000-00000000000a', 'c5000000-0000-0000-0000-0000000000d1'),
  'an OAuth session under seven days old is active');
select ok(not pg_temp.active_for('c5000000-0000-0000-0000-00000000000a', 'c5000000-0000-0000-0000-0000000000d2'),
  'an OAuth session over seven days old is refused, before cleanup has run');
select ok(not pg_temp.active_for('c5000000-0000-0000-0000-00000000000a', 'c5000000-0000-0000-0000-0000000000d3'),
  'an app sign-in is not an OAuth session');
select ok(not pg_temp.active_for('c5000000-0000-0000-0000-00000000000b', 'c5000000-0000-0000-0000-0000000000d1'),
  'someone else''s session is refused');
select ok(not pg_temp.active_for('c5000000-0000-0000-0000-00000000000a', 'c5000000-0000-0000-0000-0000000000ff'),
  'a session that no longer exists is refused');
select ok(not pg_temp.active_for('c5000000-0000-0000-0000-00000000000a', ''),
  'a token with no session is refused');

-- ------------------------------------------------------------------ the cleanup
select is(private.expire_mcp_sessions(), 1, 'cleanup removes exactly the one old OAuth session');

select ok(not exists (select 1 from auth.sessions where id = 'c5000000-0000-0000-0000-0000000000d2'),
  'the old OAuth session is gone');
select ok(not exists (select 1 from auth.refresh_tokens where token = 'mcp-old'),
  'its refresh token went with it, so it cannot renew');
select ok(exists (select 1 from auth.sessions where id = 'c5000000-0000-0000-0000-0000000000d1'),
  'a fresh OAuth session survives');
select ok(exists (select 1 from auth.refresh_tokens where token = 'mcp-new'),
  'a fresh session keeps its refresh token');
select ok(exists (select 1 from auth.sessions where id = 'c5000000-0000-0000-0000-0000000000d3'),
  'a new app sign-in survives');
select ok(exists (select 1 from auth.sessions where id = 'c5000000-0000-0000-0000-0000000000d4'),
  'a months-old app sign-in survives');

select is(private.expire_mcp_sessions(), 0, 'running cleanup again removes nothing');

select ok(exists (select 1 from cron.job where jobname = 'expire-mcp-sessions'),
  'the cleanup is scheduled');

-- ----------------------------------------------------------------------- grants
select ok(has_function_privilege('authenticated', 'public.mcp_session_active()', 'execute'),
  'a signed-in caller can ask about their own session');
select ok(not has_function_privilege('anon', 'public.mcp_session_active()', 'execute'),
  'anon cannot');
select ok(not has_function_privilege('authenticated', 'private.expire_mcp_sessions()', 'execute'),
  'no client can trigger the cleanup');
select ok(not has_function_privilege('anon', 'private.expire_mcp_sessions()', 'execute'),
  'anon cannot trigger the cleanup');

select * from finish();
rollback;
