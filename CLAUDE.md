# Middagsbanken / Veckans Smaskiga Matplan

Ett recept- och veckoplaneringsverktyg för ett hushåll. Statisk enfils
HTML-app (`index.html`), hostad på GitHub Pages, med Supabase (Postgres)
som databas.

## Arkitektur

- **Frontend**: `index.html` — vanilla JS, inget byggsteg, ingen
  dependency utöver Google Fonts. Hostas på GitHub Pages (deployar
  automatiskt vid push till `main`).
- **Databas**: Supabase Postgres. Anon/publishable-nyckeln ligger direkt
  i klientkoden (avsiktligt — RLS-policyerna tillåter fullt läs/skriv
  för den som har nyckeln; det är ett litet privat verktyg delat via en
  länk, inte en app med riktig multi-tenant-säkerhet).
- **AI-import**: en Supabase Edge Function (`supabase/functions/import-recipe`)
  tar emot en receptlänk eller en bas64-bild, anropar Anthropics API
  (Claude Haiku) för att tolka ut strukturerad receptdata, och returnerar
  JSON till klienten. API-nyckeln ligger som en Supabase-secret
  (`ANTHROPIC_API_KEY`), aldrig i klientkoden.

**Varför inte en Claude-artifact?** Artifacts kör i en CSP-sandlåda som
blockerar `fetch()` till externa domäner (utom ett fåtal CDN:er), så en
artifact kan inte prata med Supabase. Därför är sidan hostad fristående
i stället.

## Databasschema

Se `supabase/migrations/` — kör dem i ordning i Supabase SQL Editor.
Det finns ingen migrationsrunner kopplad, filerna är bara dokumentation
+ det som faktiskt kördes manuellt.

- `recipes` — namn, taggar, anteckningar, källänk, senast lagad-datum
- `recipe_ingredients` — namn, mängd, enhet, kategori, kopplat till recipe_id
- `weekly_plans` — veckostart-datum, etikett, array av recipe_ids (historik)

## Edge Function-deploy

Koden i `supabase/functions/import-recipe/index.ts` är källan, men måste
deployas manuellt via Supabase Dashboard (Edge Functions → skapa/redigera
funktionen och klistra in koden) eftersom den här sessionen inte har
Supabase CLI-åtkomst till projektet. `ANTHROPIC_API_KEY` sätts som secret
i Project Settings → Edge Functions → Secrets.

## Hosting

GitHub Pages, branch `main`, root. Push till `main` = automatisk deploy,
tar ~1 minut.
