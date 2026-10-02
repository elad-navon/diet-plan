-- Added sugar per meal (grams, one decimal): the person's own measure of sugar that is not part of the food
-- (docs/DIABETES.md). Null = not known (older meals, or foods the database has no sugar value for).
--
-- For a meal built from database foods the app sums the estimated added sugar of its items; for a manual meal the
-- person may type it. The functions below are the same as before plus this one column (CREATE OR REPLACE keeps
-- their privileges).

alter table public.meals
  add column added_sugar_g numeric(5, 1) check (added_sugar_g between 0 and 500);

create or replace function public.add_meal(p jsonb) returns public.meals
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
    id, user_id, eaten_at, tz, slot, name, kcal, protein_g, carbs_g, fat_g, items, added_sugar_g, source, food_db_version
  ) values (
    meal_id, uid, (p ->> 'eaten_at')::timestamptz, prof.timezone, p ->> 'slot', btrim(p ->> 'name'),
    (p ->> 'kcal')::int, (p ->> 'protein_g')::numeric(5, 1), (p ->> 'carbs_g')::numeric(5, 1),
    (p ->> 'fat_g')::numeric(5, 1), coalesce(p -> 'items', '[]'::jsonb),
    (p ->> 'added_sugar_g')::numeric(5, 1), p ->> 'source',
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
     or existing.added_sugar_g is distinct from (p ->> 'added_sugar_g')::numeric(5, 1)
     or existing.items is distinct from coalesce(p -> 'items', '[]'::jsonb) then
    raise exception 'id_conflict';
  end if;
  return existing;
end $$;

create or replace function public.update_meal(p_id uuid, p_base_version int, p_patch jsonb) returns public.meals
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
    added_sugar_g = case when p_patch ? 'added_sugar_g' then (p_patch ->> 'added_sugar_g')::numeric(5, 1) else added_sugar_g end,
    eaten_at  = new_time,
    -- An explicitly edited time is read in the user's current zone.
    tz        = case when new_time is distinct from current_row.eaten_at then prof.timezone else tz end
  where id = p_id
  returning * into result;
  return result;
end $$;
