import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

test("draft migration isolates owners, locks revisions and retains originals until confirmed save", async () => {
 const db = await PGlite.create();
 const userA = randomUUID(), userB = randomUUID(), id = randomUUID(), card = randomUUID();
 const path = `${userA}/${id}/${"a".repeat(64)}.png`;
 try {
    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
      create schema storage;
      create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text);
      create function storage.foldername(text) returns text[] language sql immutable as
        $$select (string_to_array($1, '/'))[1:array_length(string_to_array($1, '/'), 1)-1]$$;
      alter table storage.objects enable row level security;
      grant usage on schema public, auth, storage to anon, authenticated;
      grant select, insert, update, delete on storage.objects to anon, authenticated;
      -- Model Supabase's default privileges, including non-RLS TRUNCATE.
      alter default privileges in schema public grant all on tables to authenticated;
    `);
    for (const file of (await readdir("supabase/migrations"))
      .filter((name) => name.endsWith(".sql"))
      .sort()) {
      await db.exec(await readFile(`supabase/migrations/${file}`, "utf8"));
    }

 await db.query("insert into auth.users(id) values ($1),($2)", [userA,userB]);
 await db.exec("set role anon");
 await assert.rejects(db.query("select * from scan_drafts"), /permission denied/);
 await assert.rejects(db.query("select * from scan_draft_assets"), /permission denied/);
 await assert.rejects(db.query("select * from claim_scan_draft($1,0,$2)",[id,card]), /permission denied/);
 await db.exec("reset role; set role authenticated");
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[userA]);
 await assert.rejects(db.query("insert into scan_drafts(id,user_id) values ($1,$2)",[id,userB]), /row-level security/);
 await db.query("insert into scan_drafts(id,user_id) values ($1,$2)",[id,userA]);
 await assert.rejects(db.exec("truncate scan_drafts"), /permission denied/);
 await assert.rejects(db.query("update scan_drafts set expires_at=now()+interval '1 year' where id=$1",[id]), /permission denied/);
 await assert.rejects(db.query("update scan_drafts set front_path=$1,revision=1 where id=$2",[path,id]), /not ready/);
 await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values ('scan-drafts',$1)",[path]), /row-level security/);
 await db.query("insert into scan_draft_assets(draft_id,storage_path) values ($1,$2)",[id,path]);
 await db.query("insert into storage.objects(bucket_id,name) values ('scan-drafts',$1)",[path]);
 await db.query("update scan_draft_assets set uploaded=true where storage_path=$1",[path]);
 const changed = await db.query("update scan_drafts set revision=1,front_path=$1,payload=$2 where id=$3 and revision=0 returning revision",[path,JSON.stringify({extraction:null,review:null,frontName:"ខ្មែរ.png",backName:null}),id]);
 assert.equal(changed.rows.length,1);
 assert.equal((await db.query("update scan_drafts set revision=1 where id=$1 and revision=0 returning id",[id])).rows.length,0);
 assert.equal((await db.query("delete from scan_draft_assets returning storage_path")).rows.length,0);
 assert.equal((await db.query("delete from scan_drafts returning id")).rows.length,0);
 assert.equal((await db.query("update storage.objects set name=name where name=$1 returning id",[path])).rows.length,0);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[userB]);
 for (const table of ["scan_drafts","scan_draft_assets","storage.objects"]) {
  assert.equal((await db.query(`select * from ${table}`)).rows.length,0);
  assert.equal((await db.query(`delete from ${table} returning *`)).rows.length,0);
 }
 await assert.rejects(db.query("select * from claim_scan_draft($1,1,$2)",[id,card]), /unavailable/);
 await assert.rejects(db.query("insert into scan_draft_assets(draft_id,storage_path) values ($1,$2)",[id,`${userB}/${id}/${"b".repeat(64)}.png`]), /row-level security/);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[userA]);
 await assert.rejects(db.query("select * from claim_scan_draft($1,0,$2)",[id,card]), /conflict/);
 assert.equal((await db.query("select * from claim_scan_draft($1,1,$2)",[id,card])).rows.length,1);
 await assert.rejects(db.query("select * from claim_scan_draft($1,1,$2)",[id,card]), /busy/);
 await assert.rejects(db.query("update scan_drafts set revision=2 where id=$1",[id]), /locked/);
 await assert.rejects(db.query("update scan_drafts set state='discarded' where id=$1",[id]), /transition/);
 await assert.rejects(db.query("update scan_drafts set state='consumed' where id=$1",[id]), /not saved/);
 assert.equal((await db.query("delete from storage.objects returning id")).rows.length,0);
 await db.query("insert into cards(id,user_id) values ($1,$2)",[card,userA]);
 await assert.rejects(db.query("update scan_drafts set state='active',lease_until=null where id=$1",[id]), /already saved/);
 await db.query("update scan_drafts set state='consumed' where id=$1",[id]);
 await assert.rejects(db.query("delete from scan_draft_assets returning storage_path"), /original still exists/);
 await assert.rejects(db.query("delete from scan_drafts returning id"), /assets still exist/);
 // Application cleanup removes Storage originals before their reservations.
 assert.equal((await db.query("delete from storage.objects returning id")).rows.length,1);
 assert.equal((await db.query("delete from scan_draft_assets returning storage_path")).rows.length,1);
 assert.equal((await db.query("delete from scan_drafts returning id")).rows.length,1);
 for (let n=0;n<5;n++) await db.query("insert into scan_drafts(id,user_id) values ($1,$2)",[randomUUID(),userA]);
 await assert.rejects(db.query("insert into scan_drafts(id,user_id) values ($1,$2)",[randomUUID(),userA]), /Draft limit/);
 const expired = randomUUID();
 await db.exec("reset role");
 await db.query("insert into scan_drafts(id,user_id,expires_at) values ($1,$2,now()-interval '1 hour')",[expired,userB]);
 await db.exec("set role authenticated");
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[userB]);
 await assert.rejects(db.query("select * from claim_scan_draft($1,0,$2)",[expired,randomUUID()]), /unavailable/);
 await assert.rejects(db.query("update scan_drafts set revision=1 where id=$1",[expired]), /revision/);
 await db.query("update scan_drafts set state='discarded' where id=$1",[expired]);
 assert.equal((await db.query("delete from scan_drafts returning id")).rows.length,1);
 } finally { await db.close(); }
});
