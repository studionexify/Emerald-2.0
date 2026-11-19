-- Closes two gaps in 0009 so the rule holds for EVERY caller, not only the app:
--   * a database caller that is not the app (postgres through SQL, service_role) and did not declare itself used to be accepted as "ok";
--     now it is refused exactly like an unstamped app deletion. Only  select set_config('emerald.actor', 'claude: <what the owner asked>', true);  lets it through.
--   * a hard  DELETE FROM public.records  skipped the trigger entirely; it now raises unless the caller declared itself the same way, and is logged.
-- (Nothing in supabase/functions writes to public.records; the app's roles have no DELETE policy at all.)

create or replace function public.records_y_tombstone() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  actor text := nullif(current_setting('emerald.actor', true), '');
  app boolean := coalesce(nullif(current_setting('role', true), 'none'), '') in ('authenticated', 'anon') or auth.uid() is not null;
  claude boolean := coalesce((not app) and actor like 'claude:%', false);  -- coalesce: no actor must be false, never NULL
  stamp jsonb := case when jsonb_typeof(new.data) = 'object' then new.data->'_del' end;
  at_ms numeric;
  now_ms numeric := extract(epoch from clock_timestamp()) * 1000;
  human boolean := false;
  verdict text := 'ok';
begin
  if tg_op = 'INSERT' then return new; end if;
  if old.deleted and not new.deleted then
    if jsonb_typeof(new.data) = 'object' and new.data ? '_del' then new.data := new.data - '_del'; end if;
    return new;
  end if;
  if not (new.deleted and not old.deleted) then return new; end if;

  if jsonb_typeof(stamp) = 'object' then
    at_ms := nullif(stamp->>'at', '')::numeric;
    human := at_ms is not null and at_ms between now_ms - 30 * 86400000::numeric and now_ms + 300000;
  end if;

  -- allowed: a person's stamped deletion from the app, or a Claude session that declared itself. Everything else is put back.
  if not ((app and human) or claude) and new.id !~ '^[a-z]{1,3}[0-9]{1,3}$' then
    verdict := 'blocked-delete';
    new.deleted := false;
    new.data := old.data;
  else
    if claude then verdict := 'claude'; end if;
    new.data := coalesce(old.data, '{}'::jsonb) || case when jsonb_typeof(new.data) = 'object' then new.data else '{}'::jsonb end;
  end if;

  insert into public.record_history (org, kind, id, uid, role, actor, verdict, old_data, new_data, old_deleted, new_deleted)
  values (new.org, new.kind, new.id, auth.uid(), coalesce(nullif(current_setting('role', true), 'none'), current_user), actor, verdict, old.data, new.data, old.deleted, new.deleted);
  return new;
end $$;

create or replace function public.records_y_nodelete() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  actor text := nullif(current_setting('emerald.actor', true), '');
  app boolean := coalesce(nullif(current_setting('role', true), 'none'), '') in ('authenticated', 'anon') or auth.uid() is not null;
begin
  insert into public.record_history (org, kind, id, uid, role, actor, verdict, old_data, old_deleted, new_deleted)
  values (old.org, old.kind, old.id, auth.uid(), coalesce(nullif(current_setting('role', true), 'none'), current_user), actor,
          case when coalesce((not app) and actor like 'claude:%', false) then 'claude' else 'blocked-delete' end, old.data, old.deleted, true);
  if coalesce((not app) and actor like 'claude:%', false) then return old; end if;
  raise exception 'Records are never removed. Hide one with deleted=true from the app, or declare: select set_config(''emerald.actor'', ''claude: <what the owner asked>'', true);' using errcode = '42501';
end $$;

drop trigger if exists records_y_nodelete on public.records;
create trigger records_y_nodelete before delete on public.records for each row execute function public.records_y_nodelete();
