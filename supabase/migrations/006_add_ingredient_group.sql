-- Lägg till gruppnamn på ingredienser, för recept med flera delar
-- (t.ex. en huvudrätt + en separat sås/dressing/aioli som listas för sig).
-- Kör i Supabase Dashboard -> SQL Editor -> New query -> Run

alter table recipe_ingredients add column if not exists group_name text;
