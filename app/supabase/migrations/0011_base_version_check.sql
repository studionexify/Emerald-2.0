-- Base-version checking: a device may not overwrite what it never saw.
--
-- Every row has a revision (rev, +1 on every write). A device sends the rev it last saw (base_rev) and the list of top-level keys its edit
-- changed (chg). When base_rev is behind the cloud's rev:
--   * tagged edit (chg present)  -> ONLY those keys are applied onto the cloud row; every other field keeps the cloud's value. Logged 'merged-stale'.
--                                  (Two people editing different fields both survive. Same field: the later arrival wins and the other value is in record_history.
--                                   Array fields such as order items are one key, so they collide as a whole.)
--   * untagged edit (reconcile, full sync, old bundles that send a base) -> refused, the attempted row is kept in record_history ('blocked-stale'),
--                                  and the device takes the cloud copy.
--   * a person's stamped deletion skips the check (the content is kept anyway, see 0009).
-- A payload that does not send base_rev at all (an old app bundle) is not checked, exactly as before.
-- Only the app's roles are checked; a Claude session / maintenance caller is governed by 0009/0010.

alter table public.records add column if not exists rev bigint not null default 1;
alter table public.records add column if not exists base_rev bigint;
alter table public.records add column if not exists chg jsonb;

create or replace function public.records_a_rev() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  app boolean := coalesce(nullif(current_setting('role', true), 'none'), '') in ('authenticated', 'anon') or auth.uid() is not null;
  merged jsonb;
  k text;
  tagged boolean;
begin
  if tg_op = 'INSERT' then
    -- an upsert of an existing row is judged by the UPDATE that follows and needs base_rev/chg to reach it; a brand-new row starts clean
    if not exists (select 1 from public.records r where r.org = new.org and r.kind = new.kind and r.id = new.id) then
      new.rev := 1; new.base_rev := null; new.chg := null;
    end if;
    return new;
  end if;

  if app and new.base_rev is not null and new.base_rev < old.rev
     and not (new.deleted and not old.deleted and jsonb_typeof(new.data) = 'object' and new.data ? '_del') then
    tagged := jsonb_typeof(new.chg) = 'array' and jsonb_array_length(new.chg) > 0 and jsonb_typeof(new.data) = 'object' and jsonb_typeof(old.data) = 'object';
    if tagged then
      merged := old.data;
      for k in select jsonb_array_elements_text(new.chg) loop
        if new.data ? k then merged := jsonb_set(merged, array[k], new.data->k, true); else merged := merged - k; end if;
      end loop;
      insert into public.record_history (org, kind, id, uid, role, verdict, old_data, new_data, old_deleted, new_deleted)
      values (new.org, new.kind, new.id, auth.uid(), 'authenticated', 'merged-stale', old.data, new.data, old.deleted, new.deleted);
      new.data := merged;
      new.edited_at := clock_timestamp();            -- a merged write is a fresh edit of the cloud row (so last-edit-wins does not drop it)
    else
      insert into public.record_history (org, kind, id, uid, role, verdict, old_data, new_data, old_deleted, new_deleted)
      values (new.org, new.kind, new.id, auth.uid(), 'authenticated', 'blocked-stale', old.data, new.data, old.deleted, new.deleted);
      return null;                                   -- the device takes the cloud copy
    end if;
  end if;

  new.rev := old.rev + 1; new.base_rev := null; new.chg := null;
  return new;
end $$;

-- Runs before records_lww (alphabetical), so a skipped or merged write is decided on the base first.
drop trigger if exists records_a_rev on public.records;
create trigger records_a_rev before insert or update on public.records for each row execute function public.records_a_rev();
