-- Ordlista för ingrediensnamn: låter er rätta namn som tolkas fel/olämpligt
-- (t.ex. AI-importens "obestämd singular"-regel som gör "bönor" till
-- "böna") en gång, varpå det tillämpas automatiskt på alla framtida
-- importer/manuella tillägg — och uppdaterar befintliga recept direkt.
-- Kör i Supabase Dashboard -> SQL Editor -> New query -> Run

create table if not exists ingredient_aliases (
  id uuid primary key default gen_random_uuid(),
  alias text not null unique,
  canonical text not null,
  created_at timestamptz not null default now()
);

alter table ingredient_aliases enable row level security;

drop policy if exists "allow all ingredient_aliases" on ingredient_aliases;
create policy "allow all ingredient_aliases" on ingredient_aliases for all using (true) with check (true);
