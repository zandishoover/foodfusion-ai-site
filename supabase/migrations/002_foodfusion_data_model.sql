-- FoodFusion scalable application data model.
-- Raw scan photos and payment card details are intentionally not stored.

create extension if not exists pgcrypto;

alter table public.profiles
  add column if not exists onboarding_completed boolean not null default false,
  add column if not exists avatar_url text,
  add column if not exists deleted_at timestamptz;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  food_styles text[] not null default '{}',
  disliked_ingredients text[] not null default '{}',
  equipment text[] not null default array['stove', 'microwave'],
  default_servings integer not null default 2 check (default_servings between 1 and 24),
  recipe_source text not null default 'hybrid',
  macro_lock text,
  nutrition_goals jsonb not null default '{}'::jsonb,
  household jsonb not null default '{}'::jsonb,
  budget_goals jsonb not null default '{}'::jsonb,
  notification_preferences jsonb not null default '{"recipeIdeas":true,"groceryReminders":true,"orderUpdates":true,"fusionUpdates":false}'::jsonb,
  notifications_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'weekly', 'monthly', 'yearly')),
  status text not null default 'inactive' check (status in ('inactive', 'active', 'cancelled', 'expired')),
  started_at timestamptz,
  renews_at timestamptz,
  cancelled_at timestamptz,
  provider text not null default 'mvp_local',
  external_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (source in ('openai', 'local_sample', 'manual')),
  status text not null default 'completed' check (status in ('pending', 'completed', 'failed')),
  recipe_type text not null default 'Meals' check (recipe_type in ('Meals', 'Smoothies', 'Protein Shakes', 'Drinks')),
  scan_mode text not null default 'photo',
  image_retained boolean not null default false,
  image_object_path text,
  error_message text,
  ingredient_count integer not null default 0 check (ingredient_count >= 0),
  preferences_snapshot jsonb not null default '{}'::jsonb,
  favorite boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

comment on column public.scans.image_object_path is 'Optional storage path only. Never store a base64 scan image in this table.';

create table if not exists public.scan_ingredients (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  confidence numeric(5,4) check (confidence between 0 and 1),
  estimated_quantity text,
  notes text,
  freshness text check (freshness is null or freshness in ('fresh', 'use soon', 'almost expired')),
  created_at timestamptz not null default now(),
  unique (scan_id, name),
  foreign key (scan_id, user_id) references public.scans(id, user_id) on delete cascade
);

create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scan_id uuid,
  title text not null,
  recipe_type text not null check (recipe_type in ('Meals', 'Smoothies', 'Protein Shakes', 'Drinks')),
  source text not null default 'local' check (source in ('openai', 'recipe_mcp', 'local')),
  prep_minutes integer check (prep_minutes is null or prep_minutes >= 0),
  cook_minutes integer check (cook_minutes is null or cook_minutes >= 0),
  servings integer check (servings is null or servings > 0),
  ingredients jsonb not null default '[]'::jsonb,
  steps jsonb not null default '[]'::jsonb,
  macros jsonb not null default '{}'::jsonb,
  missing_ingredients jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (scan_id, user_id) references public.scans(id, user_id) on delete cascade
);

create table if not exists public.user_recipes (
  user_id uuid not null references auth.users(id) on delete cascade,
  recipe_id uuid not null,
  is_favorite boolean not null default false,
  favorite_folder text,
  rating text check (rating is null or rating in ('loved', 'fine', 'never')),
  feedback text check (feedback is null or feedback in ('yes', 'nah')),
  saved_at timestamptz,
  last_opened_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, recipe_id),
  foreign key (recipe_id, user_id) references public.recipes(id, user_id) on delete cascade
);

create table if not exists public.pantry_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  quantity text,
  expires_on date,
  freshness text not null default 'fresh' check (freshness in ('fresh', 'use soon', 'almost expired')),
  is_low boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.grocery_list_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  checked boolean not null default false,
  source_recipe_id uuid,
  created_at timestamptz not null default now(),
  unique (user_id, name),
  foreign key (source_recipe_id, user_id) references public.recipes(id, user_id) on delete cascade
);

