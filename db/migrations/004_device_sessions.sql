begin;
-- Keep existing sessions intact; legacy sessions retain their own shared slot.
create unique index one_active_session_per_device
  on cadence.sessions(user_id, (coalesce(timer_state->>'device_id','legacy')))
  where status is null;
drop index cadence.one_active_session_per_user;
commit;
