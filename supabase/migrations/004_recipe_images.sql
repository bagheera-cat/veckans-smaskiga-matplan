-- Bild på recept: kolumn för bild-URL + en Storage-bucket att ladda upp till.
-- Kör i Supabase Dashboard -> SQL Editor -> New query -> Run

alter table recipes add column if not exists image_url text;

-- Skapa en publik bucket för receptbilder (om den inte redan finns).
insert into storage.buckets (id, name, public)
values ('recipe-images', 'recipe-images', true)
on conflict (id) do nothing;

-- Samma modell som resten av appen: fullt läs/skriv för den som har
-- anon/publishable-nyckeln, eftersom det här är ett litet privat verktyg
-- delat via en länk, inte en app med riktig multi-tenant-säkerhet.
drop policy if exists "recipe-images public read" on storage.objects;
create policy "recipe-images public read"
  on storage.objects for select
  using (bucket_id = 'recipe-images');

drop policy if exists "recipe-images public insert" on storage.objects;
create policy "recipe-images public insert"
  on storage.objects for insert
  with check (bucket_id = 'recipe-images');

drop policy if exists "recipe-images public update" on storage.objects;
create policy "recipe-images public update"
  on storage.objects for update
  using (bucket_id = 'recipe-images');

drop policy if exists "recipe-images public delete" on storage.objects;
create policy "recipe-images public delete"
  on storage.objects for delete
  using (bucket_id = 'recipe-images');
