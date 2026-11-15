-- 1) Role rules enforced by the database (until now only the screens enforced them).
-- 2) One server-side invoice counter per series, so two devices can never issue the same number.

-- Which role may read / write which record kind. Unlisted kinds are ordinary shop data (orders, clients, stock…).
create or replace function public.my_role() returns text
language sql stable security definer set search_path = '' as $$
  select role from public.members where user_id = (select auth.uid()) and active
$$;
revoke all on function public.my_role() from public, anon;
grant execute on function public.my_role() to authenticated;

-- Money books: only owner, partner, accountant (the CA reads none of these except via invoices/bills below).
create or replace function public.can_read_kind(k text) returns boolean
language sql stable set search_path = '' as $$
  select case
    when (select public.my_role()) is null then false
    when (select public.my_role()) in ('owner','partner') then true
    when k in ('money','statement','accounts','opening','loans','assets','goals','mauny-cats') then (select public.my_role()) = 'accountant'
    when (select public.my_role()) = 'ca' then k in ('invoices','invoiceDrafts','bills','expenses','gstFiled','business','hsn','users','migrations')
    else true end
$$;

create or replace function public.can_write_kind(k text) returns boolean
language sql stable set search_path = '' as $$
  select case
    when (select public.my_role()) is null then false
    when (select public.my_role()) in ('owner','partner') then true
    when k in ('users','business','session','loginAttempts','migrations') then false
    when k in ('money','statement','accounts','opening','loans','assets','goals','bills','mauny-cats','invoices') then (select public.my_role()) = 'accountant'
    when k = 'gstFiled' then (select public.my_role()) in ('accountant','ca')
    when k = 'invoiceDrafts' then false
    else (select public.my_role()) <> 'ca' end
$$;

drop policy if exists "records: org read" on public.records;
drop policy if exists "records: org insert" on public.records;
drop policy if exists "records: org update" on public.records;
create policy "records: role read" on public.records for select to authenticated
  using (org = (select public.my_org()) and (select public.can_read_kind(kind)));
create policy "records: role insert" on public.records for insert to authenticated
  with check (org = (select public.my_org()) and (select public.can_write_kind(kind)));
create policy "records: role update" on public.records for update to authenticated
  using (org = (select public.my_org()) and (select public.can_write_kind(kind)))
  with check (org = (select public.my_org()) and (select public.can_write_kind(kind)));

-- Invoice numbers: atomic counter per org and series prefix (e.g. 'B-'). p_min is the highest number this device already knows
-- (covers invoices issued before the counter existed); the result is the next free number.
create table if not exists public.invoice_counters (
  org text not null, prefix text not null, n int not null default 0,
  primary key (org, prefix)
);
alter table public.invoice_counters enable row level security;  -- no policies: only the function below touches it

create or replace function public.claim_invoice_no(p_prefix text, p_min int) returns int
language plpgsql security definer set search_path = '' as $$
declare o text := (select public.my_org()); v int;
begin
  if o is null or (select public.my_role()) not in ('owner','partner','accountant') then raise exception 'not allowed'; end if;
  insert into public.invoice_counters as c (org, prefix, n) values (o, p_prefix, greatest(p_min, 0) + 1)
    on conflict (org, prefix) do update set n = greatest(c.n, greatest(p_min, 0)) + 1
    returning n into v;
  return v;
end $$;
revoke all on function public.claim_invoice_no(text, int) from public, anon;
grant execute on function public.claim_invoice_no(text, int) to authenticated;
