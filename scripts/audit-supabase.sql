-- Read-only metadata, combined because the CLI returns the final result set.
-- No card contents, user records or tokens are selected.
select jsonb_build_object(
 'rls', (select jsonb_agg(row_to_json(r)) from (
   select n.nspname as schema, c.relname as relation, c.relrowsecurity as enabled
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where (n.nspname = 'public' and c.relname in ('cards', 'card_images')) or (n.nspname = 'storage' and c.relname = 'objects')
 ) r),
 'policies', (select jsonb_agg(row_to_json(r)) from (
   select schemaname, tablename, policyname, roles, cmd, qual, with_check from pg_policies
   where (schemaname = 'public' and tablename in ('cards', 'card_images')) or (schemaname = 'storage' and tablename = 'objects')
   order by schemaname, tablename, policyname
 ) r),
 'cards_grants', (select jsonb_agg(row_to_json(r)) from (
   select table_name, grantee, privilege_type from information_schema.role_table_grants
   where table_schema = 'public' and table_name in ('cards', 'card_images') and grantee in ('anon', 'authenticated', 'PUBLIC')
   order by table_name, grantee, privilege_type
 ) r),
 'bucket', (select jsonb_agg(row_to_json(r)) from (
   select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'card-images'
 ) r),
 'functions', (select jsonb_agg(row_to_json(r)) from (
   select p.proname, p.prosecdef as security_definer, p.proconfig,
     has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
     has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('search_cards', 'set_card_updated_at', 'save_card_with_images')
 ) r)
) as security_metadata;
