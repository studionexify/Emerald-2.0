-- The app has a "partner" role (full access except account management); allow it in the members table.
alter table public.members drop constraint if exists members_role_check;
alter table public.members add constraint members_role_check check (role in ('owner','partner','manager','operator','accountant','ca'));
