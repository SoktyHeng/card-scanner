-- User requests use public keys + user JWTs. No privileged draft read/write RPC.
create table public.scan_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  revision integer not null default 0 check (revision between 0 and 1000000),
  state text not null default 'active' check (state in ('active','saving','consumed','discarded')),
  payload jsonb not null default '{"extraction":null,"review":null,"frontName":null,"backName":null}',
  front_path text,
  back_path text,
  final_card_id uuid,
  lease_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 3145728),
  check (front_path is null or front_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f]{64}\.(jpg|png|webp)$'
    and split_part(front_path,'/',1) = user_id::text and split_part(front_path,'/',2) = id::text),
  check (back_path is null or back_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f]{64}\.(jpg|png|webp)$'
    and split_part(back_path,'/',1) = user_id::text and split_part(back_path,'/',2) = id::text)
);
create index scan_drafts_owner_expiry on public.scan_drafts(user_id, expires_at);
create index scan_drafts_cleanup on public.scan_drafts(expires_at, state);
alter table public.scan_drafts enable row level security;
revoke all on public.scan_drafts from public, anon, authenticated;
grant select, delete on public.scan_drafts to authenticated;
grant insert(id,user_id) on public.scan_drafts to authenticated;
grant update(revision,state,payload,front_path,back_path,final_card_id,lease_until) on public.scan_drafts to authenticated;
create policy scan_drafts_read on public.scan_drafts for select to authenticated using (user_id = (select auth.uid()));
create policy scan_drafts_insert on public.scan_drafts for insert to authenticated with check (user_id = (select auth.uid()));
create policy scan_drafts_update on public.scan_drafts for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));


-- Reserve every immutable upload before touching Storage, including interrupted writes.
create table public.scan_draft_assets (
  draft_id uuid not null references public.scan_drafts(id) on delete cascade,
  storage_path text primary key,
  uploaded boolean not null default false,
  touched_at timestamptz not null default now(),
  check (storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f]{64}\.(jpg|png|webp)$'
    and split_part(storage_path,'/',2) = draft_id::text)
);
create index scan_draft_assets_draft on public.scan_draft_assets(draft_id);
alter table public.scan_draft_assets enable row level security;
revoke all on public.scan_draft_assets from public, anon, authenticated;
grant select, delete on public.scan_draft_assets to authenticated;
grant insert(draft_id,storage_path) on public.scan_draft_assets to authenticated;
grant update(uploaded) on public.scan_draft_assets to authenticated;
create policy scan_draft_assets_read on public.scan_draft_assets for select to authenticated
using (exists(select 1 from public.scan_drafts d where d.id = draft_id and d.user_id = (select auth.uid())));
create policy scan_draft_assets_insert on public.scan_draft_assets for insert to authenticated
with check (split_part(storage_path,'/',1) = (select auth.uid())::text
  and exists(select 1 from public.scan_drafts d where d.id = draft_id and d.user_id = (select auth.uid()) and d.state = 'active' and d.expires_at > now()));
create policy scan_draft_assets_update on public.scan_draft_assets for update to authenticated
using (exists(select 1 from public.scan_drafts d where d.id = draft_id and d.user_id = (select auth.uid()) and d.state = 'active' and d.expires_at > now()))
with check (exists(select 1 from public.scan_drafts d where d.id = draft_id and d.user_id = (select auth.uid()) and d.state = 'active' and d.expires_at > now()));
create policy scan_draft_assets_delete on public.scan_draft_assets for delete to authenticated
using (exists(select 1 from public.scan_drafts d where d.id = draft_id and d.user_id = (select auth.uid())
  and (d.state in ('consumed','discarded') or (d.state = 'active' and storage_path is distinct from d.front_path
    and storage_path is distinct from d.back_path and touched_at < now() - interval '10 minutes'))));

create policy scan_drafts_delete on public.scan_drafts for delete to authenticated
using (user_id = (select auth.uid()) and state in ('consumed','discarded'));

create function public.guard_scan_draft_asset() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(new.draft_id::text));
    if (select count(*) from public.scan_draft_assets where draft_id = new.draft_id) >= 12 then
      raise exception using errcode = '54000', message = 'Draft asset limit';
    end if;
  end if;
  new.touched_at := now();
  return new;
end; $$;
revoke all on function public.guard_scan_draft_asset() from public, anon, authenticated;
create trigger scan_draft_asset_guard before insert or update on public.scan_draft_assets for each row execute function public.guard_scan_draft_asset();

