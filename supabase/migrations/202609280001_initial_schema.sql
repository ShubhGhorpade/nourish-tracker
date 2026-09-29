create extension if not exists pgcrypto;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  timezone text,
  locale text,
  country text,
  preferred_units text not null default 'metric' check (preferred_units in ('metric','us')),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- V1 cloud backup/sync row. The normalized tables below are the durable schema foundation;
-- the local-first client can move to record-level sync without a destructive migration.
create table if not exists public.user_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.data_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  provider_key text,
  quality text not null check (quality in ('verified','authoritative','community','manual','estimated')),
  license text,
  attribution text,
  created_at timestamptz not null default now(),
  unique(user_id, provider_key)
);

create table if not exists public.foods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  brand text,
  kind text not null check (kind in ('generic','branded','personal','recipe')),
  aliases text[] not null default '{}',
  verified_at timestamptz,
  last_used_at timestamptz,
  use_count integer not null default 0 check (use_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.source_foods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  food_id uuid not null references public.foods(id) on delete cascade,
  data_source_id uuid not null references public.data_sources(id) on delete restrict,
  external_id text,
  source_name text not null,
  source_version text,
  raw_json jsonb,
  retrieved_at timestamptz not null default now(),
  unique(user_id, data_source_id, external_id)
);

create table if not exists public.barcodes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  food_id uuid not null references public.foods(id) on delete cascade,
  code text not null,
  verified boolean not null default false,
  updated_at timestamptz not null default now(),
  unique(user_id, code)
);

create table if not exists public.nutrient_definitions (
  code text primary key,
  name text not null,
  unit text not null
);

insert into public.nutrient_definitions(code,name,unit) values
  ('energyKcal','Energy','kcal'),('proteinG','Protein','g'),('carbsG','Carbohydrate','g'),('fatG','Fat','g'),
  ('fiberG','Fiber','g'),('saturatedFatG','Saturated fat','g'),('sodiumMg','Sodium','mg'),('sugarG','Total sugar','g'),
  ('addedSugarG','Added sugar','g'),('potassiumMg','Potassium','mg'),('calciumMg','Calcium','mg'),('ironMg','Iron','mg'),('vitaminDMcg','Vitamin D','mcg')
on conflict(code) do nothing;

create table if not exists public.nutrition_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  food_id uuid not null references public.foods(id) on delete cascade,
  source_food_id uuid references public.source_foods(id) on delete set null,
  basis_amount numeric not null default 100 check (basis_amount > 0),
  basis_unit text not null default 'g',
  quality text not null check (quality in ('verified','authoritative','community','manual','estimated')),
  effective_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.nutrient_values (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nutrition_record_id uuid not null references public.nutrition_records(id) on delete cascade,
  nutrient_code text not null references public.nutrient_definitions(code) on delete restrict,
  value numeric,
  is_missing boolean not null default false,
  unique(nutrition_record_id, nutrient_code),
  check ((is_missing and value is null) or (not is_missing and value is not null and value >= 0))
);

create table if not exists public.servings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  food_id uuid not null references public.foods(id) on delete cascade,
  label text not null,
  grams numeric not null check (grams > 0),
  source text not null check (source in ('database','label','user','recipe')),
  created_at timestamptz not null default now()
);

create table if not exists public.meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  meal_type text not null check (meal_type in ('breakfast','lunch','dinner','snack')),
  eaten_at timestamptz not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.meal_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  meal_id uuid not null references public.meals(id) on delete cascade,
  food_id uuid references public.foods(id) on delete set null,
  recipe_id uuid,
  recipe_version_id uuid,
  name text not null,
  brand text,
  amount_g numeric not null check (amount_g > 0),
  quantity_label text not null,
  nutrition_per_100g_snapshot jsonb not null,
  nutrition_snapshot jsonb not null,
  source_snapshot jsonb not null,
  confidence_snapshot jsonb not null,
  estimate_range jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  aliases text[] not null default '{}',
  current_version_id uuid,
  use_count integer not null default 0,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.recipe_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  version integer not null check (version > 0),
  finished_weight_g numeric check (finished_weight_g > 0),
  yield_count numeric check (yield_count > 0),
  yield_unit text,
  total_nutrition_snapshot jsonb not null,
  notes text,
  created_at timestamptz not null default now(),
  unique(recipe_id, version)
);

