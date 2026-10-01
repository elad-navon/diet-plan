-- Diet plan - initial schema (docs/DATA_MODEL.md, docs/SECURITY_PLAN.md).
--
-- Principles
--   * Every table is protected by row level security: a user only ever sees their own rows.
--   * Clients can only READ the core tables directly. Every write that has rules (meals, plans,
--     profile, weigh-ins) goes through a SECURITY DEFINER function that takes the user from auth.uid()
--     and never from the request body.
--   * `local_date` is derived here, from the instant and the user's time zone - never trusted from the client.
--   * Writes are idempotent (client-generated ids) and use version numbers to detect edits from another device.
--
-- Run this file once in the Supabase SQL editor (or with `supabase db push`).

-- ---------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------

-- Same rules as validateSchedule() in src/core/schedule: 3-4 meal windows with known ids, each id once,
-- increasing windows in time order that do not overlap, positive weights that add up to 1.
create function public._valid_schedule(s jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
begin
  if jsonb_typeof(s) is distinct from 'array' or jsonb_array_length(s) not between 3 and 4 then
    return false;
  end if;
  if exists (
    select 1 from jsonb_array_elements(s) e
    where (
      jsonb_typeof(e) = 'object'
      and (e ->> 'id') in ('breakfast', 'lunch', 'snack', 'dinner')
      and (e ->> 'start') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      and (e ->> 'end') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      and (e ->> 'start') < (e ->> 'end')
      and jsonb_typeof(e -> 'weight') = 'number'
    ) is not true
  ) then
    return false;
  end if;
  if (select count(distinct e ->> 'id') from jsonb_array_elements(s) e) <> jsonb_array_length(s) then
    return false;
  end if;
  if exists (
    select 1 from (
      select e ->> 'start' as starts, lag(e ->> 'end') over (order by ord) as previous_end
      from jsonb_array_elements(s) with ordinality as t (e, ord)
    ) windows
    where previous_end is not null and starts < previous_end
  ) then
    return false;
  end if;
  if exists (select 1 from jsonb_array_elements(s) e where (e ->> 'weight')::numeric <= 0) then
    return false;
  end if;
  return abs((select sum((e ->> 'weight')::numeric) from jsonb_array_elements(s) e) - 1) <= 0.001;
end $$;

create table public.profiles (
  user_id           uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  sex               text not null check (sex in ('female', 'male', 'unspecified')),
  birth_date        date not null,
  height_cm         numeric(4, 1) not null check (height_cm between 120 and 230),
  timezone          text not null,
  disclaimer_ack_at timestamptz not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  version           int not null default 1
);

-- A target in force from `effective_from` on. Rows are never rewritten for past days, so changing the
-- profile or goal later cannot change history (docs/DATA_MODEL.md E.2).
create table public.target_plans (
  id             uuid primary key,
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  effective_from date not null,
  engine_version text not null,
  goal_type      text not null check (goal_type in ('lose', 'maintain')),
  kcal_target    int not null check (kcal_target between 1200 and 6000),
  kcal_floor     int not null check (kcal_floor between 1200 and 1500),
  protein_g      int check (protein_g between 0 and 1000),
  carbs_g        int check (carbs_g between 0 and 1000),
  fat_g          int check (fat_g between 0 and 1000),
  macro_state    text not null check (macro_state in ('ok', 'relaxed', 'low_carb', 'conflict')),
  schedule       jsonb not null check (public._valid_schedule(schedule)),
  inputs         jsonb not null check (jsonb_typeof(inputs) = 'object'),
  result         jsonb not null check (jsonb_typeof(result) = 'object'),
  created_at     timestamptz not null default now(),
  unique (user_id, effective_from),
  -- Macro targets are all present or all absent; absent exactly when no safe split exists.
  check ((protein_g is null) = (carbs_g is null) and (carbs_g is null) = (fat_g is null)),
  check ((macro_state = 'conflict') = (protein_g is null))
);

create table public.weight_entries (
  id          uuid primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  measured_at timestamptz not null,
  tz          text not null,
  local_date  date not null,
  weight_kg   numeric(4, 1) not null check (weight_kg between 30 and 350),
  version     int not null default 1,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, local_date)
);