create table if not exists public.shopping_carts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'ordered', 'abandoned')),
  fulfillment_mode text not null default 'Delivery' check (fulfillment_mode in ('Delivery', 'Pickup')),
  store_name text,
  promo_code text,
  subtotal numeric(10,2) not null default 0 check (subtotal >= 0),
  estimated_fees numeric(10,2) not null default 0 check (estimated_fees >= 0),
  estimated_tax numeric(10,2) not null default 0 check (estimated_tax >= 0),
  estimated_total numeric(10,2) not null default 0 check (estimated_total >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create unique index if not exists shopping_carts_one_active_per_user_idx
  on public.shopping_carts(user_id) where status = 'active';

create table if not exists public.shopping_cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  external_product_id text,
  product_name text not null,
  store_name text not null,
  size text,
  unit_price numeric(10,2) not null check (unit_price >= 0),
  quantity integer not null default 1 check (quantity > 0),
  eta text,
  product_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (cart_id, user_id) references public.shopping_carts(id, user_id) on delete cascade
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cart_id uuid,
  external_order_id text,
  integration_source text not null default 'local' check (integration_source in ('local', 'instacart')),
  store_name text not null,
  fulfillment_mode text not null check (fulfillment_mode in ('Delivery', 'Pickup')),
  status text not null default 'order_placed',
  eta text,
  subtotal numeric(10,2) not null default 0 check (subtotal >= 0),
  estimated_fees numeric(10,2) not null default 0 check (estimated_fees >= 0),
  estimated_tax numeric(10,2) not null default 0 check (estimated_tax >= 0),
  total numeric(10,2) not null default 0 check (total >= 0),
  tracking_payload jsonb not null default '{}'::jsonb,
  placed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (cart_id, user_id) references public.shopping_carts(id, user_id) on delete restrict
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  product_name text not null,
  store_name text not null,
  size text,
  unit_price numeric(10,2) not null check (unit_price >= 0),
  quantity integer not null default 1 check (quantity > 0),
  product_payload jsonb not null default '{}'::jsonb,
  foreign key (order_id, user_id) references public.orders(id, user_id) on delete cascade
);

create table if not exists public.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null,
  status_label text not null,
  event_payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  foreign key (order_id, user_id) references public.orders(id, user_id) on delete cascade
);

create table if not exists public.meal_plan_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_date date not null,
  meal_slot text not null default 'Dinner',
  recipe_id uuid,
  recipe_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, plan_date, meal_slot),
  foreign key (recipe_id, user_id) references public.recipes(id, user_id) on delete cascade
);

create table if not exists public.recent_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  query text not null,
  search_type text not null check (search_type in ('grocery', 'ingredient', 'recipe', 'global')),
  searched_at timestamptz not null default now()
);

create table if not exists public.feedback_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  email text not null,
  rating integer check (rating between 1 and 5),
  worked_well text,
  confusing text,
  additions text,
  bug_report text,
  submitted_at timestamptz not null default now()
);

create index if not exists scans_user_created_idx on public.scans(user_id, created_at desc);
create index if not exists scan_ingredients_scan_idx on public.scan_ingredients(scan_id);
create index if not exists recipes_user_type_created_idx on public.recipes(user_id, recipe_type, created_at desc);
create index if not exists user_recipes_favorites_idx on public.user_recipes(user_id, is_favorite, updated_at desc);
create index if not exists pantry_items_user_expiration_idx on public.pantry_items(user_id, expires_on);
create index if not exists carts_user_updated_idx on public.shopping_carts(user_id, updated_at desc);
create index if not exists cart_items_user_cart_idx on public.shopping_cart_items(user_id, cart_id);
create index if not exists orders_user_placed_idx on public.orders(user_id, placed_at desc);
create index if not exists order_items_user_order_idx on public.order_items(user_id, order_id);
create index if not exists order_events_user_order_time_idx on public.order_events(user_id, order_id, occurred_at);
create index if not exists searches_user_recent_idx on public.recent_searches(user_id, searched_at desc);

drop trigger if exists user_preferences_updated_at on public.user_preferences;
create trigger user_preferences_updated_at before update on public.user_preferences
  for each row execute function public.set_updated_at();
drop trigger if exists subscriptions_updated_at on public.subscriptions;
create trigger subscriptions_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();
drop trigger if exists user_recipes_updated_at on public.user_recipes;
create trigger user_recipes_updated_at before update on public.user_recipes
  for each row execute function public.set_updated_at();
drop trigger if exists pantry_items_updated_at on public.pantry_items;
create trigger pantry_items_updated_at before update on public.pantry_items
  for each row execute function public.set_updated_at();
drop trigger if exists shopping_carts_updated_at on public.shopping_carts;
create trigger shopping_carts_updated_at before update on public.shopping_carts
  for each row execute function public.set_updated_at();
drop trigger if exists shopping_cart_items_updated_at on public.shopping_cart_items;
create trigger shopping_cart_items_updated_at before update on public.shopping_cart_items
  for each row execute function public.set_updated_at();
drop trigger if exists orders_updated_at on public.orders;
create trigger orders_updated_at before update on public.orders
  for each row execute function public.set_updated_at();
drop trigger if exists meal_plan_entries_updated_at on public.meal_plan_entries;
create trigger meal_plan_entries_updated_at before update on public.meal_plan_entries
  for each row execute function public.set_updated_at();

