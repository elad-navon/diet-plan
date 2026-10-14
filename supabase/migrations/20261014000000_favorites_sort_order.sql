-- The person's own order of the saved meals ("מיון ידני"): 1 is at the top. Null = never placed by hand (every
-- favorite until the list is first sorted, and a meal saved after that); those come first, in the usual order.
-- Kept on the server, so a phone and a computer show the same order. Run this once in the Supabase SQL editor;
-- until then the app works as before and moving a saved meal says it could not be saved.

alter table public.favorites
  add column sort_order int check (sort_order between 1 and 1000);

-- Puts the given favorites in this order (the first id gets 1). Ids of someone else, or that are gone, are skipped.
-- Runs as the caller, so row level security still applies.
create function public.reorder_favorites(p_ids uuid[]) returns void
language sql security invoker set search_path = '' as $$
  update public.favorites f
  set sort_order = array_position(p_ids, f.id)
  where f.id = any (p_ids)
    and f.user_id = (select auth.uid())
    and coalesce(array_length(p_ids, 1), 0) <= 1000
$$;

revoke all on function public.reorder_favorites(uuid[]) from public, anon;
grant execute on function public.reorder_favorites(uuid[]) to authenticated;
