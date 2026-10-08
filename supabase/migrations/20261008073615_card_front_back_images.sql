create table public.card_images (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards(id) on delete cascade,
  side text not null check (side in ('front', 'back')),
  storage_path text not null,
  created_at timestamptz not null default now(),
  unique (card_id, side),
  unique (storage_path),
  constraint card_images_card_path check (
    split_part(storage_path, '/', 2) = card_id::text
    and storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/(original|front|back)\.(jpg|png|webp)$'
    and ((side = 'front' and split_part(storage_path, '/', 3) ~ '^(original|front)\.')
      or (side = 'back' and split_part(storage_path, '/', 3) ~ '^back\.'))
  )
);
-- The unique (card_id, side) index also supports the FK and ownership lookup.
alter table public.card_images enable row level security;
revoke all on public.card_images from public, anon, authenticated;
grant select, insert, delete on public.card_images to authenticated;

create policy card_images_read_owner on public.card_images for select to authenticated
using (exists (select 1 from public.cards c where c.id = card_id and c.user_id = (select auth.uid())));
create policy card_images_write_owner on public.card_images for insert to authenticated
with check (split_part(storage_path, '/', 1) = (select auth.uid())::text
  and exists (select 1 from public.cards c where c.id = card_id and c.user_id = (select auth.uid())));
create policy card_images_delete_owner on public.card_images for delete to authenticated
using (exists (select 1 from public.cards c where c.id = card_id and c.user_id = (select auth.uid())));

-- Existing cards keep their original_image_path; backfill only valid owned paths.
insert into public.card_images (card_id, side, storage_path, created_at)
select id, 'front', original_image_path, created_at from public.cards
where original_image_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/original\.(jpg|png|webp)$'
  and split_part(original_image_path, '/', 1) = user_id::text
  and split_part(original_image_path, '/', 2) = id::text;

-- Both database inserts commit together. This function runs as the caller;
-- cards and card_images RLS remain enforced, with no privileged client.
create function public.save_card_with_images(p_card jsonb, p_images jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  card public.cards;
begin
  if jsonb_typeof(p_card) is distinct from 'object' or jsonb_typeof(p_images) is distinct from 'array'
    or jsonb_array_length(p_images) not between 1 and 2 then
    raise exception 'Invalid card images';
  end if;
  card := jsonb_populate_record(null::public.cards,
    jsonb_build_object('id', gen_random_uuid(), 'extra_fields', '[]'::jsonb,
      'scan_status', 'completed', 'is_archived', false, 'created_at', now(), 'updated_at', now()) || p_card);
  if (select count(*) from jsonb_array_elements(p_images) i where i->>'side' = 'front'
      and i->>'storage_path' = card.original_image_path) <> 1 then
    raise exception 'Front image is required';
  end if;
  insert into public.cards select card.*;
  insert into public.card_images (card_id, side, storage_path)
  select card.id, i->>'side', i->>'storage_path' from jsonb_array_elements(p_images) i;
  return card.id;
end;
$$;
revoke all on function public.save_card_with_images(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.save_card_with_images(jsonb, jsonb) to authenticated;

-- The existing private bucket and owner-folder storage policies cover front/back
-- paths too. No public URLs, upserts, or broader storage grants are introduced.
