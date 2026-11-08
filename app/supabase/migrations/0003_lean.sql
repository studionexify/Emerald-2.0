-- Keep the free-tier database small for years: deleted rows keep no payload, and old tombstones are pruned by the daily beat.
update public.records set data = null where deleted and data is not null;

create or replace function public.beat() returns void
language sql security definer set search_path = '' as $$
  insert into public.heartbeat (day) values (current_date)
    on conflict (day) do update set at = now(), hits = public.heartbeat.hits + 1;
  delete from public.heartbeat where day < current_date - 30;
  -- A device offline longer than 180 days re-syncs from scratch anyway; older delete markers are dead weight.
  update public.records set data = null where deleted and data is not null;
  delete from public.records where deleted and updated_at < now() - interval '180 days';
$$;
revoke all on function public.beat() from public;
grant execute on function public.beat() to anon, authenticated;

-- Owner-visible usage meter: database bytes used (free plan limit is 500 MB).
create or replace function public.db_usage() returns bigint
language sql stable security definer set search_path = '' as $$
  select case when exists (select 1 from public.members where user_id = (select auth.uid()) and role = 'owner') then pg_database_size(current_database()) end
$$;
revoke all on function public.db_usage() from public, anon;
grant execute on function public.db_usage() to authenticated;
