import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

test("organization migration protects both relation owners, deduplicates names, rejects stale edits and preserves source/archive data", async () => {
  const db = await PGlite.create();
  const a = randomUUID(), b = randomUUID(), ca = randomUUID(), cb = randomUUID();
  try {
    await db.exec(`create role anon nologin; create role authenticated nologin;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create schema storage;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text);
      create function storage.foldername(text) returns text[] language sql immutable as $$select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1]$$;
      alter table storage.objects enable row level security;
      grant usage on schema public,auth,storage to anon,authenticated;
      grant select,insert,update,delete on storage.objects to anon,authenticated;
      alter default privileges in schema public grant all on tables to authenticated;`);
    for (const name of (await readdir("supabase/migrations")).filter(name => name.endsWith(".sql")).sort()) await db.exec(await readFile(`supabase/migrations/${name}`, "utf8"));
    await db.query("insert into auth.users values($1),($2)",[a,b]);
    await db.query("insert into cards(id,user_id,name,raw_ocr_text,ai_extraction) values($1,$2,'Contact','source',$3),($4,$5,'Other','source',$3)",[ca,a,JSON.stringify({name:"original"}),cb,b]);
    const denied = async (query: string, params: unknown[], pattern: RegExp) => {
      await db.exec("begin");
      try {await assert.rejects(db.query(query, params), pattern);}
      finally {await db.exec("rollback");}
    };
    await db.exec("set role anon");
    for (const table of ["tags","card_tags"]) await denied(`select * from ${table}`, [], /permission denied/);
    await denied("select organize_card($1,now(),'x',true,array['VIP'])",[ca], /permission denied/);
    await db.exec("reset role; set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[a]);
    const revision = async () => (await db.query<{revision: string}>(`select to_char(updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US')||'Z' as revision from cards where id=$1`,[ca])).rows[0].revision;
    const first = await revision();
    const note = '<script>alert("x")</script>\nខ្មែរ';
    await db.query("select organize_card($1,$2,$3,true,$4)",[ca,first,note,["VIP","vip","ខ្មែរ"]]);
    const saved = (await db.query<{notes:string;is_favorite:boolean;raw_ocr_text:string;ai_extraction:unknown}>("select notes,is_favorite,raw_ocr_text,ai_extraction from cards where id=$1",[ca])).rows[0];
    assert.equal(saved.notes,note); assert.equal(saved.is_favorite,true); assert.equal(saved.raw_ocr_text,"source"); assert.deepEqual(saved.ai_extraction,{name:"original"});
    assert.equal((await db.query("select * from tags")).rows.length,2);
    assert.equal((await db.query("select * from card_tag_names($1)",[ca])).rows.length,2);
    await denied("select organize_card($1,$2,'lost',false,array['new'])",[ca,first], /Card changed/);
    assert.equal((await db.query("select * from tags where name='new'")).rows.length,0);
    assert.equal((await db.query("select * from filter_cards('Contact','vIp',true)")).rows.length,1);
    assert.equal((await db.query("select * from filter_cards('absent','VIP',true)")).rows.length,0);
    await db.query("update cards set is_archived=true where id=$1",[ca]);
    assert.equal((await db.query("select * from card_tag_names($1)",[ca])).rows.length,2);
    await db.query("update cards set is_archived=false where id=$1",[ca]);
    assert.equal((await db.query<{notes:string}>("select notes from cards where id=$1",[ca])).rows[0].notes,note);
    const tagA = (await db.query<{id:string}>("select id from tags limit 1")).rows[0].id;
    await denied("insert into tags(user_id,name) values($1,'vip')",[a], /unique constraint/);
    await assert.rejects(db.exec("truncate tags cascade"), /permission denied/);
    await denied("insert into card_tags(card_id,tag_id,user_id) values($1,$2,$3)",[cb,tagA,a], /foreign key/);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[b]);
    assert.equal((await db.query("select * from tags")).rows.length,0);
    assert.equal((await db.query("select * from card_tags")).rows.length,0);
    assert.equal((await db.query("select * from card_tag_names($1)",[ca])).rows.length,0);
    assert.equal((await db.query("select * from filter_cards('','VIP',true)")).rows.length,0);
    await denied("select organize_card($1,now(),'x',true,array['bad'])",[ca], /Card unavailable/);
    await denied("insert into tags(user_id,name) values($1,'bad')",[a], /row-level security/);
    await denied("insert into card_tags(card_id,tag_id,user_id) values($1,$2,$3)",[ca,tagA,a], /row-level security/);
    await denied("insert into card_tags(card_id,tag_id,user_id) values($1,$2,$3)",[cb,tagA,b], /foreign key/);
    for (const table of ["tags","card_tags"]) {
      assert.equal((await db.query(`update ${table} set user_id=$1 where user_id=$2 returning *`,[b,a])).rows.length,0);
      assert.equal((await db.query(`delete from ${table} where user_id=$1 returning *`,[a])).rows.length,0);
    }
    const tagB = (await db.query<{id:string}>("insert into tags(user_id,name) values($1,'vip') returning id",[b])).rows[0].id;
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[a]);
    await denied("update card_tags set tag_id=$1 where card_id=$2 and tag_id=$3",[tagB,ca,tagA], /foreign key/);
    await denied("update tags set user_id=$1 where id=$2",[b,tagA], /row-level security/);
    const beforeInvalid = await revision();
    await denied("select organize_card($1,$2,$3,false,array['invalid'])",[ca,beforeInvalid,"x".repeat(10001)], /Invalid organization/);
    assert.equal(await revision(),beforeInvalid);
    await db.query("select organize_card($1,$2,'new notes',false,array['vip'])",[ca,beforeInvalid]);
    assert.equal((await db.query("select * from card_tag_names($1)",[ca])).rows.length,1);
    await db.query("delete from cards where id=$1",[ca]);
    assert.equal((await db.query("select * from card_tags")).rows.length,0);
    assert.equal((await db.query("select * from tags")).rows.length,2); // Private reusable names remain.
  } finally {await db.close();}
});
