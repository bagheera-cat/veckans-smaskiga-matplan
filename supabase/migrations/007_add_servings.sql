-- Lägg till antal portioner på recept
-- Kör i Supabase Dashboard -> SQL Editor -> New query -> Run

alter table recipes add column if not exists servings int;
