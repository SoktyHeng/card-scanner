import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {loadEnvConfig} from "@next/env";
import {createClient} from "@supabase/supabase-js";
import type {Database} from "../types/database";
import {getPublicEnv} from "../lib/env";
loadEnvConfig(process.cwd());
let stage = "sign-in";
async function main() {
  const {url,key} = getPublicEnv();
  const contexts = [];
  for (const suffix of ["A","B"]) {
    const email = process.env[`TEST_USER_${suffix}_EMAIL`], password = process.env[`TEST_USER_${suffix}_PASSWORD`];
    if (!email || !password) throw new Error("Missing test credentials");
    const supabase = createClient<Database>(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(30000)})}});
    const auth = await supabase.auth.signInWithPassword({email,password});
    assert.equal(auth.error,null); assert.ok(auth.data.user);
    contexts.push({supabase,userId:auth.data.user.id});
  }
  const [a,b] = contexts; assert.notEqual(a.userId,b.userId);
  const ca = randomUUID(), cb = randomUUID(), tag = `verify-${randomUUID()}`, note = "<script>test</script>\nខ្មែរ";
  try {
    stage = "fixture setup";
    for (const [context,id] of [[a,ca],[b,cb]] as const) assert.equal((await context.supabase.from("cards").insert({id,user_id:context.userId,name:"Organization verification",raw_ocr_text:"synthetic source",ai_extraction:{name:"synthetic AI"}})).error,null);
    const read = async () => {
      const result = await a.supabase.from("cards").select("*").eq("id",ca).single(); assert.equal(result.error,null); assert.ok(result.data); return result.data;
    };
    const organize = (expected:string,notes=note) => a.supabase.rpc("organize_card",{p_id:ca,p_expected:expected,p_notes:notes,p_favorite:true,p_tags:[tag,tag.toUpperCase()]});
    stage = "organization and duplicate labels";
    let card = await read();
    const saved = await organize(card.updated_at); assert.equal(saved.error,null); assert.equal(typeof saved.data,"string");
    card = await read(); assert.equal(card.notes,note); assert.equal(card.is_favorite,true); assert.equal(card.raw_ocr_text,"synthetic source"); assert.deepEqual(card.ai_extraction,{name:"synthetic AI"});
    const names = await a.supabase.rpc("card_tag_names",{p_id:ca}); assert.equal(names.error,null); assert.equal(names.data?.length,1); const tagA = names.data![0].id;
    const filtered = await a.supabase.rpc("filter_cards",{p_query:"Organization verification",p_tag:tag.toUpperCase(),p_favorites:true}).eq("id",ca); assert.equal(filtered.error,null); assert.equal(filtered.data?.length,1);
    console.log("PASS: private notes/favorites, duplicate tag names, combined filters and unchanged extraction");
    stage = "cross-user access";
    assert.equal((await b.supabase.from("cards").select("id").eq("id",ca)).data?.length,0);
    assert.equal((await b.supabase.from("tags").select("id").eq("id",tagA)).data?.length,0);
    assert.equal((await b.supabase.from("card_tags").select("card_id").eq("card_id",ca)).data?.length,0);
    assert.equal((await b.supabase.rpc("card_tag_names",{p_id:ca})).data?.length,0);
    assert.equal((await b.supabase.rpc("organize_card",{p_id:ca,p_expected:card.updated_at,p_notes:"forged",p_favorite:false,p_tags:[]})).error?.code,"P0002");
    assert.ok((await a.supabase.from("card_tags").insert({card_id:cb,tag_id:tagA,user_id:a.userId})).error);
    assert.ok((await b.supabase.from("card_tags").insert({card_id:cb,tag_id:tagA,user_id:b.userId})).error);
    assert.ok((await b.supabase.from("card_tags").insert({card_id:ca,tag_id:tagA,user_id:a.userId})).error);
    assert.equal((await b.supabase.from("card_tags").update({card_id:cb}).eq("card_id",ca).select()).data?.length,0);
    assert.equal((await b.supabase.from("card_tags").delete().eq("card_id",ca).select()).data?.length,0);
    const ownTag = await b.supabase.from("tags").insert({user_id:b.userId,name:tag}).select("id").single(); assert.equal(ownTag.error,null); assert.ok(ownTag.data);
    assert.ok((await a.supabase.from("card_tags").update({tag_id:ownTag.data.id}).eq("card_id",ca)).error);
    assert.equal((await b.supabase.from("tags").update({name:"forged"}).eq("id",tagA).select()).data?.length,0);
    assert.equal((await b.supabase.from("tags").delete().eq("id",tagA).select()).data?.length,0);
    console.log("PASS: both accounts isolate tags and card relations for create/read/update/delete");
    stage = "concurrent saves";
    card = await read();
    const results = await Promise.all([organize(card.updated_at,"first"),organize(card.updated_at,"second")]);
    if (results.filter(result=>!result.error).length !== 1 || results.filter(result=>result.error?.code==="PT409").length !== 1) console.error("Concurrent save outcome codes:", results.map(result=>({status:result.status,code:result.error?.code ?? "success"})));
    assert.equal(results.filter(result=>!result.error).length,1); assert.equal(results.filter(result=>result.error?.code==="PT409").length,1);
    stage = "concurrent save result";
    card = await read(); assert.ok(["first","second"].includes(card.notes));
    console.log("PASS: simultaneous organization edits allow one save and reject the stale edit");
    stage = "archive restore and delete";
    for (const archived of [true,false]) {
      assert.equal((await a.supabase.from("cards").update({is_archived:archived}).eq("id",ca)).error,null);
      assert.equal((await read()).notes,card.notes);
      assert.equal((await a.supabase.rpc("card_tag_names",{p_id:ca})).data?.length,1);
    }
    assert.equal((await a.supabase.from("cards").delete().eq("id",ca)).error,null);
    assert.equal((await a.supabase.from("card_tags").select("card_id").eq("card_id",ca)).data?.length,0);
    console.log("PASS: archive/restore preserve organization; permanent deletion removes relations");
  } finally {
    for (const [context,id] of [[a,ca],[b,cb]] as const) {
      assert.equal((await context.supabase.from("cards").delete().eq("id",id)).error,null);
      assert.equal((await context.supabase.from("tags").delete().eq("name_key",tag.toLowerCase())).error,null);
      await context.supabase.auth.signOut({scope:"local"});
    }
  }
}
main().catch(()=>{console.error(`Organization verification failed during ${stage}; credentials and card contents are omitted.`);process.exitCode=1;});
