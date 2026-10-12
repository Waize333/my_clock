-- Keep normalized interval targets in sync when the current focus interval is extended.
begin;
create or replace function cadence.save_timer(p_timer jsonb, p_expected_revision bigint) returns bigint language plpgsql security invoker set search_path = '' as $$
declare
  sid uuid := (p_timer->>'id')::uuid;
  uid uuid := nullif(current_setting('cadence.user_id',true),'')::uuid;
  actual_revision bigint;
  existing_status cadence.session_status;
  item jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_expected_revision = 0 then
    insert into cadence.sessions(id,user_id,started_at,ended_at,planned_work_min,planned_break_min,status,timer_state)
    values(sid,uid,(p_timer->>'started_at')::timestamptz,(p_timer->>'ended_at')::timestamptz,(p_timer->>'planned_work_min')::int,(p_timer->>'planned_break_min')::int,(p_timer->>'status')::cadence.session_status,p_timer)
    on conflict (id) do nothing;
  end if;
  select revision, status into actual_revision, existing_status from cadence.sessions where id = sid and user_id = uid for update;
  if actual_revision is null or actual_revision <> p_expected_revision then raise exception 'Session conflict: reload before editing'; end if;
  if existing_status is not null and actual_revision > 0 then raise exception 'Session is already finished'; end if;
  if jsonb_typeof(p_timer->'intervals') <> 'array' or jsonb_array_length(p_timer->'intervals') = 0 then raise exception 'Intervals required'; end if;
  for item in select value from jsonb_array_elements(p_timer->'intervals') loop
    if (item->>'session_id')::uuid <> sid then raise exception 'Invalid interval session'; end if;
    insert into cadence.intervals(id,session_id,type,started_at,ended_at,duration_sec,planned_duration_sec,completed)
    values((item->>'id')::uuid,sid,(item->>'type')::cadence.interval_type,(item->>'started_at')::timestamptz,(item->>'ended_at')::timestamptz,(item->>'duration_sec')::double precision,(item->>'planned_duration_sec')::int,(item->>'completed')::boolean)
    on conflict(id) do update set ended_at=excluded.ended_at,duration_sec=excluded.duration_sec,completed=excluded.completed,planned_duration_sec=excluded.planned_duration_sec
    where cadence.intervals.session_id = excluded.session_id;
    if not found then raise exception 'Interval ownership mismatch'; end if;
  end loop;
  update cadence.sessions set ended_at=(p_timer->>'ended_at')::timestamptz,status=(p_timer->>'status')::cadence.session_status,timer_state=p_timer,revision=actual_revision+1 where id=sid;
  return actual_revision+1;
end;
$$;
commit;