create table public.meals (
  id              uuid primary key,
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  eaten_at        timestamptz not null,
  tz              text not null,
  local_date      date not null,
  slot            text not null check (slot in ('breakfast', 'lunch', 'snack', 'dinner', 'other')),
  name            text not null check (char_length(btrim(name)) between 1 and 80 and name !~ '[<>[:cntrl:]]'),
  kcal            int not null check (kcal between 0 and 3000),
  protein_g       numeric(5, 1) check (protein_g between 0 and 500),
  carbs_g         numeric(5, 1) check (carbs_g between 0 and 500),
  fat_g           numeric(5, 1) check (fat_g between 0 and 500),
  items           jsonb not null default '[]'
                  check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) <= 30 and pg_column_size(items) <= 16384),
  source          text not null check (source in ('food_db', 'manual', 'favorite', 'copy')),
  food_db_version text,
  entered_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  version         int not null default 1,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- Macros are all present or all absent (a partial set would skew the day's totals).
  check ((protein_g is null) = (carbs_g is null) and (carbs_g is null) = (fat_g is null))
);
create index meals_user_day_idx on public.meals (user_id, local_date) where deleted_at is null;
create index meals_user_eaten_idx on public.meals (user_id, eaten_at, id);

create table public.favorites (
  id              uuid primary key,
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name            text not null check (char_length(btrim(name)) between 1 and 80 and name !~ '[<>[:cntrl:]]'),
  kcal            int not null check (kcal between 0 and 3000),
  protein_g       numeric(5, 1) check (protein_g between 0 and 500),
  carbs_g         numeric(5, 1) check (carbs_g between 0 and 500),
  fat_g           numeric(5, 1) check (fat_g between 0 and 500),
  items           jsonb not null default '[]'
                  check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) <= 30 and pg_column_size(items) <= 16384),
  food_db_version text,
  use_count       int not null default 0,
  last_used_at    timestamptz,
  version         int not null default 1,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check ((protein_g is null) = (carbs_g is null) and (carbs_g is null) = (fat_g is null))
);

-- Written only by triggers: who changed what, with before/after.
create table public.audit_events (
  id        bigint generated always as identity primary key,
  user_id   uuid not null references auth.users (id) on delete cascade,
  entity    text not null,
  entity_id uuid,
  action    text not null check (action in ('insert', 'update', 'delete')),
  before    jsonb,
  after     jsonb,
  at        timestamptz not null default now()
);
create index audit_events_user_idx on public.audit_events (user_id, at);

-- ---------------------------------------------------------------------------------------------
-- Trigger functions
-- ---------------------------------------------------------------------------------------------

create function public._require_user() returns uuid
language plpgsql stable set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;
  return uid;
end $$;

create function public._valid_timezone(tz text) returns boolean
language sql stable set search_path = '' as $$
  select exists (select 1 from pg_catalog.pg_timezone_names where name = tz)
$$;

-- Meals: derive local_date from (eaten_at, tz); keep the time inside the allowed window.
create function public.tg_meals_derive() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not public._valid_timezone(new.tz) then
    raise exception 'invalid_timezone';
  end if;
  if tg_op = 'INSERT' or new.eaten_at is distinct from old.eaten_at then
    if new.eaten_at > now() + interval '5 minutes' then
      raise exception 'eaten_at_in_future';
    end if;
    if new.eaten_at < now() - interval '31 days' then
      raise exception 'eaten_at_too_old';
    end if;
  end if;
  new.local_date := (new.eaten_at at time zone new.tz)::date;
  return new;
end $$;

-- Weigh-ins: same idea.
create function public.tg_weights_derive() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not public._valid_timezone(new.tz) then
    raise exception 'invalid_timezone';
  end if;
  if (tg_op = 'INSERT' or new.measured_at is distinct from old.measured_at)
     and new.measured_at > now() + interval '5 minutes' then
    raise exception 'measured_at_in_future';
  end if;
  new.local_date := (new.measured_at at time zone new.tz)::date;
  return new;
