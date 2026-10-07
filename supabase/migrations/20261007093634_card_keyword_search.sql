-- Literal substring search. User input is a parameter, never SQL/filter syntax.
-- SECURITY INVOKER preserves cards RLS; no owner can be supplied by the caller.
create function public.search_cards(p_query text)
returns setof public.cards
language sql
stable
security invoker
set search_path = ''
as $$
  select c.*
  from public.cards c
  cross join (
    select '%' || replace(replace(replace(p_query, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%' as pattern
  ) s
  where c.user_id = (select auth.uid())
    and char_length(p_query) <= 200
    and p_query !~ '[[:cntrl:]]'
    and (
      p_query = ''
      or c.name ilike s.pattern escape E'\\'
      or c.company ilike s.pattern escape E'\\'
      or c.phone ilike s.pattern escape E'\\'
      or c.email ilike s.pattern escape E'\\'
      or c.job_title ilike s.pattern escape E'\\'
      or c.card_number ilike s.pattern escape E'\\'
    );
$$;

revoke all on function public.search_cards(text) from public, anon;
grant execute on function public.search_cards(text) to authenticated;