create function public.guard_scan_draft() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(new.user_id::text));
    if (select count(*) from public.scan_drafts where user_id = new.user_id and state in ('active','saving') and expires_at > now()) >= 5 then
      raise exception using errcode = '54000', message = 'Draft limit';
    end if;
    return new;
  end if;
  if new.id <> old.id or new.user_id <> old.user_id or new.created_at <> old.created_at or new.expires_at <> old.expires_at
    or (old.final_card_id is not null and new.final_card_id is distinct from old.final_card_id) then
    raise exception 'Immutable draft identity';
  end if;
  if old.state = 'active' and new.state = 'active' then
    if old.expires_at <= now() or new.revision <> old.revision + 1 or new.final_card_id is distinct from old.final_card_id or new.lease_until is distinct from old.lease_until then raise exception 'Invalid draft revision'; end if;
    if (new.front_path is not null and not exists(select 1 from public.scan_draft_assets where draft_id = new.id and storage_path = new.front_path and uploaded))
      or (new.back_path is not null and not exists(select 1 from public.scan_draft_assets where draft_id = new.id and storage_path = new.back_path and uploaded)) then raise exception 'Draft image is not ready'; end if;
  else
    if new.revision <> old.revision or new.payload <> old.payload or new.front_path is distinct from old.front_path or new.back_path is distinct from old.back_path then raise exception 'Draft is locked'; end if;
    if old.state = 'active' and new.state = 'saving' then
      if old.expires_at <= now() or new.final_card_id is null or new.lease_until is null or new.lease_until <= now() or new.lease_until > now() + interval '5 minutes' then raise exception 'Invalid save lease'; end if;
    elsif old.state = 'saving' and new.state = 'active' then
      if exists(select 1 from public.cards where id = old.final_card_id and user_id = old.user_id) then raise exception 'Card already saved'; end if;
    elsif old.state = 'saving' and new.state = 'consumed' then
      if not exists(select 1 from public.cards where id = old.final_card_id and user_id = old.user_id) then raise exception 'Card not saved'; end if;
    elsif new.state = 'discarded' and (old.state = 'active' or (old.state = 'saving' and old.lease_until <= now())) then null;
    else raise exception 'Invalid draft transition'; end if;
  end if;
  new.updated_at := now();
  return new;
end; $$;
revoke all on function public.guard_scan_draft() from public, anon, authenticated;
create trigger scan_draft_guard before insert or update on public.scan_drafts for each row execute function public.guard_scan_draft();

create function public.claim_scan_draft(p_id uuid, p_revision integer, p_card_id uuid)
returns setof public.scan_drafts language plpgsql security invoker set search_path = '' as $$
declare d public.scan_drafts;
begin
  select * into d from public.scan_drafts where id = p_id and user_id = (select auth.uid()) for update;
  if not found or d.expires_at <= now() or d.state in ('consumed','discarded') then raise exception using errcode='P0002', message='Draft unavailable'; end if;
  if d.revision <> p_revision then raise exception using errcode='40001', message='Draft conflict'; end if;
  if d.state = 'saving' then
    if d.lease_until > now() then raise exception using errcode='55P03', message='Draft busy'; end if;
    update public.scan_drafts set state='active', lease_until=null where id=p_id;
  end if;
  return query update public.scan_drafts set state='saving', final_card_id=p_card_id, lease_until=now()+interval '5 minutes' where id=p_id returning *;
end; $$;
revoke all on function public.claim_scan_draft(uuid,integer,uuid) from public, anon, authenticated;
grant execute on function public.claim_scan_draft(uuid,integer,uuid) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('scan-drafts','scan-drafts',false,10485760,array['image/jpeg','image/png','image/webp']);
create policy draft_storage_read on storage.objects for select to authenticated using (bucket_id='scan-drafts'
  and exists(select 1 from public.scan_draft_assets a join public.scan_drafts d on d.id=a.draft_id where a.storage_path=name and d.user_id=(select auth.uid())));
create policy draft_storage_insert on storage.objects for insert to authenticated with check (bucket_id='scan-drafts'
  and exists(select 1 from public.scan_draft_assets a join public.scan_drafts d on d.id=a.draft_id where a.storage_path=name and d.user_id=(select auth.uid()) and d.expires_at>now() and d.state='active'));
create policy draft_storage_delete on storage.objects for delete to authenticated using (bucket_id='scan-drafts'
  and exists(select 1 from public.scan_draft_assets a join public.scan_drafts d on d.id=a.draft_id where a.storage_path=name and d.user_id=(select auth.uid())
    and (d.state in ('consumed','discarded') or (d.state='active' and a.storage_path is distinct from d.front_path and a.storage_path is distinct from d.back_path and a.touched_at<now()-interval '10 minutes'))));
-- No UPDATE/upsert policy; originals are immutable. Retired data is deleted
-- through Storage API before deleting its reserved asset rows and draft record.

-- A server-only maintenance job may purge expired/terminal drafts for absent users.
-- Normal application routes never use this role.
do $$ begin
  if exists(select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
    grant select, update, delete on public.scan_drafts to service_role;
    grant select, delete on public.scan_draft_assets to service_role;
  end if;
end $$;

-- A separate trigger query checks SELECT policies without recursively expanding
-- the outer DELETE policy. Keep the cleanup ledger until Storage removal succeeds.
create function public.guard_scan_draft_cleanup() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_table_name = 'scan_draft_assets' then
    if exists(select 1 from storage.objects where bucket_id = 'scan-drafts' and name = old.storage_path) then raise exception 'Draft original still exists'; end if;
  else
    if exists(select 1 from public.scan_draft_assets where draft_id = old.id) then raise exception 'Draft assets still exist'; end if;
  end if;
  return old;
end; $$;
revoke all on function public.guard_scan_draft_cleanup() from public, anon, authenticated;
create trigger scan_draft_asset_cleanup_guard before delete on public.scan_draft_assets for each row execute function public.guard_scan_draft_cleanup();
create trigger scan_draft_cleanup_guard before delete on public.scan_drafts for each row execute function public.guard_scan_draft_cleanup();
