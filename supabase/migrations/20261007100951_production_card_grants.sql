-- Supabase default privileges can grant more than explicit CRUD grants add.
-- TRUNCATE is outside RLS, so remove all application-role table privileges
-- first, then grant only the four operations protected by the existing policies.
begin;
revoke all on table public.cards from public, anon, authenticated;
grant select, insert, update, delete on table public.cards to authenticated;
commit;
