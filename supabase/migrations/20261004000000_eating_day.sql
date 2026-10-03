-- The day of eating runs from 02:00 to 02:00 instead of midnight to midnight: a meal at 00:30 is the last
-- meal of the day before. The server derives `local_date` (never trusted from the client), so it has to
-- know the same rule as the app: the day of an instant is the date of its wall-clock time minus two hours.
-- Run this once in the Supabase SQL editor, before the app version that has the new rule goes live.

create or replace function public.tg_meals_derive() returns trigger
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
  new.local_date := ((new.eaten_at at time zone new.tz) - interval '2 hours')::date;
  return new;
end $$;

create or replace function public.tg_weights_derive() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not public._valid_timezone(new.tz) then
    raise exception 'invalid_timezone';
  end if;
  if (tg_op = 'INSERT' or new.measured_at is distinct from old.measured_at)
     and new.measured_at > now() + interval '5 minutes' then
    raise exception 'measured_at_in_future';
  end if;
  new.local_date := ((new.measured_at at time zone new.tz) - interval '2 hours')::date;
  return new;
end $$;

-- A plan can start today or later, and "today" is the day of eating too (before 02:00 it is still yesterday).
create or replace function public.save_plan(p jsonb) returns public.target_plans
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
  if starts < ((now() at time zone prof.timezone) - interval '2 hours')::date then
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

-- Meals already saved: the ones between midnight and 02:00 move to the day before. (The update trigger
-- derives the date again with the new rule, so the value written here is only what selects the rows.)
update public.meals
   set local_date = ((eaten_at at time zone tz) - interval '2 hours')::date
 where local_date is distinct from ((eaten_at at time zone tz) - interval '2 hours')::date;

-- Weigh-ins too. There is one per day, so if a weigh-in between midnight and 02:00 would now land on a day that
-- already has one, it stays where it was.
do $$
declare
  entry record;
begin
  for entry in
    select id, ((measured_at at time zone tz) - interval '2 hours')::date as day
      from public.weight_entries
     where local_date is distinct from ((measured_at at time zone tz) - interval '2 hours')::date
  loop
    begin
      update public.weight_entries set local_date = entry.day where id = entry.id;
    exception when unique_violation then
      null;
    end;
  end loop;
end $$;
