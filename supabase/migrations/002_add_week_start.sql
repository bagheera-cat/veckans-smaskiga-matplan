-- Lägg till datum på veckoplaner (för historik och återanvändning)
-- Kör i Supabase Dashboard -> SQL Editor -> New query -> Run

alter table weekly_plans add column if not exists week_start date;
create index if not exists weekly_plans_week_start_idx on weekly_plans (week_start desc nulls last);
