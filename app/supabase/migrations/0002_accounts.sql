-- Owner-managed username accounts. Sign-ups are disabled; only the admin-users Edge Function creates logins.
alter table public.members add column username text unique, add column name text not null default '', add column active boolean not null default true;
-- Everyone in a business can see its roster (fills "who did this?" pickers); only the Edge Function writes it.
drop policy "members: read own" on public.members;
create policy "members: org read" on public.members for select to authenticated using (org = (select public.my_org()));
alter publication supabase_realtime add table public.members;