alter table public.recipes drop constraint if exists recipes_current_version_fk;
alter table public.recipes add constraint recipes_current_version_fk foreign key(current_version_id) references public.recipe_versions(id) deferrable initially deferred;
alter table public.meal_items drop constraint if exists meal_items_recipe_fk;
alter table public.meal_items add constraint meal_items_recipe_fk foreign key(recipe_id) references public.recipes(id) on delete set null;
alter table public.meal_items drop constraint if exists meal_items_recipe_version_fk;
alter table public.meal_items add constraint meal_items_recipe_version_fk foreign key(recipe_version_id) references public.recipe_versions(id) on delete set null;

create table if not exists public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  recipe_version_id uuid not null references public.recipe_versions(id) on delete cascade,
  food_id uuid references public.foods(id) on delete set null,
  name text not null,
  amount_g numeric not null check (amount_g > 0),
  household_amount numeric,
  household_unit text,
  preparation_state text check (preparation_state in ('raw','cooked','unknown')),
  nutrition_per_100g_snapshot jsonb not null,
  source_snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  meal_id uuid references public.meals(id) on delete cascade,
  storage_path text,
  retention_policy text not null default 'transient' check (retention_policy in ('transient','keep')),
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  model text not null,
  model_version text,
  task_type text not null,
  input_hash text,
  structured_output jsonb,
  latency_ms integer,
  input_tokens integer,
  output_tokens integer,
  estimated_cost_usd numeric,
  created_at timestamptz not null default now()
);

create table if not exists public.corrections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ai_run_id uuid references public.ai_runs(id) on delete set null,
  meal_item_id uuid references public.meal_items(id) on delete cascade,
  field text not null,
  original_value jsonb,
  corrected_value jsonb,
  correction_type text,
  created_at timestamptz not null default now()
);

create table if not exists public.personal_defaults (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  food_id uuid references public.foods(id) on delete cascade,
  food_key text not null,
  context text not null default 'any',
  typical_amount_g numeric not null check (typical_amount_g > 0),
  observations numeric[] not null default '{}',
  observation_count integer not null default 0,
  confidence text not null check (confidence in ('high','medium','low')),
  last_used_at timestamptz not null default now(),
  unique(user_id, food_key, context)
);

create index if not exists foods_user_name_idx on public.foods(user_id, lower(name));
create index if not exists foods_user_last_used_idx on public.foods(user_id, last_used_at desc);
create index if not exists barcodes_user_code_idx on public.barcodes(user_id, code);
create index if not exists meals_user_eaten_idx on public.meals(user_id, eaten_at desc);
create index if not exists recipe_versions_recipe_idx on public.recipe_versions(recipe_id, version desc);
create index if not exists personal_defaults_user_food_idx on public.personal_defaults(user_id, food_key);

-- Every user-owned table is isolated by auth.uid(). The frontend's anon key alone cannot read another user's rows.
do $$
declare tbl text;
begin
  foreach tbl in array array[
    'profiles','user_state','data_sources','foods','source_foods','barcodes','nutrition_records','nutrient_values','servings',
    'meals','meal_items','recipes','recipe_versions','recipe_ingredients','photos','ai_runs','corrections','personal_defaults'
  ] loop
    execute format('alter table public.%I enable row level security', tbl);
    execute format('drop policy if exists owner_all on public.%I', tbl);
    execute format('create policy owner_all on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)', tbl);
  end loop;
end $$;

alter table public.nutrient_definitions enable row level security;
drop policy if exists authenticated_read_nutrients on public.nutrient_definitions;
create policy authenticated_read_nutrients on public.nutrient_definitions for select to authenticated using (true);
