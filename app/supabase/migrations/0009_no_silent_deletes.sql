-- No record is ever deleted by the app on its own, and no deletion ever destroys what the record held.
--
-- What went wrong (2026-11-19): a device whose local copy had lost the Nexder lists pushed "known to the cloud but missing here" as deletions
-- (reconcile, stamped with an old contact time). 36 designs, 3 designers and 2 categories were tombstoned with data = null, so the content was gone.
--
-- Rules, enforced here so that stale tabs, old app versions, hard refreshes and reconcile pushes cannot break them:
--   1. A deletion by the app (signed-in role) is accepted only when it carries a person's stamp  data._del = {at: ms, ...}  that the app adds
--      to deletions made by someone using Emerald. A deletion without it (reconcile, a stale device, an old bundle) is put back, and recorded.
--   2. A deletion never empties the row: the old content stays in `data` (next to the stamp), so Restore is always possible.
--   3. Every deletion, accepted or refused, lands in public.record_history with the full old row (no app role can edit that table).
--   4. A Claude session (database role) may delete only after declaring it:  select set_config('emerald.actor', 'claude: <what the owner asked>', true);
--
-- Runs after records_lww and before records_z_guard (the spool weight guard), alphabetically.

create or replace function public.records_y_tombstone() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  actor text := nullif(current_setting('emerald.actor', true), '');
  app boolean := coalesce(nullif(current_setting('role', true), 'none'), '') in ('authenticated', 'anon') or auth.uid() is not null;
  claude boolean := (not app) and actor like 'claude:%';
  stamp jsonb := case when jsonb_typeof(new.data) = 'object' then new.data->'_del' end;
  at_ms numeric;
  now_ms numeric := extract(epoch from clock_timestamp()) * 1000;
  human boolean := false;
  verdict text := 'ok';
begin
  if tg_op = 'INSERT' then
    -- an upsert of an existing row is judged by the UPDATE that follows; a brand-new row has nothing to lose
    return new;
  end if;

  -- a row coming back to life drops its old delete stamp
  if old.deleted and not new.deleted then
    if jsonb_typeof(new.data) = 'object' and new.data ? '_del' then new.data := new.data - '_del'; end if;
    return new;
  end if;
  if not (new.deleted and not old.deleted) then return new; end if;

  -- a deletion
  if jsonb_typeof(stamp) = 'object' then
    at_ms := nullif(stamp->>'at', '')::numeric;
    -- made in the last 30 days (an offline device may send it late), not from the future (5 min clock slack)
    human := at_ms is not null and at_ms between now_ms - 30 * 86400000::numeric and now_ms + 300000;
  end if;

  if app and not human and new.id !~ '^[a-z]{1,3}[0-9]{1,3}$' then   -- (ids like s1, c4, o7 are leftover demo rows)
    verdict := 'blocked-delete';
    new.deleted := false;
    new.data := old.data;
  else
    if claude then verdict := 'claude'; end if;
    -- keep the content: the row is hidden, never emptied
    new.data := coalesce(old.data, '{}'::jsonb) || case when jsonb_typeof(new.data) = 'object' then new.data else '{}'::jsonb end;
  end if;

  insert into public.record_history (org, kind, id, uid, role, actor, verdict, old_data, new_data, old_deleted, new_deleted)
  values (new.org, new.kind, new.id, auth.uid(), coalesce(nullif(current_setting('role', true), 'none'), current_user), actor, verdict, old.data, new.data, old.deleted, new.deleted);
  return new;
end $$;

drop trigger if exists records_y_tombstone on public.records;
create trigger records_y_tombstone before insert or update on public.records for each row execute function public.records_y_tombstone();

-- Nothing on the record_history table can be changed or removed by an app role (0008 revoked it); make sure of that for every role that is not the owner.
revoke insert, update, delete, truncate on public.record_history from anon, authenticated;
