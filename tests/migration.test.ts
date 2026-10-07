import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

// Real embedded Postgres executes the version-controlled migration. These small
// auth/storage fixtures model Supabase's helpers; live API tests remain separate.
test("foundation migration enforces database and storage ownership", async () => {
  const db = await PGlite.create();
  const userA = "00000000-0000-4000-8000-000000000001";
  const userB = "00000000-0000-4000-8000-000000000002";
  const cardId = "00000000-0000-4000-8000-000000000003";
  const path = `${userA}/${cardId}/original.png`;
  const extra = [
    { label: null, key: "unknown_field", value: "ABC-7788", confidence: 0.35 },
  ];
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
    for (const file of (await readdir("supabase/migrations"))
      .filter((name) => name.endsWith(".sql"))
      .sort()) {
      await db.exec(await readFile(`supabase/migrations/${file}`, "utf8"));
    }
    const bucket = await db.query<{ public: boolean; file_size_limit: number }>(
      "select public, file_size_limit from storage.buckets where id = 'card-images'",
    );
    assert.equal(bucket.rows[0].public, false);
    assert.equal(Number(bucket.rows[0].file_size_limit), 10485760);
    await db.query("insert into auth.users(id) values ($1), ($2)", [
      userA,
      userB,
    ]);
    await db.exec("set role anon");
    await assert.rejects(
      db.query("select * from public.cards"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("insert into public.cards(user_id) values ($1)", [userA]),
      /permission denied/,
    );
    assert.deepEqual(
      (await db.query("select * from storage.objects")).rows,
      [],
    );
    await db.exec("reset role; set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [
      userA,
    ]);
    await db.query(
      "insert into public.cards(id, user_id, extra_fields, original_image_path) values ($1, $2, $3, $4)",
      [cardId, userA, JSON.stringify(extra), path],
    );
    assert.deepEqual(
      (
        await db.query<{ extra_fields: unknown }>(
          "select extra_fields from public.cards",
        )
      ).rows[0].extra_fields,
      extra,
    );
    await assert.rejects(
      db.query(
        "insert into public.cards(user_id, extra_fields) values ($1, '{}')",
        [userA],
      ),
      /cards_extra_fields_array/,
    );
    await assert.rejects(
      db.query(
        "insert into public.cards(user_id, ai_confidence) values ($1, 2)",
        [userA],
      ),
      /cards_confidence_range/,
    );
    await assert.rejects(
      db.query("update public.cards set user_id = $1 where id = $2", [
        userB,
        cardId,
      ]),
      /row-level security/,
    );
    await assert.rejects(
      db.query("insert into public.cards(user_id) values ($1)", [userB]),
      /row-level security/,
    );
    const before = await db.query<{ updated_at: Date }>(
      "select updated_at from public.cards where id = $1",
      [cardId],
    );
    await db.query(
      "update public.cards set name = 'Owner update', is_archived = true where id = $1",
      [cardId],
    );
    const after = await db.query<{
      updated_at: Date;
      name: string;
      is_archived: boolean;
    }>("select updated_at, name, is_archived from public.cards where id = $1", [
      cardId,
    ]);
    assert.equal(after.rows[0].name, "Owner update");
    assert.equal(after.rows[0].is_archived, true);
    assert.ok(
      new Date(after.rows[0].updated_at).getTime() >=
        new Date(before.rows[0].updated_at).getTime(),
    );
    await db.query("update public.cards set raw_ocr_text = 'Original source', ai_extraction = '{\"name\":\"AI name\"}', name = 'Reviewed name', extra_fields = $1, is_archived = false where id = $2", [JSON.stringify(extra), cardId]);
    await db.query("update public.cards set name = 'Edited name', is_archived = true where id = $1", [cardId]);
    assert.equal((await db.query("select id from public.cards where is_archived = false")).rows.length, 0);
    await db.query("update public.cards set is_archived = false where id = $1", [cardId]);
    const restored = await db.query<{ name: string; raw_ocr_text: string; ai_extraction: unknown; extra_fields: unknown }>("select name, raw_ocr_text, ai_extraction, extra_fields from public.cards where is_archived = false", []);
    assert.equal(restored.rows[0].name, "Edited name");
    assert.equal(restored.rows[0].raw_ocr_text, "Original source");
    assert.deepEqual(restored.rows[0].ai_extraction, { name: "AI name" });
    assert.deepEqual(restored.rows[0].extra_fields, extra);
    await db.query(
      "insert into storage.objects(bucket_id, name) values ('card-images', $1)",
      [path],
    );
    assert.equal(
      (await db.query("select * from storage.objects")).rows.length,
      1,
    );
    await assert.rejects(
      db.query("update storage.objects set name = $1", [
        `${userB}/${cardId}/original.png`,
      ]),
      /row-level security/,
    );
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [
      userB,
    ]);
    assert.deepEqual((await db.query("select * from public.cards")).rows, []);
    assert.deepEqual((await db.query("update public.cards set is_archived = true returning id")).rows, []);
    assert.deepEqual((await db.query("update public.cards set is_archived = false returning id")).rows, []);
    assert.deepEqual(
      (
        await db.query(
          "update public.cards set name = 'Forbidden' returning id",
        )
      ).rows,
      [],
    );
    assert.deepEqual(
      (await db.query("delete from public.cards returning id")).rows,
      [],
    );
    assert.deepEqual(
      (await db.query("select * from storage.objects")).rows,
      [],
    );
    assert.deepEqual(
      (
        await db.query(
          "update storage.objects set name = 'Forbidden' returning id",
        )
      ).rows,
      [],
    );
    assert.deepEqual(
      (await db.query("delete from storage.objects returning id")).rows,
      [],
    );
    await assert.rejects(
      db.query(
        "insert into storage.objects(bucket_id, name) values ('card-images', $1)",
        [path],
      ),
      /row-level security/,
    );
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [
      userA,
    ]);
    assert.equal(
      (await db.query("update storage.objects set name = name returning id"))
        .rows.length,
      1,
    );
    assert.equal(
      (await db.query("delete from storage.objects returning id")).rows.length,
      1,
    );
    assert.equal(
      (await db.query("delete from public.cards returning id")).rows.length,
      1,
    );
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
    await assert.rejects(
      db.query("insert into public.cards(user_id) values ($1)", [userA]),
      /row-level security/,
    );
  } finally {
    await db.close();
  }
});