end $$;

-- Columns that must never change after creation.
create function public.tg_guard_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.user_id is distinct from old.user_id
     or new.created_at is distinct from old.created_at then
    raise exception 'immutable_column';
  end if;
  return new;
end $$;

create function public.tg_guard_meal_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.entered_at is distinct from old.entered_at
     or new.source is distinct from old.source then
    raise exception 'immutable_column';
  end if;
  return new;
end $$;

-- Version + timestamp on every update (the client's value is ignored).
create function public.tg_bump_version() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end $$;

-- At most 60 active meals per day. Runs on every insert/update, because moving a meal to another day or
-- restoring a deleted one adds to that day too. The advisory lock makes two simultaneous inserts for the same
-- user and day take turns, so both cannot slip past the count.
create function public.tg_limit_meals() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.deleted_at is not null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.deleted_at is null and new.local_date = old.local_date then
    return new; -- the meal already counts for this day
  end if;
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text || ':' || new.local_date::text, 0));
  if (
    select count(*) from public.meals m
    where m.user_id = new.user_id and m.local_date = new.local_date
      and m.deleted_at is null and m.id <> new.id
  ) >= 60 then
    raise exception 'limit_reached';
  end if;
  return new;
end $$;

-- At most 200 favorites.
create function public.tg_limit_favorites() returns trigger
language plpgsql set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('favorites:' || new.user_id::text, 0));
  if (select count(*) from public.favorites f where f.user_id = new.user_id) >= 200 then
    raise exception 'limit_reached';
  end if;
  return new;
end $$;

-- Audit trail. Runs with the owner's rights so users cannot write or tamper with it.
create function public.tg_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := coalesce(case when tg_op = 'DELETE' then old.user_id else new.user_id end);
  row_json jsonb := to_jsonb(case when tg_op = 'DELETE' then old else new end);
begin
  -- Deleting the account cascades to these rows after the user is already gone.
  if tg_op = 'DELETE' and not exists (select 1 from auth.users u where u.id = owner_id) then
    return old;
  end if;
  insert into public.audit_events (user_id, entity, entity_id, action, before, after)
  values (
    owner_id,
    tg_table_name,
    coalesce(row_json ->> 'id', row_json ->> 'user_id')::uuid,
    lower(tg_op),
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );
  return case when tg_op = 'DELETE' then old else new end;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------------------------

create trigger meals_derive before insert or update on public.meals
  for each row execute function public.tg_meals_derive();
create trigger meals_immutable before update on public.meals
  for each row execute function public.tg_guard_immutable();
create trigger meals_immutable_more before update on public.meals
  for each row execute function public.tg_guard_meal_immutable();
create trigger meals_version before update on public.meals
  for each row execute function public.tg_bump_version();
create trigger meals_limit before insert or update on public.meals
  for each row execute function public.tg_limit_meals();

create trigger weights_derive before insert or update on public.weight_entries
  for each row execute function public.tg_weights_derive();
create trigger weights_immutable before update on public.weight_entries
  for each row execute function public.tg_guard_immutable();
create trigger weights_version before update on public.weight_entries
  for each row execute function public.tg_bump_version();

create trigger favorites_limit before insert on public.favorites
  for each row execute function public.tg_limit_favorites();
create trigger favorites_immutable before update on public.favorites
  for each row execute function public.tg_guard_immutable();
create trigger favorites_version before update on public.favorites
  for each row execute function public.tg_bump_version();

create trigger profiles_immutable before update on public.profiles
  for each row execute function public.tg_guard_immutable();
create trigger profiles_version before update on public.profiles
  for each row execute function public.tg_bump_version();

create trigger meals_audit after insert or update or delete on public.meals
  for each row execute function public.tg_audit();
create trigger weights_audit after insert or update or delete on public.weight_entries
  for each row execute function public.tg_audit();
