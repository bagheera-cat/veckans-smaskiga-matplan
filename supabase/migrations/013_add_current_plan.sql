-- Delad "pågående veckoplan": en enda rad som speglar vilka recept som är
-- valda just nu, portionsjusteringar, ikryssade inköpslistevaror och
-- kommentarer — tidigare levde allt det bara i sidans minne (JS-variabler)
-- och försvann vid omladdning, och gick inte att dela mellan mobil/dator
-- eller mellan två personer. Nu sparas det löpande (debounced, se
-- scheduleDraftSave i index.html) till den här tabellen i stället, så alla
-- som öppnar sidan ser samma pågående plan.
-- Kör i Supabase Dashboard -> SQL Editor -> New query -> Run

create table if not exists current_plan (
  id int primary key default 1,
  selected_ids uuid[] not null default '{}',
  week_servings jsonb not null default '{}',
  -- checked_shop-nycklarna är text (ingrediensnamn+enhet, se shopItemKey i
  -- index.html), inte uuid.
  checked_shop text[] not null default '{}',
  shop_comments jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  constraint current_plan_singleton check (id = 1)
);

insert into current_plan (id) values (1) on conflict (id) do nothing;

alter table current_plan enable row level security;

drop policy if exists "allow all current_plan" on current_plan;
create policy "allow all current_plan" on current_plan for all using (true) with check (true);
