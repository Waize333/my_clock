begin;
create schema cadence;
do $$ begin
  if not exists (select 1 from pg_roles where rolname='cadence_authenticated') then
    create role cadence_authenticated nologin nobypassrls;
  end if;
  execute format('grant cadence_authenticated to %I', current_user);
end $$;
grant usage on schema cadence to cadence_authenticated;
create type cadence.session_status as enum ('completed','abandoned');
create type cadence.interval_type as enum ('work','break');
create table cadence.profiles (
  id uuid primary key references public.cadence_user(id) on delete cascade,
  username text not null check (username ~ '^[a-zA-Z0-9_-]{3,40}$'),
  display_name text not null default '' check (length(display_name) <= 80),
  avatar_url text,
  default_work_min integer not null default 50 check (default_work_min between 1 and 180),
  default_break_min integer not null default 10 check (default_break_min between 1 and 60),
  theme_pref text not null default 'system' check (theme_pref in ('system','light','dark')),
  created_at timestamptz not null default now()
);
create table cadence.sessions (
  id uuid primary key,
  user_id uuid not null references cadence.profiles(id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz,
  planned_work_min integer not null check (planned_work_min between 1 and 180),
  planned_break_min integer not null check (planned_break_min between 1 and 60),
  status cadence.session_status,
  timer_state jsonb not null,
  revision bigint not null default 0 check (revision >= 0),
  check ((status is null and ended_at is null) or (status is not null and ended_at >= started_at))
);
create unique index one_active_session_per_user on cadence.sessions(user_id) where status is null;
create index sessions_user_started on cadence.sessions(user_id, started_at desc);
create table cadence.intervals (
  id uuid primary key,
  session_id uuid not null references cadence.sessions(id) on delete cascade,
  type cadence.interval_type not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  duration_sec double precision not null default 0 check (duration_sec >= 0 and duration_sec <= planned_duration_sec),
  planned_duration_sec integer not null check (planned_duration_sec between 60 and 10800),
  completed boolean not null default false,
  check (ended_at is null or ended_at >= started_at),
  check (not completed or (ended_at is not null and duration_sec = planned_duration_sec))
);
create unique index one_open_interval_per_session on cadence.intervals(session_id) where ended_at is null;
create index intervals_session_started on cadence.intervals(session_id, started_at);
alter table cadence.profiles enable row level security;
alter table cadence.sessions enable row level security;
alter table cadence.intervals enable row level security;
create policy profile_select on cadence.profiles for select to cadence_authenticated using (id = (select nullif(current_setting('cadence.user_id',true),'')::uuid));
create policy profile_insert on cadence.profiles for insert to cadence_authenticated with check (id = (select nullif(current_setting('cadence.user_id',true),'')::uuid));
create policy profile_update on cadence.profiles for update to cadence_authenticated using (id = (select nullif(current_setting('cadence.user_id',true),'')::uuid)) with check (id = (select nullif(current_setting('cadence.user_id',true),'')::uuid));
create policy session_owner on cadence.sessions for all to cadence_authenticated using (user_id = (select nullif(current_setting('cadence.user_id',true),'')::uuid)) with check (user_id = (select nullif(current_setting('cadence.user_id',true),'')::uuid));
create policy interval_owner on cadence.intervals for all to cadence_authenticated using (exists (select 1 from cadence.sessions s where s.id = session_id and s.user_id = (select nullif(current_setting('cadence.user_id',true),'')::uuid))) with check (exists (select 1 from cadence.sessions s where s.id = session_id and s.user_id = (select nullif(current_setting('cadence.user_id',true),'')::uuid)));
revoke all on cadence.profiles, cadence.sessions, cadence.intervals from public;
grant select, insert, update on cadence.profiles to cadence_authenticated;
grant select, insert, update, delete on cadence.sessions, cadence.intervals to cadence_authenticated;
create function cadence.create_profile() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into cadence.profiles(id, username, display_name, avatar_url)
  values (new.id, 'user_' || replace(new.id::text, '-', ''), left(coalesce(new.name,''),80), new.image);
  return new;
end;
$$;
revoke all on function cadence.create_profile() from public;
create trigger on_auth_user_created after insert on public.cadence_user for each row execute function cadence.create_profile();
insert into cadence.profiles(id, username) select id, 'user_' || replace(id::text, '-', '') from public.cadence_user on conflict do nothing;
-- Atomic optimistic writes under a transaction-local, non-bypass app role.
create function cadence.save_timer(p_timer jsonb, p_expected_revision bigint) returns bigint language plpgsql security invoker set search_path = '' as $$
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
    on conflict(id) do update set ended_at=excluded.ended_at,duration_sec=excluded.duration_sec,completed=excluded.completed
    where cadence.intervals.session_id = excluded.session_id;
    if not found then raise exception 'Interval ownership mismatch'; end if;
  end loop;
  update cadence.sessions set ended_at=(p_timer->>'ended_at')::timestamptz,status=(p_timer->>'status')::cadence.session_status,timer_state=p_timer,revision=actual_revision+1 where id=sid;
  return actual_revision+1;
end;
$$;
revoke all on function cadence.save_timer(jsonb,bigint) from public;
grant execute on function cadence.save_timer(jsonb,bigint) to cadence_authenticated;
commit;
