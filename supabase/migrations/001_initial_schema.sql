-- Matplanering: schema för recept, ingredienser och veckoplaner
-- Kör hela detta i Supabase Dashboard -> SQL Editor -> New query -> Run

create extension if not exists pgcrypto;

-- Recept
create table if not exists recipes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tags text[] not null default '{}',
  notes text,
  source_url text,
  last_cooked_at date,
  created_at timestamptz not null default now()
);

-- Ingredienser per recept
create table if not exists recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references recipes(id) on delete cascade,
  name text not null,
  amount numeric,
  unit text,
  category text not null default 'Övrigt',
  sort_order int not null default 0
);

create index if not exists recipe_ingredients_recipe_id_idx on recipe_ingredients(recipe_id);

-- Historik över veckoplaner (vilka recept valdes en given vecka)
create table if not exists weekly_plans (
  id uuid primary key default gen_random_uuid(),
  week_label text not null,
  recipe_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

-- Detta är ett privat verktyg för ett hushåll, delat via en länk bara ni två har.
-- Vi slår på Row Level Security men tillåter full läs/skriv för alla som har
-- er anon-nyckel (den ligger inbäddad i sidan, inte publik på annat sätt).
alter table recipes enable row level security;
alter table recipe_ingredients enable row level security;
alter table weekly_plans enable row level security;

drop policy if exists "allow all recipes" on recipes;
create policy "allow all recipes" on recipes for all using (true) with check (true);

drop policy if exists "allow all recipe_ingredients" on recipe_ingredients;
create policy "allow all recipe_ingredients" on recipe_ingredients for all using (true) with check (true);

drop policy if exists "allow all weekly_plans" on weekly_plans;
create policy "allow all weekly_plans" on weekly_plans for all using (true) with check (true);
