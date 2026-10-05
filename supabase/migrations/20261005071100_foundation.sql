-- Foundation only. All application requests use the public key + user JWT.
create table public.cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  card_type text,
  name text,
  company text,
  job_title text,
  department text,
  email text,
  phone text,
  secondary_phone text,
  website text,
  card_number text,
  address text,
  raw_ocr_text text,
  ai_extraction jsonb,
  extra_fields jsonb not null default '[]'::jsonb,
  ai_confidence numeric,
  scan_status text not null default 'completed',
  original_image_path text,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cards_extra_fields_array check (jsonb_typeof(extra_fields) = 'array'),
  constraint cards_ai_extraction_object check (ai_extraction is null or jsonb_typeof(ai_extraction) = 'object'),
  constraint cards_confidence_range check (ai_confidence >= 0 and ai_confidence <= 1),
  constraint cards_image_owned_path check (original_image_path is null or split_part(original_image_path, '/', 1) = user_id::text)
);

-- Serves ownership policies and recent-card queries.
create index cards_user_created_idx on public.cards (user_id, created_at desc);

create function public.set_card_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function public.set_card_updated_at() from public, anon, authenticated;
create trigger cards_updated_at before update on public.cards
for each row execute function public.set_card_updated_at();

alter table public.cards enable row level security;
revoke all on public.cards from anon;
grant select, insert, update, delete on public.cards to authenticated;

create policy cards_select_own on public.cards for select to authenticated
using ((select auth.uid()) = user_id);
create policy cards_insert_own on public.cards for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy cards_update_own on public.cards for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy cards_delete_own on public.cards for delete to authenticated
using ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('card-images', 'card-images', false, 10485760, array['image/jpeg', 'image/png', 'image/webp']);

-- Object names: {user_id}/{card_id}/original.{jpg|png|webp}.
-- Both old and new paths are checked when renaming or replacing an object.
create policy card_images_select_own on storage.objects for select to authenticated
using (bucket_id = 'card-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy card_images_insert_own on storage.objects for insert to authenticated
with check (bucket_id = 'card-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy card_images_update_own on storage.objects for update to authenticated
using (bucket_id = 'card-images' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'card-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy card_images_delete_own on storage.objects for delete to authenticated
using (bucket_id = 'card-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