create trigger favorites_audit after insert or update or delete on public.favorites
  for each row execute function public.tg_audit();
create trigger profiles_audit after insert or update or delete on public.profiles
  for each row execute function public.tg_audit();
create trigger plans_audit after insert or update or delete on public.target_plans
  for each row execute function public.tg_audit();

-- ---------------------------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------------------------

alter table public.profiles       enable row level security;
alter table public.target_plans   enable row level security;
alter table public.weight_entries enable row level security;
alter table public.meals          enable row level security;
alter table public.favorites      enable row level security;
alter table public.audit_events   enable row level security;

-- Read-only for the owner (all writes go through the functions below).
create policy profiles_select on public.profiles
  for select to authenticated using (user_id = (select auth.uid()));
create policy plans_select on public.target_plans
  for select to authenticated using (user_id = (select auth.uid()));
create policy meals_select on public.meals
  for select to authenticated using (user_id = (select auth.uid()));
create policy audit_select on public.audit_events
  for select to authenticated using (user_id = (select auth.uid()));

-- Full control of their own rows (WITH CHECK stops moving a row to someone else).
create policy weights_all on public.weight_entries
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy favorites_all on public.favorites
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------------------------
-- Functions (the only write path for profile, plans and meals)
-- ---------------------------------------------------------------------------------------------

create function public.save_profile(p jsonb) returns public.profiles
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public._require_user();
  tz text := p ->> 'timezone';
  born date := (p ->> 'birth_date')::date;
  result public.profiles;
begin
  if not public._valid_timezone(tz) then
    raise exception 'invalid_timezone';
  end if;
  if born > ((now() at time zone tz)::date - interval '18 years') then
    raise exception 'age_under_18';
  end if;
  insert into public.profiles (user_id, sex, birth_date, height_cm, timezone, disclaimer_ack_at)
  values (uid, p ->> 'sex', born, (p ->> 'height_cm')::numeric, tz, (p ->> 'disclaimer_ack_at')::timestamptz)
  on conflict (user_id) do update
    set sex = excluded.sex,
        birth_date = excluded.birth_date,
        height_cm = excluded.height_cm,
        timezone = excluded.timezone
  returning * into result;
  return result;
end $$;

create function public.save_plan(p jsonb) returns public.target_plans
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public._require_user();
  prof public.profiles;
  starts date := (p ->> 'effective_from')::date;
  result public.target_plans;
