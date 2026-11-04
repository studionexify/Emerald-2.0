-- Emerald 2.0 cloud sync: one generic records table, membership-scoped RLS, realtime, and a tiny heartbeat.

create table public.members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  org text not null,
  role text not null default 'operator' check (role in ('owner','manager','operator','accountant','ca')),
  created_at timestamptz not null default now()
);
alter table public.members enable row level security;
create policy "members: read own" on public.members for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.my_org() returns text
language sql stable security definer set search_path = '' as $$
  select org from public.members where user_id = (select auth.uid())
$$;
revoke all on function public.my_org() from public, anon;
grant execute on function public.my_org() to authenticated;

create table public.records (
  org text not null,
  kind text not null,
  id text not null,
  data jsonb,
  deleted boolean not null default false,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid default auth.uid(),
  primary key (org, kind, id)
);
create index records_org_updated on public.records (org, updated_at);
alter table public.records enable row level security;
create policy "records: org read" on public.records for select to authenticated using (org = (select public.my_org()));
create policy "records: org insert" on public.records for insert to authenticated with check (org = (select public.my_org()));
create policy "records: org update" on public.records for update to authenticated using (org = (select public.my_org())) with check (org = (select public.my_org()));

create or replace function public.records_touch() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := clock_timestamp(); new.updated_by := auth.uid(); return new; end $$;
create trigger records_touch before insert or update on public.records for each row execute function public.records_touch();

alter publication supabase_realtime add table public.records;

-- Keep-alive: one row per day, overwritten in place, pruned after 30 days.
create table public.heartbeat (day date primary key, at timestamptz not null default now(), hits int not null default 1);
alter table public.heartbeat enable row level security;

create or replace function public.beat() returns void
language sql security definer set search_path = '' as $$
  insert into public.heartbeat (day) values (current_date)
    on conflict (day) do update set at = now(), hits = public.heartbeat.hits + 1;
  delete from public.heartbeat where day < current_date - 30;
$$;
revoke all on function public.beat() from public;
grant execute on function public.beat() to anon, authenticated;
