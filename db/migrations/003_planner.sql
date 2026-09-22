begin;
create table cadence.planners (
  user_id uuid primary key references cadence.profiles(id) on delete cascade,
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);
alter table cadence.planners enable row level security;
create policy planner_owner on cadence.planners for all to cadence_authenticated
  using (user_id = (select nullif(current_setting('cadence.user_id',true),'')::uuid))
  with check (user_id = (select nullif(current_setting('cadence.user_id',true),'')::uuid));
revoke all on cadence.planners from public;
grant select, insert, update on cadence.planners to cadence_authenticated;
commit;
