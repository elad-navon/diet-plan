-- The person's own products, saved from a nutrition label ("המוצרים שלי"): values per 100 g (or 100 ml), units such
-- as "פרוסה = 30 גרם", and the label's photo. A meal keeps its own copy of the values (its items), so changing or
-- deleting a product never changes a meal already eaten. Run this once in the Supabase SQL editor; until then
-- the app works as before and saving a product says it could not be saved.

create table public.products (
  id                uuid primary key,
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name              text not null check (char_length(btrim(name)) between 1 and 80 and name !~ '[<>[:cntrl:]]'),
  kcal_100          numeric(5, 1) not null check (kcal_100 between 0 and 900),
  protein_100       numeric(4, 1) not null check (protein_100 between 0 and 100),
  carbs_100         numeric(4, 1) not null check (carbs_100 between 0 and 100),
  fat_100           numeric(4, 1) not null check (fat_100 between 0 and 100),
  sugar_100         numeric(4, 1) check (sugar_100 between 0 and 100),
  fiber_100         numeric(4, 1) check (fiber_100 between 0 and 100),
  added_sugar_100   numeric(4, 1) check (added_sugar_100 between 0 and 100),
  -- Where the added sugar comes from: printed on the label, typed by the person, or estimated from the sugars.
  added_sugar_basis text check (added_sugar_basis in ('label', 'user', 'estimate')),
  grain             text check (grain in ('refined', 'whole')),
  basis             text not null default 'g' check (basis in ('g', 'ml')),
  -- [{"name": "פרוסה", "grams": 30}, ...]
  units             jsonb not null default '[]'
                    check (jsonb_typeof(units) = 'array' and jsonb_array_length(units) <= 10 and pg_column_size(units) <= 4096),
  version           int not null default 1,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (basis = 'ml' or protein_100 + carbs_100 + fat_100 <= 105),
  check (added_sugar_100 is null or added_sugar_basis is not null)
);

-- The label photo of a product: a small JPEG as a data URL (about 100-300 KB). Kept apart from the product so the
-- list of products stays light; it goes with its product (and with the account) by the foreign keys.
create table public.product_photos (
  id         uuid primary key references public.products (id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  data       text not null check (data like 'data:image/jpeg;base64,%' and char_length(data) <= 700000),
  created_at timestamptz not null default now()
);

-- At most 500 products.
create function public.tg_limit_products() returns trigger
language plpgsql set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('products:' || new.user_id::text, 0));
  if (select count(*) from public.products p where p.user_id = new.user_id) >= 500 then
    raise exception 'limit_reached';
  end if;
  return new;
end $$;

create trigger products_limit before insert on public.products
  for each row execute function public.tg_limit_products();
create trigger products_immutable before update on public.products
  for each row execute function public.tg_guard_immutable();
create trigger products_version before update on public.products
  for each row execute function public.tg_bump_version();
-- The photos are not audited: a copy of every photo would only fill the audit trail.
create trigger products_audit after insert or update or delete on public.products
  for each row execute function public.tg_audit();

alter table public.products       enable row level security;
alter table public.product_photos enable row level security;

create policy products_all on public.products
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
-- A photo belongs to one of the person's own products.
create policy product_photos_all on public.product_photos
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.products p where p.id = product_photos.id and p.user_id = (select auth.uid()))
  );

-- Changes a product. The version guards against an edit made meanwhile on another device. Runs as the caller, so
-- row level security still applies.
create function public.update_product(p_id uuid, p_base_version int, p jsonb) returns public.products
language plpgsql security invoker set search_path = '' as $$
declare
  current_row public.products;
  result public.products;
begin
  if (select auth.uid()) is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;
  select * into current_row from public.products where id = p_id for update;
  if not found then
    raise exception 'not_found';
  end if;
  if current_row.version <> p_base_version then
    raise exception 'version_conflict';
  end if;
  update public.products set
    name              = btrim(p ->> 'name'),
    kcal_100          = (p ->> 'kcal_100')::numeric,
    protein_100       = (p ->> 'protein_100')::numeric,
    carbs_100         = (p ->> 'carbs_100')::numeric,
    fat_100           = (p ->> 'fat_100')::numeric,
    sugar_100         = (p ->> 'sugar_100')::numeric,
    fiber_100         = (p ->> 'fiber_100')::numeric,
    added_sugar_100   = (p ->> 'added_sugar_100')::numeric,
    added_sugar_basis = p ->> 'added_sugar_basis',
    grain             = p ->> 'grain',
    basis             = coalesce(p ->> 'basis', 'g'),
    units             = coalesce(p -> 'units', '[]'::jsonb)
  where id = p_id
  returning * into result;
  return result;
end $$;

-- Puts (or replaces) the photo of one of the person's products. Runs as the caller (row level security applies).
create function public.set_product_photo(p_id uuid, p_data text) returns void
language sql security invoker set search_path = '' as $$
  insert into public.product_photos (id, data) values (p_id, p_data)
  on conflict (id) do update set data = excluded.data, created_at = now()
$$;

-- "Delete all my data" now empties the products too (their photos go with them).
create or replace function public.reset_my_data() returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public._require_user();
begin
  delete from public.meals where user_id = uid;
  delete from public.favorites where user_id = uid;
  delete from public.products where user_id = uid;
  delete from public.weight_entries where user_id = uid;
  delete from public.target_plans where user_id = uid;
  delete from public.profiles where user_id = uid;
  delete from public.audit_events where user_id = uid;
end $$;

revoke all on public.products, public.product_photos from public, anon;
grant select, insert, update, delete on public.products, public.product_photos to authenticated;
revoke all on function public.update_product(uuid, int, jsonb) from public, anon;
revoke all on function public.set_product_photo(uuid, text) from public, anon;
revoke all on function public.tg_limit_products() from public, anon, authenticated;
grant execute on function public.update_product(uuid, int, jsonb) to authenticated;
grant execute on function public.set_product_photo(uuid, text) to authenticated;