begin
  select * into prof from public.profiles where user_id = uid;
  if not found then
    raise exception 'no_profile';
  end if;
  -- History is immutable: a plan can only start today (in the user's zone) or later.
  if starts < (now() at time zone prof.timezone)::date then
    raise exception 'plan_in_past';
  end if;
  insert into public.target_plans (
    id, user_id, effective_from, engine_version, goal_type, kcal_target, kcal_floor,
    protein_g, carbs_g, fat_g, macro_state, schedule, inputs, result
  ) values (
    (p ->> 'id')::uuid, uid, starts, p ->> 'engine_version', p ->> 'goal_type',
    (p ->> 'kcal_target')::int, (p ->> 'kcal_floor')::int,
    (p ->> 'protein_g')::int, (p ->> 'carbs_g')::int, (p ->> 'fat_g')::int,
    p ->> 'macro_state', p -> 'schedule', p -> 'inputs', p -> 'result'
  )
  on conflict (user_id, effective_from) do update
    set id = excluded.id,
        engine_version = excluded.engine_version,
        goal_type = excluded.goal_type,
        kcal_target = excluded.kcal_target,
        kcal_floor = excluded.kcal_floor,
        protein_g = excluded.protein_g,
        carbs_g = excluded.carbs_g,
        fat_g = excluded.fat_g,
        macro_state = excluded.macro_state,
        schedule = excluded.schedule,
        inputs = excluded.inputs,
        result = excluded.result
  returning * into result;
  return result;
end $$;

create function public.add_meal(p jsonb) returns public.meals
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public._require_user();
  prof public.profiles;
  meal_id uuid := (p ->> 'id')::uuid;
  created public.meals;
  existing public.meals;
begin
  select * into prof from public.profiles where user_id = uid;
  if not found then
    raise exception 'no_profile';
  end if;

  insert into public.meals (
    id, user_id, eaten_at, tz, slot, name, kcal, protein_g, carbs_g, fat_g, items, source, food_db_version
  ) values (
    meal_id, uid, (p ->> 'eaten_at')::timestamptz, prof.timezone, p ->> 'slot', btrim(p ->> 'name'),
    (p ->> 'kcal')::int, (p ->> 'protein_g')::numeric(5, 1), (p ->> 'carbs_g')::numeric(5, 1),
    (p ->> 'fat_g')::numeric(5, 1), coalesce(p -> 'items', '[]'::jsonb), p ->> 'source',
    p ->> 'food_db_version'
  )
  on conflict (id) do nothing
  returning * into created;
  if found then
    return created;
  end if;

  -- The same request again (retry, double click) returns the same meal. Anything else under that id,
  -- including someone else's meal, is a conflict - and says nothing about whose it is.
  select * into existing from public.meals where id = meal_id and user_id = uid;
  if not found
     or existing.name is distinct from btrim(p ->> 'name')
     or existing.kcal is distinct from (p ->> 'kcal')::int
     or existing.eaten_at is distinct from (p ->> 'eaten_at')::timestamptz
     or existing.slot is distinct from p ->> 'slot'
     or existing.source is distinct from p ->> 'source'
     or existing.protein_g is distinct from (p ->> 'protein_g')::numeric(5, 1)
     or existing.carbs_g is distinct from (p ->> 'carbs_g')::numeric(5, 1)
     or existing.fat_g is distinct from (p ->> 'fat_g')::numeric(5, 1)
     or existing.items is distinct from coalesce(p -> 'items', '[]'::jsonb) then
    raise exception 'id_conflict';
  end if;
  return existing;
end $$;

create function public.update_meal(p_id uuid, p_base_version int, p_patch jsonb) returns public.meals
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public._require_user();
  prof public.profiles;
  current_row public.meals;
  result public.meals;
  new_time timestamptz;
begin
  select * into prof from public.profiles where user_id = uid;
  if not found then
    raise exception 'no_profile';
  end if;
  select * into current_row from public.meals where id = p_id and user_id = uid for update;
  if not found then
    raise exception 'not_found';
  end if;
  if current_row.version <> p_base_version then
    raise exception 'version_conflict';
  end if;

  new_time := case when p_patch ? 'eaten_at' then (p_patch ->> 'eaten_at')::timestamptz else current_row.eaten_at end;
  update public.meals set
    name      = case when p_patch ? 'name' then btrim(p_patch ->> 'name') else name end,
    kcal      = case when p_patch ? 'kcal' then (p_patch ->> 'kcal')::int else kcal end,
    slot      = case when p_patch ? 'slot' then p_patch ->> 'slot' else slot end,
    protein_g = case when p_patch ? 'protein_g' then (p_patch ->> 'protein_g')::numeric(5, 1) else protein_g end,
    carbs_g   = case when p_patch ? 'carbs_g' then (p_patch ->> 'carbs_g')::numeric(5, 1) else carbs_g end,
    fat_g     = case when p_patch ? 'fat_g' then (p_patch ->> 'fat_g')::numeric(5, 1) else fat_g end,
    items     = case when p_patch ? 'items' then coalesce(p_patch -> 'items', '[]'::jsonb) else items end,
    eaten_at  = new_time,
    -- An explicitly edited time is read in the user's current zone.
    tz        = case when new_time is distinct from current_row.eaten_at then prof.timezone else tz end
  where id = p_id
  returning * into result;
  return result;
end $$;

create function public.delete_meal(p_id uuid, p_base_version int) returns public.meals
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public._require_user();
  current_row public.meals;
  result public.meals;
begin
  select * into current_row from public.meals where id = p_id and user_id = uid for update;
  if not found then
    raise exception 'not_found';
  end if;
  if current_row.deleted_at is not null then
    return current_row; -- deleting twice is harmless
  end if;
  if current_row.version <> p_base_version then
    raise exception 'version_conflict';
  end if;
  update public.meals set deleted_at = now() where id = p_id returning * into result;
  return result;
end $$;

create function public.restore_meal(p_id uuid, p_base_version int) returns public.meals
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public._require_user();
  current_row public.meals;
  result public.meals;
begin
  select * into current_row from public.meals where id = p_id and user_id = uid for update;
  if not found then
    raise exception 'not_found';
  end if;
  if current_row.deleted_at is null then
    return current_row;
  end if;
  if current_row.version <> p_base_version then
    raise exception 'version_conflict';
  end if;
  update public.meals set deleted_at = null where id = p_id returning * into result;
  return result;
end $$;

create function public.upsert_weight(p jsonb) returns public.weight_entries
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public._require_user();
  prof public.profiles;
  result public.weight_entries;
begin
  select * into prof from public.profiles where user_id = uid;
  if not found then
    raise exception 'no_profile';
  end if;
  insert into public.weight_entries (id, user_id, measured_at, tz, weight_kg)
  values ((p ->> 'id')::uuid, uid, (p ->> 'measured_at')::timestamptz, prof.timezone, (p ->> 'weight_kg')::numeric(4, 1))
  on conflict (user_id, local_date) do update
    set weight_kg = excluded.weight_kg, measured_at = excluded.measured_at
  returning * into result;
  return result;
end $$;

-- How often each food was logged recently (for search ranking). Runs as the caller, so RLS applies.
create function public.food_usage(p_days int default 120)
returns table (food_id text, uses bigint)
language sql stable security invoker set search_path = '' as $$
  select item ->> 'foodId', count(*)
  from public.meals m, jsonb_array_elements(m.items) as item
  where m.deleted_at is null
    and m.eaten_at >= now() - make_interval(days => p_days)
    and item ->> 'foodId' is not null
  group by 1
$$;

-- Bumps the use counter of a favorite. Runs as the caller, so row level security still applies.
create function public.mark_favorite_used(p_id uuid) returns void
language sql security invoker set search_path = '' as $$
  update public.favorites
  set use_count = use_count + 1, last_used_at = now()
  where id = p_id and user_id = (select auth.uid())
$$;

-- "Delete all my data": empties every table for the signed-in user but keeps the login itself.
-- The audit trail goes last, so no copy of the deleted data survives in it.
create function public.reset_my_data() returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public._require_user();
begin
  delete from public.meals where user_id = uid;
  delete from public.favorites where user_id = uid;
  delete from public.weight_entries where user_id = uid;
  delete from public.target_plans where user_id = uid;
  delete from public.profiles where user_id = uid;
  delete from public.audit_events where user_id = uid;
end $$;

-- Deletes the signed-in user's account and, through the foreign keys, everything stored for it.
create function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from auth.users where id = public._require_user();
end $$;

-- ---------------------------------------------------------------------------------------------
-- Privileges: start from nothing, grant only what is needed.
-- ---------------------------------------------------------------------------------------------

revoke all on all tables in schema public from public, anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
-- Supabase hands new objects to anon/authenticated by default; objects added in later migrations must not.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

grant select on public.profiles, public.target_plans, public.meals, public.audit_events to authenticated;
grant select, insert, update, delete on public.weight_entries, public.favorites to authenticated;

-- Used by the weigh-in trigger, which runs with the caller's rights when a weigh-in is written directly.
grant execute on function public._valid_timezone(text) to authenticated;

grant execute on function
  public.save_profile(jsonb),
  public.save_plan(jsonb),
  public.add_meal(jsonb),
  public.update_meal(uuid, int, jsonb),
  public.delete_meal(uuid, int),
  public.restore_meal(uuid, int),
  public.upsert_weight(jsonb),
  public.food_usage(int),
  public.mark_favorite_used(uuid),
  public.reset_my_data(),
  public.delete_my_account()
to authenticated;
