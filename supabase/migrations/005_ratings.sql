-- Betyg (1-5 grisnosar 🐽) per recept, ett för Sanna och ett för Anton.
-- Kör i Supabase Dashboard -> SQL Editor -> New query -> Run

alter table recipes add column if not exists rating_sanna smallint;
alter table recipes add column if not exists rating_anton smallint;
