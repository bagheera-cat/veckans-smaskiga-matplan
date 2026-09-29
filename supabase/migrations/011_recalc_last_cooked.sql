-- Engångsrättning: räknar om "senast lagad"-datumet på recepten utifrån de
-- veckoplaner som faktiskt finns kvar i historiken just nu. Behövs eftersom
-- datumet tidigare inte uppdaterades när en veckoplan togs bort ur
-- historiken — appen (index.html, funktionen recalcLastCooked) sköter det
-- automatiskt framöver varje gång en veckoplan tas bort.
-- Kör i Supabase Dashboard -> SQL Editor -> New query -> Run

-- Sätt datumet till den senaste kvarvarande veckoplan som fortfarande
-- innehåller receptet.
update recipes r
set last_cooked_at = sub.newest
from (
  select unnest(wp.recipe_ids) as recipe_id, max(wp.created_at::date) as newest
  from weekly_plans wp
  group by unnest(wp.recipe_ids)
) sub
where sub.recipe_id = r.id
  and r.last_cooked_at is distinct from sub.newest;

-- Nollställ datumet för recept som inte längre finns med i någon
-- kvarvarande veckoplan alls.
update recipes r
set last_cooked_at = null
where last_cooked_at is not null
  and not exists (
    select 1 from weekly_plans wp where r.id = any(wp.recipe_ids)
  );
