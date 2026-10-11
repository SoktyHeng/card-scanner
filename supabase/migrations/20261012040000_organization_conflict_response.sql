-- Stale edits are business conflicts, not retryable serialization failures.
-- PT409 returns a prompt HTTP conflict on hosted PostgREST.
create or replace function public.organize_card(p_id uuid,p_expected timestamptz,p_notes text,p_favorite boolean,p_tags text[])
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
 if p_expected is null or card.updated_at<>p_expected then raise exception 'Card changed' using errcode='PT409'; end if;
 update public.cards set notes=p_notes,is_favorite=p_favorite where id=p_id and user_id=auth.uid();
 delete from public.card_tags where card_id=p_id and user_id=auth.uid();
 for tag_name in select distinct on (lower(btrim(normalize(n,NFC)))) btrim(normalize(n,NFC)) from unnest(p_tags) n order by lower(btrim(normalize(n,NFC))),btrim(normalize(n,NFC)) loop
  insert into public.tags(user_id,name) values(auth.uid(),tag_name)
   on conflict(user_id,name_key) do update set name=public.tags.name returning id into tag_id;
  insert into public.card_tags(card_id,tag_id,user_id) values(p_id,tag_id,auth.uid()) on conflict do nothing;
 end loop;
 return (select updated_at from public.cards where id=p_id and user_id=auth.uid());
end $$;
