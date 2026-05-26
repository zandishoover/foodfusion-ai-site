-- Stable offline-to-cloud synchronization for FoodFusion mobile data.
-- Photos and payment card details remain intentionally excluded.

alter table public.user_preferences
  add column if not exists shopping_location jsonb not null default '{}'::jsonb;

alter table public.scans
  add column if not exists client_id text;

create unique index if not exists scans_user_client_id_idx
  on public.scans(user_id, client_id)
  where client_id is not null;

alter table public.recipes
  add column if not exists client_id text;

create unique index if not exists recipes_user_client_id_idx
  on public.recipes(user_id, client_id)
  where client_id is not null;

create unique index if not exists orders_user_external_order_id_idx
  on public.orders(user_id, external_order_id)
  where external_order_id is not null;
