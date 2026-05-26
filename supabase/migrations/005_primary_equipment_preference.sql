-- Persist the primary cooking equipment choice used during recipe generation.

alter table public.user_preferences
  add column if not exists primary_equipment text not null default 'Stove';
