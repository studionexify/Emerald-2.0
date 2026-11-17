-- Nexder (design library): small preview pictures in a private bucket; the real files live in Google Drive (nexder-drive function).
-- Free-plan guard: previews are capped at 300 KB each and only JPEG, so 1 GB holds thousands.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('nexder-previews', 'nexder-previews', false, 307200, array['image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = 307200, allowed_mime_types = array['image/jpeg'];

-- Paths are "<org>/<photo id>.jpg". Everyone in the organisation (except the CA) may read; owner, partner and manager may write.
create policy "nexder previews: read" on storage.objects for select to authenticated
  using (bucket_id = 'nexder-previews' and (storage.foldername(name))[1] = (select public.my_org()) and (select public.my_role()) <> 'ca');
create policy "nexder previews: insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'nexder-previews' and (storage.foldername(name))[1] = (select public.my_org()) and (select public.my_role()) in ('owner','partner','manager'));
create policy "nexder previews: update" on storage.objects for update to authenticated
  using (bucket_id = 'nexder-previews' and (storage.foldername(name))[1] = (select public.my_org()) and (select public.my_role()) in ('owner','partner','manager'))
  with check (bucket_id = 'nexder-previews' and (storage.foldername(name))[1] = (select public.my_org()) and (select public.my_role()) in ('owner','partner','manager'));
create policy "nexder previews: delete" on storage.objects for delete to authenticated
  using (bucket_id = 'nexder-previews' and (storage.foldername(name))[1] = (select public.my_org()) and (select public.my_role()) in ('owner','partner','manager'));

-- Used by the nexder-drive function (service role only) before it deletes anything from Drive:
-- true while any live design, or any Bin entry, still mentions this Drive id.
create or replace function public.nexder_referenced(p_org text, p_id text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.records r where r.org = p_org and not r.deleted and r.kind in ('nexderDesigns', 'bin') and r.data::text like '%' || p_id || '%')
$$;
revoke all on function public.nexder_referenced(text, text) from public, anon, authenticated;
