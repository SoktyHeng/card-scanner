import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("PostgreSQL keyword search matches all six fields literally, paginates, filters archives, and enforces RLS", async () => {
  const db = await PGlite.create();
  const owner = "00000000-0000-4000-8000-000000000001";
  const other = "00000000-0000-4000-8000-000000000002";
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
    `);
    for (const file of (await readdir("supabase/migrations")).filter(file => file.endsWith(".sql")).sort())
      await db.exec(await readFile(`supabase/migrations/${file}`, "utf8"));
    await db.query("insert into auth.users(id) values ($1),($2)", [owner, other]);
    const values = [
      ["name", "Alice Johnson", "ALICE"], ["company", "Acme & Sons, (Cambodia)", "sons,"],
      ["phone", "+855 12 345 678", "+855"], ["email", "jane+VIP@example.com", "vip@"],
      ["job_title", "Senior Software Engineer", "SOFTWARE"], ["card_number", "MB-10023", "mb-10"],
    ];
    const ids: string[] = [];
    // Column names are fixed test fixtures, never user search input.
    for (const [field, value] of values) {
      const id = randomUUID(); ids.push(id);
      await db.query(`insert into public.cards(id,user_id,${field}) values ($1,$2,$3)`, [id, owner, value]);
    }
    const specialId = randomUUID();
    await db.query("insert into public.cards(id,user_id,name) values ($1,$2,$3)", [specialId, owner, `50%_\\* \"O'Brien\", (VIP)`]);
    const khmerId = randomUUID();
    await db.query("insert into public.cards(id,user_id,name) values ($1,$2,$3)", [khmerId, owner, "សុខា"]);
    const archivedId = randomUUID();
    await db.query("insert into public.cards(id,user_id,name,is_archived) values ($1,$2,'Alice archived',true)", [archivedId, owner]);
    const otherId = randomUUID();
    await db.query("insert into public.cards(id,user_id,name) values ($1,$2,'Alice forbidden')", [otherId, other]);
    const pageIds = Array.from({ length: 27 }, () => randomUUID());
    for (const id of pageIds) await db.query("insert into public.cards(id,user_id,name,created_at) values ($1,$2,'Pagination contact','2026-10-07T00:00:00Z')", [id, owner]);
    await db.exec("set role anon");
    await assert.rejects(db.query("select id from public.search_cards('Alice')"), /permission denied/);
    await db.exec("reset role; set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
    async function search(query: string, archived = false, limit = 100, offset = 0) {
      return (await db.query<{ id: string }>("select id from public.search_cards($1) where is_archived=$2 order by created_at desc,id desc limit $3 offset $4", [query, archived, limit, offset])).rows.map(row => row.id);
    }
    for (const [index, [, , query]] of values.entries()) assert.deepEqual(await search(query), [ids[index]], `Search field ${values[index][0]}`);
    for (const query of ["%", "_", "\\", "*", `\"`, "O'Brien", "50%_\\*", "(VIP)"])
      assert.deepEqual(await search(query), [specialId], `Literal ${query}`);
    assert.deepEqual(new Set(await search(",")), new Set([ids[1], specialId]));
    assert.deepEqual(await search("សុខា"), [khmerId]);
    assert.deepEqual(await search("' OR true --"), []);
    assert.deepEqual(await search("x),user_id.neq.fake"), []);
    assert.deepEqual(await search("not present"), []);
    assert.equal((await search("")).length, 35);
    assert.deepEqual(await search("Alice", true), [archivedId]);
    assert.ok(!(await search("")).includes(archivedId));
    assert.deepEqual(await search("x".repeat(201)), []);
    assert.deepEqual(await search("one\ntwo"), []);
    const first = await search("pagination", false, 24);
    const second = await search("PAGINATION", false, 24, 24);
    assert.equal(first.length, 24); assert.equal(second.length, 3);
    assert.deepEqual(new Set([...first, ...second]), new Set(pageIds));
    assert.deepEqual(await search("pagination", false, 24, 48), []);
    // Filter boundaries are Cambodia local midnight (17:00 UTC the day before).
    const filterIds = Array.from({ length: 6 }, () => randomUUID());
    const filterValues = [
      ["Outside before", "2026-10-09T16:59:59.999Z"],
      ["Alice", "2026-10-09T17:00:00Z"],
      ["Alice", "2026-10-09T17:00:00Z"],
      ["Bob", "2026-10-10T16:59:59.999Z"],
      [null, "2026-10-10T00:00:00Z"],
      ["Outside after", "2026-10-10T17:00:00Z"],
    ];
    for (const [index, [name, created]] of filterValues.entries())
      await db.query("insert into public.cards(id,user_id,name,company,card_type,created_at) values ($1,$2,$3,$4,'custom_card',$5)", [filterIds[index], owner, name, "Acme %_*", created]);
    await db.exec("reset role");
    const foreignFilterId = randomUUID();
    await db.query("insert into public.cards(id,user_id,name,company,card_type,created_at) values ($1,$2,'Foreign','Acme %_*','custom_card','2026-10-10T00:00:00Z')", [foreignFilterId, other]);
    await db.exec("set role authenticated");
    async function filtered(order: string, offset = 0, limit = 100, keyword = "") {
      return (await db.query<{ id: string }>(`select id from public.search_cards($1) where is_archived=false and company=$2 and card_type=$3 and created_at >= $4 and created_at < $5 order by ${order} limit $6 offset $7`, [keyword, "Acme %_*", "custom_card", "2026-10-09T17:00:00Z", "2026-10-10T17:00:00Z", limit, offset])).rows.map(row => row.id);
    }
    const tied = [filterIds[1], filterIds[2]].sort().reverse();
    assert.deepEqual(await filtered("name asc nulls last,created_at desc,id desc"), [...tied, filterIds[3], filterIds[4]]);
    assert.deepEqual(await filtered("name desc nulls last,created_at desc,id desc"), [filterIds[3], ...tied, filterIds[4]]);
    assert.deepEqual(await filtered("created_at desc,id desc"), [filterIds[3], filterIds[4], ...tied]);
    assert.deepEqual(await filtered("created_at asc,id asc"), [...tied.slice().reverse(), filterIds[4], filterIds[3]]);
    const filterPage1 = await filtered("name asc nulls last,created_at desc,id desc", 0, 2);
    const filterPage2 = await filtered("name asc nulls last,created_at desc,id desc", 2, 2);
    assert.deepEqual([...filterPage1, ...filterPage2], [...tied, filterIds[3], filterIds[4]]);
    assert.deepEqual(await filtered("name asc nulls last,id desc", 0, 100, "ALICE"), tied);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [other]);
    assert.deepEqual(await filtered("name asc nulls last,id desc"), [foreignFilterId]);
    assert.deepEqual(await search("Alice"), [otherId]);
    assert.deepEqual(await search("%"), [foreignFilterId]);
    assert.deepEqual(await search("Alice", true), []);
    await db.query("select set_config('request.jwt.claim.sub','',false)");
    assert.deepEqual(await search(""), []);
    await db.exec("reset role");
    const functionInfo = await db.query<{ prosecdef: boolean; proconfig: string[] }>("select prosecdef,proconfig from pg_proc where proname='search_cards'");
    assert.equal(functionInfo.rows[0].prosecdef, false);
    assert.ok(functionInfo.rows[0].proconfig.some(value => value.startsWith("search_path=")));
  } finally { await db.close(); }
});
