-- Spara receptnamnen som text i veckoplanens historik, så att namnet
-- finns kvar i historiken även om receptet senare tas bort helt.
-- Kör i Supabase Dashboard -> SQL Editor -> New query -> Run

alter table weekly_plans add column if not exists recipe_names text[];

-- Backfill: fyll i namnen för befintliga veckoplaner utifrån de recept
-- som fortfarande finns kvar just nu (recept som redan tagits bort innan
-- den här migreringen kördes går tyvärr inte att återskapa namnet för).
update weekly_plans wp
set recipe_names = (
  select array_agg(coalesce(r.name, '') order by t.ord)
  from unnest(wp.recipe_ids) with ordinality as t(id, ord)
  left join recipes r on r.id = t.id
)
where recipe_names is null;
