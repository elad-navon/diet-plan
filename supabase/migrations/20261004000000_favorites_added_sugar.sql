-- Added sugar per favorite (grams, one decimal), the same measure as on meals (docs/DIABETES.md).
-- A meal typed by hand is remembered as a favorite, and its sugar is the one thing that cannot be worked out
-- again from foods. Null = not known. Favorites are written by the app directly, so no function changes.

alter table public.favorites
  add column added_sugar_g numeric(5, 1) check (added_sugar_g between 0 and 500);
