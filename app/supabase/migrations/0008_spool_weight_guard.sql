-- Spool weights change only by a person, never by the app on its own.
--
-- What counts as a person:
--   * A signed-in user doing something in Emerald (weigh-in, audit count, stock movement, new spool, empty/delete).
--     The app stamps exactly those edits with  data.wAt (ms since epoch), data.wBy, data.wVia.
--     A write whose weight fields differ from the cloud copy but carries no NEWER stamp is not a person:
--     it is a stale device copy, a reconcile push, an old app version or a background fix-up.
--     Its weight fields are put back to the cloud copy (the rest of the row still saves) and the attempt is recorded.
--   * A Claude session acting on the owner's explicit decision, through the database role (never the app's roles),
--     and only after it declares itself:  select set_config('emerald.actor', 'claude: <what the owner asked>', true);
-- Print-run usage lives in its own `consumption` rows, so orders/Floor keep deducting filament as before.
--
-- Every spool change (allowed or blocked) lands in public.record_history, which no app role can edit.

create table if not exists public.record_history (
  hid bigserial primary key,
  org text not null,
  kind text not null,
  id text not null,
  at timestamptz not null default clock_timestamp(),
  uid uuid,
  role text,
  actor text,
  verdict text not null,          -- 'ok' | 'blocked-weight' | 'blocked-delete' | 'claude'
  old_data jsonb,
  new_data jsonb,
  old_deleted boolean,
  new_deleted boolean
);
create index if not exists record_history_rec on public.record_history (org, kind, id, at desc);
alter table public.record_history enable row level security;
drop policy if exists "history: org read" on public.record_history;
create policy "history: org read" on public.record_history for select to authenticated using (org = (select public.my_org()));
revoke insert, update, delete, truncate on public.record_history from anon, authenticated;

create or replace function public.records_z_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  w text[] := array['grams','gross','tare','size'];
  k text;
  changed boolean := false;
  actor text := nullif(current_setting('emerald.actor', true), '');
  -- security definer makes current_user the owner; the caller's role is in the 'role' setting
  app boolean := coalesce(nullif(current_setting('role', true), 'none'), '') in ('authenticated', 'anon') or auth.uid() is not null;
  claude boolean := (not app) and actor like 'claude:%';
  old_at numeric; new_at numeric; now_ms numeric := extract(epoch from clock_timestamp()) * 1000;
  stamped boolean;
  verdict text := 'ok';
begin
  if new.kind <> 'spools' then return new; end if;

  if tg_op = 'INSERT' then
    -- an upsert of an existing row is judged by the UPDATE that follows
    if exists (select 1 from public.records r where r.org = new.org and r.kind = new.kind and r.id = new.id) then return new; end if;
    insert into public.record_history (org, kind, id, uid, role, actor, verdict, new_data, new_deleted)
    values (new.org, new.kind, new.id, auth.uid(), coalesce(nullif(current_setting('role', true), 'none'), current_user), actor, case when claude then 'claude' else 'ok' end, new.data, new.deleted);
    return new;
  end if;

  old_at := nullif(old.data->>'wAt', '')::numeric;
  new_at := nullif(new.data->>'wAt', '')::numeric;
  -- a person's edit: a stamp newer than the cloud's, not from the future (5 min clock slack)
  stamped := new_at is not null and new_at > coalesce(old_at, 0) and new_at <= now_ms + 300000;

  if not claude then
    -- 1. weight fields
    if old.data is not null and new.data is not null and not new.deleted then
      foreach k in array w loop
        if (new.data->k) is distinct from (old.data->k) then changed := true; end if;
      end loop;
      if changed and not stamped then
        foreach k in array w loop
          if old.data ? k then new.data := jsonb_set(new.data, array[k], old.data->k);
          else new.data := new.data - k; end if;
        end loop;
        new.data := new.data - 'wAt' - 'wBy' - 'wVia';
        if old.data ? 'wAt' then new.data := new.data || jsonb_build_object('wAt', old.data->'wAt', 'wBy', old.data->'wBy', 'wVia', old.data->'wVia'); end if;
        verdict := 'blocked-weight';
      end if;
    end if;
    -- 2. deleting a spool that still holds filament needs a person: a fresh stamp on the last copy or a Bin entry for it
    if new.deleted and not old.deleted and coalesce((old.data->>'grams')::numeric, 0) > 0
       and not exists (select 1 from public.records b where b.org = new.org and b.kind = 'bin' and b.updated_at > clock_timestamp() - interval '1 hour' and strpos(b.data::text, new.id) > 0) then
      new.deleted := false; new.data := old.data; verdict := 'blocked-delete';
    end if;
  else
    verdict := 'claude';
  end if;

  if verdict <> 'ok' or changed or new.deleted is distinct from old.deleted then
    insert into public.record_history (org, kind, id, uid, role, actor, verdict, old_data, new_data, old_deleted, new_deleted)
    values (new.org, new.kind, new.id, auth.uid(), coalesce(nullif(current_setting('role', true), 'none'), current_user), actor, verdict, old.data, new.data, old.deleted, new.deleted);
  end if;
  return new;
end $$;

-- Runs after records_lww (alphabetical), so writes skipped as older never reach it.
drop trigger if exists records_z_guard on public.records;
create trigger records_z_guard before insert or update on public.records for each row execute function public.records_z_guard();