alter table public.user_preferences enable row level security;
alter table public.subscriptions enable row level security;
alter table public.scans enable row level security;
alter table public.scan_ingredients enable row level security;
alter table public.recipes enable row level security;
alter table public.user_recipes enable row level security;
alter table public.pantry_items enable row level security;
alter table public.grocery_list_items enable row level security;
alter table public.shopping_carts enable row level security;
alter table public.shopping_cart_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_events enable row level security;
alter table public.meal_plan_entries enable row level security;
alter table public.recent_searches enable row level security;
alter table public.feedback_submissions enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'user_preferences', 'scans', 'scan_ingredients', 'recipes',
    'user_recipes', 'pantry_items', 'grocery_list_items', 'shopping_carts',
    'shopping_cart_items', 'meal_plan_entries',
    'recent_searches', 'feedback_submissions'
  ]
  loop
    execute format('drop policy if exists "Owners manage %1$s" on public.%1$I', table_name);
    execute format(
      'create policy "Owners manage %1$s" on public.%1$I for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',
      table_name
    );
  end loop;
end;
$$;

drop policy if exists "Owners view subscriptions" on public.subscriptions;
create policy "Owners view subscriptions"
  on public.subscriptions for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Owners manage orders" on public.orders;
drop policy if exists "Owners view orders" on public.orders;
drop policy if exists "Owners create local orders" on public.orders;
drop policy if exists "Owners update local orders" on public.orders;
drop policy if exists "Owners delete local orders" on public.orders;
create policy "Owners view orders" on public.orders for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Owners create local orders" on public.orders for insert to authenticated
  with check ((select auth.uid()) = user_id and integration_source = 'local');
create policy "Owners update local orders" on public.orders for update to authenticated
  using ((select auth.uid()) = user_id and integration_source = 'local')
  with check ((select auth.uid()) = user_id and integration_source = 'local');
create policy "Owners delete local orders" on public.orders for delete to authenticated
  using ((select auth.uid()) = user_id and integration_source = 'local');

drop policy if exists "Owners manage order_items" on public.order_items;
drop policy if exists "Owners view order items" on public.order_items;
drop policy if exists "Owners manage local order items" on public.order_items;
create policy "Owners view order items" on public.order_items for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Owners manage local order items" on public.order_items for all to authenticated
  using (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.orders
      where orders.id = order_items.order_id
        and orders.user_id = order_items.user_id
        and orders.integration_source = 'local'
    )
  )
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.orders
      where orders.id = order_items.order_id
        and orders.user_id = order_items.user_id
        and orders.integration_source = 'local'
    )
  );

drop policy if exists "Owners manage order_events" on public.order_events;
drop policy if exists "Owners view order events" on public.order_events;
drop policy if exists "Owners manage local order events" on public.order_events;
create policy "Owners view order events" on public.order_events for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Owners manage local order events" on public.order_events for all to authenticated
  using (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.orders
      where orders.id = order_events.order_id
        and orders.user_id = order_events.user_id
        and orders.integration_source = 'local'
    )
  )
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.orders
      where orders.id = order_events.order_id
        and orders.user_id = order_events.user_id
        and orders.integration_source = 'local'
    )
  );

revoke all on table public.profiles from anon, authenticated;
grant select, update on table public.profiles to authenticated;

revoke all on table
  public.user_preferences,
  public.subscriptions,
  public.scans,
  public.scan_ingredients,
  public.recipes,
  public.user_recipes,
  public.pantry_items,
  public.grocery_list_items,
  public.shopping_carts,
  public.shopping_cart_items,
  public.orders,
  public.order_items,
  public.order_events,
  public.meal_plan_entries,
  public.recent_searches,
  public.feedback_submissions
from anon, authenticated;

grant select, insert, update, delete on table
  public.user_preferences,
  public.scans,
  public.scan_ingredients,
  public.recipes,
  public.user_recipes,
  public.pantry_items,
  public.grocery_list_items,
  public.shopping_carts,
  public.shopping_cart_items,
  public.orders,
  public.order_items,
  public.order_events,
  public.meal_plan_entries,
  public.recent_searches,
  public.feedback_submissions
to authenticated;

grant select on table public.subscriptions to authenticated;

insert into public.user_preferences (user_id)
select id from auth.users
on conflict (user_id) do nothing;

insert into public.subscriptions (user_id)
select id from auth.users
on conflict (user_id) do nothing;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', ''),
    coalesce(new.email, '')
  )
  on conflict (id) do update set
    name = excluded.name,
    email = excluded.email,
    updated_at = now();

  insert into public.user_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  insert into public.subscriptions (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;
