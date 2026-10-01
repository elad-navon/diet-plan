-- A harmless "is the database awake?" call for a scheduled check (.github/workflows/keep-alive.yml).
--
-- Free Supabase projects are paused after about a week of low activity. A scheduled job calls this function
-- every few days; it reads nothing from the tables and returns only the server time, so letting anyone call it
-- (it is the one function open to the anon role) exposes nothing.

create function public.keep_alive() returns timestamptz
language sql stable set search_path = '' as $$
  select now()
$$;

revoke all on function public.keep_alive() from public;
grant execute on function public.keep_alive() to anon, authenticated;
