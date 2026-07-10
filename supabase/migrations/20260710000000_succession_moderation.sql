-- ============================================================================
-- CET-2 · Migration 0011 — M7: succession + moderation (D27, closes B5)
-- ----------------------------------------------------------------------------
-- The resilience layer. D26's single-owner + zero-operator model orphans a
-- circle if the owner vanishes, and makes the operator a bottleneck. Two fixes:
--
--   (1) CO-ADMIN SUCCESSION — a co-admin can `claim_ownership` of a group whose
--       owner is ABSENT (dormant ≥14 days, or gone), so one owner leaving never
--       orphans the circle. Forgiveness-framed in the UI ("take over to keep the
--       circle running"), never punitive.
--   (2) DB-ONLY SUPER-ADMIN (`profiles.is_super_admin`, set only in Supabase —
--       no in-app escalation path) with exactly two powers, both AUDITED and
--       NEITHER a browse-all-content god view (D26's privacy promise holds):
--         * recovery  — `reassign_owner` a dead group to a member
--         * moderation — `resolve_report` on abuse reports
--
-- Tables: `audit_log` (every sensitive action, tamper-evident trail) and
-- `reports` (abuse reports). Both writes are RPC/trigger-only; reads are
-- narrowly scoped (super-admin all · self-scoped otherwise) — the super-admin
-- sees the audit/report metadata, NOT group content.
--
-- Also lands D29's promise that every PROXY-log is audited: a trigger on `logs`
-- writes an `audit_log` row whenever `logged_by` marks an admin proxy-edit.
--
-- Client-callable RPCs grow by 4 (claim_ownership, reassign_owner,
-- resolve_report, can_claim_ownership) — all internally guarded; accepted
-- advisor WARNs → 11.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- audit_log — the tamper-evident trail (append-only; writes are DEFINER-only)
-- ----------------------------------------------------------------------------
create table public.audit_log (
  id             uuid primary key default gen_random_uuid(),
  actor_id       uuid references public.profiles on delete set null,  -- who acted
  action         text not null,          -- proxy_log | claim_ownership | reassign_owner | resolve_report
  group_id       uuid references public.groups   on delete set null,
  target_user_id uuid references public.profiles on delete set null,  -- who was affected
  detail         jsonb,                  -- action-specific payload
  created_at     timestamptz not null default now()
);
create index audit_log_target_idx on public.audit_log (target_user_id, created_at);
create index audit_log_group_idx  on public.audit_log (group_id, created_at);
create index audit_log_actor_idx  on public.audit_log (actor_id);

alter table public.audit_log enable row level security;

-- Read: a super-admin (moderation/recovery oversight) OR the affected member
-- (their own record — D29 "see + correct your own record"). No one browses
-- others' entries. Write: NOBODY directly — only the DEFINER RPCs/trigger below.
create policy audit_log_select_self_or_super on public.audit_log
  for select to authenticated
  using (target_user_id = (select auth.uid()) or private.is_super_admin());

grant select on public.audit_log to authenticated;   -- and nothing else, ever

-- ----------------------------------------------------------------------------
-- reports — abuse reports (filed by any member; resolved by super-admin only)
-- ----------------------------------------------------------------------------
create table public.reports (
  id               uuid primary key default gen_random_uuid(),
  reporter_id      uuid not null references public.profiles on delete cascade,
  group_id         uuid references public.groups   on delete set null,
  reported_user_id uuid references public.profiles on delete set null,
  reason           text not null,
  status           text not null default 'open'
                     check (status in ('open','reviewing','actioned','dismissed')),
  resolution_note  text,
  resolved_by      uuid references public.profiles on delete set null,
  resolved_at      timestamptz,
  created_at       timestamptz not null default now()
);
create index reports_status_idx   on public.reports (status, created_at);
create index reports_reporter_idx on public.reports (reporter_id);

alter table public.reports enable row level security;

-- Read: the reporter (their own reports) OR a super-admin (all, to moderate).
create policy reports_select_self_or_super on public.reports
  for select to authenticated
  using (reporter_id = (select auth.uid()) or private.is_super_admin());

-- Insert: any authenticated user files a report AS THEMSELVES; the moderation
-- columns (status/resolution/resolved_*) stay server-controlled (not granted).
create policy reports_insert_self on public.reports
  for insert to authenticated
  with check (reporter_id = (select auth.uid()));

grant select on public.reports to authenticated;
grant insert (reporter_id, group_id, reported_user_id, reason) on public.reports to authenticated;
-- UPDATE stays ungranted: resolution flows through resolve_report (audited).

-- ----------------------------------------------------------------------------
-- group_owner_absent — the succession precondition. TRUE when a group has no
-- ACTIVE owner: either no owner-role membership at all (gone), or the owner has
-- been dormant ≥14 days. "Active" = joined <14 days ago (hasn't had time to be
-- dormant) OR has any log in the last 14 days (the durable activity signal;
-- raw logs retain 14 days, so their presence = recent activity).
-- ----------------------------------------------------------------------------
create or replace function private.group_owner_absent(p_group uuid) returns boolean
  language sql security definer stable set search_path = '' as $$
  select not exists (
    select 1 from public.memberships m
    where m.group_id = p_group and m.role = 'owner'
      and (
        m.created_at > (now() - interval '14 days')
        or exists (
          select 1 from public.logs l
          where l.user_id = m.user_id and l.date >= current_date - 14
        )
      )
  );
$$;
revoke all on function private.group_owner_absent(uuid) from public, anon;
grant execute on function private.group_owner_absent(uuid) to authenticated;

-- Public read for the UI: TRUE only for a co-admin of an owner-absent group
-- (so /group/manage can show the "claim ownership" banner). Just a boolean —
-- a co-admin can already see the owner's activity via the group logs, so this
-- leaks nothing new.
create or replace function public.can_claim_ownership(p_group uuid) returns boolean
  language sql security definer stable set search_path = '' as $$
  select exists (
    select 1 from public.memberships
    where group_id = p_group and user_id = (select auth.uid()) and role = 'admin'
  ) and private.group_owner_absent(p_group);
$$;
revoke all on function public.can_claim_ownership(uuid) from public, anon;
grant execute on function public.can_claim_ownership(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- claim_ownership — a co-admin takes over a group whose owner is absent (D27).
-- Reuses the demote-first transfer dance so one_owner_per_group holds. Audited.
-- ----------------------------------------------------------------------------
create or replace function public.claim_ownership(p_group uuid) returns void
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid       uuid := (select auth.uid());
  v_old_owner uuid;
begin
  if v_uid is null then
    raise exception 'must be authenticated';
  end if;
  if not exists (
    select 1 from public.memberships
    where group_id = p_group and user_id = v_uid and role = 'admin'
  ) then
    raise exception 'only a co-admin can claim ownership';
  end if;
  if not private.group_owner_absent(p_group) then
    raise exception 'the owner is still active';
  end if;

  select user_id into v_old_owner
    from public.memberships where group_id = p_group and role = 'owner';

  perform set_config('app.allow_owner_change', 'on', true);
  if v_old_owner is not null then
    update public.memberships set role = 'admin'
      where group_id = p_group and user_id = v_old_owner;
  end if;
  update public.memberships set role = 'owner'
    where group_id = p_group and user_id = v_uid;
  update public.groups set created_by = v_uid where id = p_group;
  perform set_config('app.allow_owner_change', 'off', true);

  insert into public.audit_log (actor_id, action, group_id, target_user_id, detail)
  values (v_uid, 'claim_ownership', p_group, v_old_owner,
          jsonb_build_object('reason', 'owner_absent'));
end;
$$;
revoke all on function public.claim_ownership(uuid) from public, anon;
grant execute on function public.claim_ownership(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- reassign_owner — super-admin recovery: hand a group to a member (D27). NOT a
-- god view (can't read content); can only move the owner pointer. Audited.
-- ----------------------------------------------------------------------------
create or replace function public.reassign_owner(p_group uuid, p_new_owner uuid) returns void
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid       uuid := (select auth.uid());
  v_old_owner uuid;
begin
  if not private.is_super_admin() then
    raise exception 'super-admin only';
  end if;
  if not exists (
    select 1 from public.memberships where group_id = p_group and user_id = p_new_owner
  ) then
    raise exception 'the new owner must be a member of the group';
  end if;

  select user_id into v_old_owner
    from public.memberships where group_id = p_group and role = 'owner';

  perform set_config('app.allow_owner_change', 'on', true);
  if v_old_owner is not null and v_old_owner <> p_new_owner then
    update public.memberships set role = 'admin'
      where group_id = p_group and user_id = v_old_owner;
  end if;
  update public.memberships set role = 'owner'
    where group_id = p_group and user_id = p_new_owner;
  update public.groups set created_by = p_new_owner where id = p_group;
  perform set_config('app.allow_owner_change', 'off', true);

  insert into public.audit_log (actor_id, action, group_id, target_user_id, detail)
  values (v_uid, 'reassign_owner', p_group, p_new_owner,
          jsonb_build_object('previous_owner', v_old_owner));
end;
$$;
revoke all on function public.reassign_owner(uuid, uuid) from public, anon;
grant execute on function public.reassign_owner(uuid, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- resolve_report — super-admin moves a report through its lifecycle. Audited.
-- ----------------------------------------------------------------------------
create or replace function public.resolve_report(p_report uuid, p_status text, p_note text default null)
  returns void
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  r     public.reports;
begin
  if not private.is_super_admin() then
    raise exception 'super-admin only';
  end if;
  if p_status not in ('reviewing','actioned','dismissed') then
    raise exception 'invalid status';
  end if;

  update public.reports
     set status = p_status, resolution_note = p_note,
         resolved_by = v_uid, resolved_at = now()
   where id = p_report
   returning * into r;
  if not found then
    raise exception 'report not found';
  end if;

  insert into public.audit_log (actor_id, action, group_id, target_user_id, detail)
  values (v_uid, 'resolve_report', r.group_id, r.reported_user_id,
          jsonb_build_object('report_id', r.id, 'status', p_status));
end;
$$;
revoke all on function public.resolve_report(uuid, text, text) from public, anon;
grant execute on function public.resolve_report(uuid, text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- Proxy-log audit (D29): every admin proxy-edit on `logs` (logged_by set to
-- someone other than the member) writes an audit_log row. Self-edits
-- (logged_by null / = user_id) don't. Fires from the M3 set_count RPC's write.
-- ----------------------------------------------------------------------------
create or replace function private.audit_proxy_log() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  if new.logged_by is not null and new.logged_by <> new.user_id then
    insert into public.audit_log (actor_id, action, group_id, target_user_id, detail)
    select new.logged_by, 'proxy_log', t.group_id, new.user_id,
           jsonb_build_object('task_id', new.task_id, 'date', new.date, 'count', new.count)
    from public.tasks t where t.id = new.task_id;
  end if;
  return new;
end;
$$;
revoke all on function private.audit_proxy_log() from public, anon, authenticated;

create trigger audit_proxy_log
  after insert or update on public.logs
  for each row execute function private.audit_proxy_log();
