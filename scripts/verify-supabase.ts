import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { getPublicEnv } from "../lib/env";
import { matchDuplicate, type DuplicateInput } from "../lib/cards/duplicates";
import type { Database } from "../types/database";

async function main() {
  loadEnvConfig(process.cwd());
  const { url, key } = getPublicEnv();
  const credentials = ["A", "B"].map((suffix) => ({
    email: process.env[`TEST_USER_${suffix}_EMAIL`],
    password: process.env[`TEST_USER_${suffix}_PASSWORD`],
  }));
  const missingCredentials = credentials.some(({ email, password }) => !email || !password);
  const client = () =>
    createClient<Database>(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  const anonymous = client();
  function sessionClient() {
    const jar = new Map<string, string>();
    const supabase = createServerClient<Database>(url, key, {
      cookies: {
        getAll: () => Array.from(jar, ([name, value]) => ({ name, value })),
        setAll: cookies => { for (const { name, value } of cookies) jar.set(name, value); },
      },
    });
    return { supabase, cookie: () => Array.from(jar, ([name, value]) => `${name}=${value}`).join("; ") };
  }
  const authHealth = await fetch(`${url}/auth/v1/settings`, {
    headers: { apikey: key },
    signal: AbortSignal.timeout(15000),
  });
  assert.ok(authHealth.ok, `Auth endpoint returned ${authHealth.status}`);
  console.log("PASS: Auth endpoint and public configuration");
  const anonRead = await anonymous.from("cards").select("id").limit(1);
  if (anonRead.error?.code === "PGRST205") {
    console.log(
      "BLOCKED: The cards table is not exposed by the configured project's Data API. Apply the foundation migration and check schema exposure before database/storage verification.",
    );
    console.log(missingCredentials
      ? "BLOCKED: Two disposable test-account credentials are also required to verify successful sign-in, refresh, sign-out and cross-user access through live APIs."
      : "Test-account credentials are configured. Their sign-in and access checks will run once the cards table is available.");
    process.exitCode = 2;
    return;
  }
  if (anonRead.error)
    console.log(`Database probe code: ${anonRead.error.code}`);
  assert.ok(
    anonRead.error && ["42501", "PGRST301"].includes(anonRead.error.code),
    "Anonymous reads must be denied; apply the migration if the table is missing.",
  );
  console.log("PASS: Anonymous database access denied");
  const anonymousImages = await anonymous.from("card_images").select("id").limit(1);
  const anonymousSave = await anonymous.rpc("save_card_with_images", { p_card: {}, p_images: [] });
  if (anonymousImages.error?.code === "PGRST205" || anonymousSave.error?.code === "PGRST202") {
    console.log("BLOCKED: Apply the card_front_back_images migration before image metadata and transactional-save verification.");
    process.exitCode = 2;
  } else {
    for (const response of [anonymousImages, anonymousSave]) {
      assert.ok(response.error && ["42501", "PGRST301"].includes(response.error.code), "Anonymous image metadata and transactional saves must be denied");
    }
    console.log("PASS: Anonymous image metadata and transactional-save execution denied");
  }
  const anonymousSearch = await anonymous.rpc("search_cards", { p_query: "verification" }).select("id").limit(1);
  if (anonymousSearch.error?.code === "PGRST202") {
    console.log("BLOCKED: The card_keyword_search migration is not exposed on the hosted project yet.");
    process.exitCode = 2;
  } else {
    assert.ok(anonymousSearch.error && ["42501", "PGRST301"].includes(anonymousSearch.error.code), "Anonymous search must be denied");
    console.log("PASS: Anonymous keyword-search execution denied");
  }

  if (missingCredentials) {
    console.log(
      "BLOCKED: Set TEST_USER_A/B_EMAIL and TEST_USER_A/B_PASSWORD for sign-in, refresh, CRUD, keyword search, duplicate matching, private storage, and user isolation checks.",
    );
    process.exitCode = 2;
  } else {
    const sessionA = sessionClient();
    const sessionB = sessionClient();
    const a = sessionA.supabase;
    const b = sessionB.supabase;
    const sessions = [];
    for (const [index, supabase] of [a, b].entries()) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: credentials[index].email!,
        password: credentials[index].password!,
      });
      if (error) {
        const safeCode = ["invalid_credentials", "email_not_confirmed", "over_request_rate_limit"].includes(error.code ?? "") ? error.code : "AUTH_FAILED";
        console.log(`FAIL: Test account ${index + 1} sign-in: ${safeCode}`);
        await Promise.all([a, b].map(supabase => supabase.auth.signOut({ scope: "local" })));
      }
      assert.equal(error, null, `Test account ${index + 1} could not sign in`);
      assert.ok(data.user);
      sessions.push(data.user);
      console.log(`PASS: Test account ${index + 1} sign-in`);
    }
    const [userA, userB] = sessions;
    if (userA.id === userB.id) {
      console.log("FAIL: Both credentials identify the same account. Configure two distinct users.");
      await Promise.all([a, b].map(supabase => supabase.auth.signOut({ scope: "local" })));
    }
    assert.notEqual(userA.id, userB.id, "Use two distinct test accounts");
    const id = randomUUID();
    const path = `${userA.id}/${id}/original.png`;
    const backPath = `${userA.id}/${id}/back.png`;
    let cardCreated = false;
    let imageCreated = false;
    try {
      const { error: refreshError } = await a.auth.refreshSession();
      assert.equal(refreshError, null);
      const { data: verified, error: verifyError } = await a.auth.getUser();
      assert.equal(verifyError, null);
      assert.equal(verified.user?.id, userA.id);
      console.log("PASS: Sign-in, refresh and verified user");
      const insert = await a.rpc("save_card_with_images", {
        p_card: {
          id,
          user_id: userA.id,
          name: "Foundation verification",
          company: "Verification company",
          email: `${id}@example.com`,
          phone: "+855 (12) 345-678",
          card_number: id,
          original_image_path: path,
          extra_fields: [
            {
              label: null,
              key: "unknown_field",
              value: "ABC-7788",
              confidence: 0.35,
            },
          ],
        },
        p_images: [{ side: "front", storage_path: path }, { side: "back", storage_path: backPath }],
      });
      assert.equal(insert.error, null, "Own card insert failed");
      cardCreated = true;
      const ownImages = await a.from("card_images").select("side,storage_path").eq("card_id", id).order("side");
      assert.equal(ownImages.error, null);
      assert.deepEqual(ownImages.data, [{ side: "back", storage_path: backPath }, { side: "front", storage_path: path }]);
      const foreignImages = await b.from("card_images").select("id").eq("card_id", id);
      assert.equal(foreignImages.error, null);
      assert.deepEqual(foreignImages.data, []);
      const foreignImageDelete = await b.from("card_images").delete().eq("card_id", id).select("id");
      assert.equal(foreignImageDelete.error, null);
      assert.deepEqual(foreignImageDelete.data, []);
      assert.ok((await b.from("card_images").insert({ card_id: id, side: "front", storage_path: `${userB.id}/${id}/front.png` })).error);
      const forgedId = randomUUID();
      assert.ok((await b.rpc("save_card_with_images", { p_card: { id: forgedId, user_id: userA.id, original_image_path: `${userA.id}/${forgedId}/original.png` }, p_images: [{ side: "front", storage_path: `${userA.id}/${forgedId}/original.png` }] })).error);
      const forgedRead = await a.from("cards").select("id").eq("id", forgedId);
      assert.equal(forgedRead.error, null);
      assert.deepEqual(forgedRead.data, []);
      console.log("PASS: Transactional front/back metadata, cross-user image denial and forged RPC rollback");
      const search = await a.rpc("search_cards", { p_query: "FOUNDATION verification" }).select("id").eq("id", id);
      if (search.error?.code === "PGRST202") {
        console.log("BLOCKED: Apply the card_keyword_search migration before live keyword-search verification.");
        process.exitCode = 2;
      } else {
        assert.equal(search.error, null, "Own keyword search failed");
        assert.deepEqual(search.data, [{ id }]);
        const forbiddenSearch = await b.rpc("search_cards", { p_query: "Foundation verification" }).select("id").eq("id", id);
        assert.equal(forbiddenSearch.error, null);
        assert.deepEqual(forbiddenSearch.data, []);
        const punctuation = await a.rpc("search_cards", { p_query: "%_\\" }).select("id").eq("id", id);
        assert.equal(punctuation.error, null);
        assert.deepEqual(punctuation.data, []);
        console.log("PASS: Case-insensitive keyword search, literal wildcards and cross-user denial");
      }
      const read = await a.from("cards").select("*").eq("id", id).single();
      assert.equal(read.error, null);
      assert.ok(read.data);
      const empty: DuplicateInput = { email: null, phone: null, secondaryPhone: null, cardNumber: null, name: null, company: null };
      for (const [values, reason] of [
        [{ email: `${id.toUpperCase()}@EXAMPLE.COM` }, "email"],
        [{ phone: "+85512345678" }, "phone"],
        [{ cardNumber: id }, "card_number"],
        [{ name: "FOUNDATION verification", company: "Verification  company" }, "name_company"],
      ] as const) {
        assert.deepEqual(matchDuplicate({ ...empty, ...values }, read.data)?.reasons, [reason]);
      }
      assert.equal(matchDuplicate(empty, read.data), null);
      const foreignCandidates = await b.from("cards").select("*").eq("user_id", userA.id).eq("id", id);
      assert.equal(foreignCandidates.error, null);
      assert.deepEqual(foreignCandidates.data, []);
      console.log("PASS: Live duplicate comparison fields, all matching rules and cross-user candidate denial");
      assert.deepEqual(read.data?.extra_fields, [
        {
          label: null,
          key: "unknown_field",
          value: "ABC-7788",
          confidence: 0.35,
        },
      ]);
      assert.deepEqual(
        (await b.from("cards").select("id").eq("id", id)).data,
        [],
      );
      assert.ok((await b.from("cards").insert({ user_id: userA.id })).error);
      assert.ok(
        (await a.from("cards").update({ user_id: userB.id }).eq("id", id))
          .error,
      );
      const deniedUpdate = await b
        .from("cards")
        .update({ name: "Forbidden" })
        .eq("id", id)
        .select("id");
      assert.equal(deniedUpdate.error, null);
      assert.deepEqual(deniedUpdate.data, []);
      const deniedDelete = await b
        .from("cards")
        .delete()
        .eq("id", id)
        .select("id");
      assert.equal(deniedDelete.error, null);
      assert.deepEqual(deniedDelete.data, []);
      const update = await a
        .from("cards")
        .update({ name: "Verified", is_archived: true })
        .eq("id", id)
        .select("name,is_archived")
        .single();
      assert.equal(update.error, null);
      assert.equal(update.data?.name, "Verified");
      assert.equal(update.data?.is_archived, true);
      console.log(
        "PASS: Database ownership CRUD, owner reassignment denial and JSONB roundtrip",
      );

      const png = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
        "base64",
      );
      const bucketA = a.storage.from("card-images");
      const bucketB = b.storage.from("card-images");
      const uploaded = await bucketA.upload(path, png, {
        contentType: "image/png",
      });
      assert.equal(uploaded.error, null, "Own image upload failed");
      imageCreated = true;
      assert.equal((await bucketA.download(path)).error, null);
      assert.ok((await bucketB.download(path)).error);
      assert.ok(
        (
          await bucketB.upload(`${userA.id}/${id}/forbidden.png`, png, {
            contentType: "image/png",
          })
        ).error,
      );
      assert.ok(
        (await bucketB.update(path, png, { contentType: "image/png" })).error,
      );
      assert.ok(
        (await bucketA.move(path, `${userB.id}/${id}/original.png`)).error,
      );
      const forbiddenRemove = await bucketB.remove([path]);
      assert.equal(forbiddenRemove.error, null);
      assert.deepEqual(forbiddenRemove.data, []);
      assert.equal(
        (await bucketA.update(path, png, { contentType: "image/png" })).error,
        null,
      );
      assert.ok((await bucketB.createSignedUrl(path, 60)).error);
      assert.ok(
        (await anonymous.storage.from("card-images").download(path)).error,
      );
      const publicUrl = bucketA.getPublicUrl(path).data.publicUrl;
      assert.equal(
        (await fetch(publicUrl, { signal: AbortSignal.timeout(15000) })).ok,
        false,
        "Bucket must not expose public objects",
      );
      const signed = await bucketA.createSignedUrl(path, 60);
      assert.equal(signed.error, null);
      assert.ok(signed.data);
      assert.ok(
        (
          await fetch(signed.data.signedUrl, {
            signal: AbortSignal.timeout(15000),
          })
        ).ok,
      );
      console.log(
        "PASS: Private storage CRUD, signed URLs and cross-user denial",
      );
      if (process.env.APP_BASE_URL) {
        const base = new URL(process.env.APP_BASE_URL).origin;
        const ownPage = await fetch(`${base}/cards/${id}`, { headers: { Cookie: sessionA.cookie() }, signal: AbortSignal.timeout(30000) });
        assert.equal(ownPage.status, 200, "Owner detail route failed");
        assert.ok((await ownPage.text()).includes("Loading your card"));
        const ownRead = await fetch(`${base}/api/workspace?type=detail&id=${id}`, { headers: { Cookie: sessionA.cookie() }, signal: AbortSignal.timeout(30000) });
        assert.equal(ownRead.status, 200, "Owner cached-data endpoint failed");
        const ownData = await ownRead.json();
        assert.equal(ownData.owner, userA.id);
        assert.equal(ownData.data.card.name, "Verified");
        for (const method of ["PATCH", "DELETE"]) {
          const denied = await fetch(`${base}/api/cards/${id}`, { method, headers: { Cookie: sessionB.cookie(), Origin: base, "Content-Type": "application/json" }, body: JSON.stringify(method === "DELETE" ? { confirmed: true } : { operation: "archive" }), signal: AbortSignal.timeout(30000) });
          assert.equal(denied.status, 404, "Cross-user mutation must be denied");
          assert.equal((await denied.json()).error.code, "NOT_FOUND");
        }
        const foreignPage = await fetch(`${base}/cards/${id}`, { headers: { Cookie: sessionB.cookie() }, signal: AbortSignal.timeout(30000) });
        const foreignHtml = await foreignPage.text();
        assert.ok(foreignHtml.includes("This card could not be found") || foreignHtml.includes("Card not found"));
        assert.ok(!foreignHtml.includes("Foundation verification") && !foreignHtml.includes(`${id}@example.com`));
        const restored = await fetch(`${base}/api/cards/${id}`, { method: "PATCH", headers: { Cookie: sessionA.cookie(), Origin: base, "Content-Type": "application/json" }, body: JSON.stringify({ operation: "restore" }), signal: AbortSignal.timeout(30000) });
        assert.equal(restored.status, 200, "Owner restore route failed");
        const afterRestore = await a.from("cards").select("is_archived").eq("id", id).single();
        assert.equal(afterRestore.error, null);
        assert.equal(afterRestore.data?.is_archived, false);
        console.log("PASS: Live authenticated detail/restore routes and cross-user detail/mutation denial");
      }
    } finally {
      if (imageCreated)
        assert.equal(
          (await a.storage.from("card-images").remove([path])).error,
          null,
          "Image cleanup failed",
        );
      if (cardCreated) {
        const deleted = await a
          .from("cards")
          .delete()
          .eq("id", id)
          .select("id");
        assert.equal(deleted.error, null, "Card cleanup failed");
        assert.equal(deleted.data?.length, 1);
      }
      for (const supabase of [a, b]) {
        assert.equal(
          (await supabase.auth.signOut({ scope: "local" })).error,
          null,
        );
        assert.equal((await supabase.auth.getSession()).data.session, null);
      }
      console.log("PASS: Own delete, cleanup and sign-out");
    }
  }
}

main().catch(() => {
  console.error(
    "FAIL: Supabase verification could not complete. Check migration, project connectivity and test account configuration. No credentials or card contents are logged.",
  );
  process.exitCode = 1;
});
