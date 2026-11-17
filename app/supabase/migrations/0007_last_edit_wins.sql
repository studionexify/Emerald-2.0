-- Two devices change the same record: the NEWER EDIT wins, not whoever reaches the cloud last.
-- `edited_at` is when the edit was made (the device's clock, never later than now). A write older than what the cloud already has is skipped.
-- Old app versions send no edit time, so for them it is "now" and nothing changes. Existing rows stay null and count as their updated_at.
alter table public.records add column if not exists edited_at timestamptz;

create or replace function public.records_lww() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.edited_at := least(coalesce(new.edited_at, clock_timestamp()), clock_timestamp());
  if tg_op = 'UPDATE' and new.edited_at < coalesce(old.edited_at, old.updated_at) then return null; end if;
  return new;
end $$;

-- Fires before records_touch (alphabetical order), so a skipped write changes nothing, including updated_at.
drop trigger if exists records_lww on public.records;
create trigger records_lww before insert or update on public.records for each row execute function public.records_lww();
