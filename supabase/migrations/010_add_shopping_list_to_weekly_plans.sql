-- Spara en ögonblicksbild av inköpslistan (som text) tillsammans med
-- veckoplanen, så att historiken kan visa exakt vad som handlades den
-- veckan — även efter att recept ändrats, tagits bort eller kommentarer
-- och kryss i inköpslistan nollställts.
-- Kör i Supabase Dashboard -> SQL Editor -> New query -> Run

alter table weekly_plans add column if not exists shopping_list text;
