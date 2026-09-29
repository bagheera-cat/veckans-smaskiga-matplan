-- Förkorta enheten "förpackning" till "förp" på befintliga ingredienser,
-- så att den blir kortare i inköpslistan. Nya AI-importer använder redan
-- "förp" (se prompten i supabase/functions/import-recipe/index.ts).
-- Kör i Supabase Dashboard -> SQL Editor -> New query -> Run

update recipe_ingredients set unit = 'förp' where unit = 'förpackning';
