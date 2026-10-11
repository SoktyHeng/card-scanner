-- Organization metadata is separate from OCR/extraction and reviewed contact fields.
alter table public.cards add column notes text not null default '' check (char_length(notes) <= 10000);
alter table public.cards add column is_favorite boolean not null default false;
alter table public.cards add constraint cards_id_user_unique unique (id,user_id);
create index cards_owner_favorites on public.cards(user_id,created_at desc) where is_favorite;

create table public.tags (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 name text not null check (char_length(btrim(name)) between 1 and 50 and name !~ '[[:cntrl:]]'),
 name_key text generated always as (lower(btrim(normalize(name,NFC)))) stored,
 created_at timestamptz not null default now(),
 unique(user_id,name_key), unique(id,user_id)
);
create table public.card_tags (
 card_id uuid not null, tag_id uuid not null, user_id uuid not null,
 primary key(card_id,tag_id),
 foreign key(card_id,user_id) references public.cards(id,user_id) on delete cascade,
 foreign key(tag_id,user_id) references public.tags(id,user_id) on delete cascade
);
create index card_tags_owner_tag on public.card_tags(user_id,tag_id,card_id);
alter table public.tags enable row level security;
alter table public.card_tags enable row level security;
create policy tags_owner on public.tags for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy card_tags_owner on public.card_tags for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
revoke all on public.tags,public.card_tags from public,anon,authenticated;
grant select,insert,update,delete on public.tags,public.card_tags to authenticated;

-- Direct relation changes also invalidate optimistic card revisions.
create function public.touch_card_tags() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if TG_OP <> 'INSERT' then update public.cards set updated_at=clock_timestamp() where id=OLD.card_id and user_id=auth.uid(); end if;
 if TG_OP <> 'DELETE' then
  update public.cards set updated_at=clock_timestamp() where id=NEW.card_id and user_id=auth.uid();
  if (select count(*) from public.card_tags where card_id=NEW.card_id) > 20 then raise exception 'Too many tags' using errcode='22023'; end if;
 end if;
 return null;
end $$;
create trigger card_tags_touch after insert or update or delete on public.card_tags for each row execute function public.touch_card_tags();
revoke all on function public.touch_card_tags() from public,anon,authenticated;

create function public.organize_card(p_id uuid,p_expected timestamptz,p_notes text,p_favorite boolean,p_tags text[])
returns timestamptz language plpgsql security invoker set search_path='' as $$
declare card public.cards; tag_name text; tag_id uuid;
begin
 if auth.uid() is null then raise exception 'Unauthorized' using errcode='42501'; end if;
 if p_notes is null or char_length(p_notes)>10000 or p_favorite is null or p_tags is null or cardinality(p_tags)>20
    or exists(select 1 from unnest(p_tags) n where n is null or char_length(btrim(n)) not between 1 and 50 or n ~ '[[:cntrl:]]') then
  raise exception 'Invalid organization data' using errcode='22023';
 end if;
 select * into card from public.cards where id=p_id and user_id=auth.uid() for update;
 if not found then raise exception 'Card unavailable' using errcode='P0002'; end if;
 if p_expected is null or card.updated_at<>p_expected then raise exception 'Card changed' using errcode='40001'; end if;
 update public.cards set notes=p_notes,is_favorite=p_favorite where id=p_id and user_id=auth.uid();
 delete from public.card_tags where card_id=p_id and user_id=auth.uid();
 for tag_name in select distinct on (lower(btrim(normalize(n,NFC)))) btrim(normalize(n,NFC)) from unnest(p_tags) n order by lower(btrim(normalize(n,NFC))),btrim(normalize(n,NFC)) loop
  insert into public.tags(user_id,name) values(auth.uid(),tag_name)
   on conflict(user_id,name_key) do update set name=public.tags.name returning id into tag_id;
  insert into public.card_tags(card_id,tag_id,user_id) values(p_id,tag_id,auth.uid()) on conflict do nothing;
 end loop;
 return (select updated_at from public.cards where id=p_id and user_id=auth.uid());
end $$;
revoke all on function public.organize_card(uuid,timestamptz,text,boolean,text[]) from public,anon,authenticated;
grant execute on function public.organize_card(uuid,timestamptz,text,boolean,text[]) to authenticated;

create function public.card_tag_names(p_id uuid) returns table(id uuid,name text)
language sql stable security invoker set search_path='' as $$
 select t.id,t.name from public.tags t join public.card_tags ct on ct.tag_id=t.id and ct.user_id=t.user_id
 where ct.card_id=p_id and ct.user_id=auth.uid() order by t.name_key,t.id;
$$;
revoke all on function public.card_tag_names(uuid) from public,anon,authenticated;
grant execute on function public.card_tag_names(uuid) to authenticated;

create function public.filter_cards(p_query text,p_tag text,p_favorites boolean) returns setof public.cards
language sql stable security invoker set search_path='' as $$
 select c.* from public.cards c where c.user_id=auth.uid()
 and (p_query='' or c.id in(select s.id from public.search_cards(p_query) s))
 and (not p_favorites or c.is_favorite)
 and (p_tag='' or exists(select 1 from public.card_tags ct join public.tags t on t.id=ct.tag_id and t.user_id=ct.user_id
  where ct.card_id=c.id and ct.user_id=auth.uid() and t.name_key=lower(btrim(normalize(p_tag,NFC)))));
$$;
revoke all on function public.filter_cards(text,text,boolean) from public,anon,authenticated;
grant execute on function public.filter_cards(text,text,boolean) to authenticated;

-- Populate defaults explicitly because this RPC inserts an entire cards row.
create or replace function public.save_card_with_images(p_card jsonb, p_images jsonb)
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
      'notes', '', 'is_favorite', false, 'scan_status', 'completed', 'is_archived', false, 'created_at', now(), 'updated_at', now()) || p_card);
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

