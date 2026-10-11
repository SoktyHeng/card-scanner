import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import type { Database } from "../types/database";
import { getPublicEnv } from "../lib/env";
import { draftPayloadSchema, draftSaveSchema, DraftError } from "../lib/drafts/schema";
import { discardDraft, findDraft, restoreDraft, saveDraftCard, writeDraft } from "../lib/drafts/service";
import { submissionCardId } from "../lib/cards/save-service";
import { createReviewDraft, editStandardField, validateReviewDraft } from "../lib/cards/review";
import { combineCardSides } from "../lib/ai/card-sides";
import { emptyCard } from "../tests/fixtures/extraction";

loadEnvConfig(process.cwd());
let verificationStage = "sign-in";
async function main() {
  const {url,key}=getPublicEnv();
  const contexts=[];
  for(const suffix of ["A","B"]){
    const email=process.env[`TEST_USER_${suffix}_EMAIL`],password=process.env[`TEST_USER_${suffix}_PASSWORD`];
    if(!email||!password)throw new Error("Test credentials unavailable");
    const supabase=createClient<Database>(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.any([...(init?.signal?[init.signal]:[]),AbortSignal.timeout(30000)])})}});
    const auth=await supabase.auth.signInWithPassword({email,password});
    if(auth.error||!auth.data.user)throw new Error("Test sign-in failed");
    contexts.push({supabase,userId:auth.data.user.id});
  }
  const [a,b]=contexts;assert.notEqual(a.userId,b.userId);
  const id=randomUUID(),discardId=randomUUID();
  const image={bytes:await sharp({create:{width:80,height:50,channels:3,background:"white"}}).png().toBuffer(),mimeType:"image/png" as const};
  verificationStage = "fixture setup";
  const frontSource=emptyCard();
  frontSource.name=`Recovery fixture ${id}`; frontSource.fieldConfidences.name=0.95;
  frontSource.cardNumber=`DRAFT-${id}`; frontSource.fieldConfidences.cardNumber=0.95; frontSource.overallConfidence=0.95;
  const extraction=combineCardSides({front:frontSource,back:emptyCard()});
  const payload=draftPayloadSchema.parse({extraction,review:editStandardField(createReviewDraft(extraction),"name","ការសាកល្បង recovery"),frontName:"front.png",backName:"back.png"});
  const savedId=submissionCardId(a.userId,id);
  try {
    verificationStage = "first draft write";
    let meta=await writeDraft(a,{id,expectedRevision:0,payload,frontMode:"replace",backMode:"replace"},image,image);
    assert.equal(meta.revision,1);
    verificationStage = "isolation";
    const row=await findDraft(a,id);assert.ok(row?.front_path);
    assert.equal((await b.supabase.from("scan_drafts").select("id").eq("id",id)).data?.length,0);
    assert.equal((await b.supabase.from("scan_draft_assets").select("storage_path").eq("draft_id",id)).data?.length,0);
    await assert.rejects(restoreDraft(b,id),error=>error instanceof DraftError&&error.code==="NOT_FOUND");
    const stolen=await b.supabase.storage.from("scan-drafts").download(row.front_path);
    assert.ok(stolen.error&&!stolen.data);
    await b.supabase.storage.from("scan-drafts").remove([row.front_path]);
    assert.ok((await a.supabase.storage.from("scan-drafts").download(row.front_path)).data);
    console.log("PASS: live draft rows, assets and originals isolate both disposable accounts");
    await assert.rejects(writeDraft(a,{id,expectedRevision:0,payload,frontMode:"keep",backMode:"keep"}),error=>error instanceof DraftError&&error.code==="CONFLICT");
    verificationStage = "restoration";
    const restored=await restoreDraft(a,id);assert.ok("payload" in restored);
    assert.deepEqual(restored.payload,payload);assert.ok(restored.frontUrl&&restored.backUrl);
    const download=await fetch(restored.frontUrl);assert.ok(download.ok);assert.deepEqual(Buffer.from(await download.arrayBuffer()),image.bytes);
    const incomplete={...payload,review:editStandardField(payload.review!,"email","unfinished@")};
    meta=await writeDraft(a,{id,expectedRevision:meta.revision,payload:incomplete,frontMode:"keep",backMode:"keep"});
    const valid=validateReviewDraft(payload.review!);assert.ok(valid.success);
    await assert.rejects(saveDraftCard(a,id,draftSaveSchema.parse({expectedRevision:meta.revision,reviewConfirmed:true,reviewedData:valid.data})),error=>error instanceof DraftError&&error.code==="CONFLICT");
    console.log("PASS: live restoration preserves Khmer/corrections and rejects stale or incomplete final review");
    meta=await writeDraft(a,{id,expectedRevision:meta.revision,payload,frontMode:"keep",backMode:"keep"});
    const input=draftSaveSchema.parse({expectedRevision:meta.revision,reviewConfirmed:true,reviewedData:valid.data});
    verificationStage = "final save";
    assert.equal(await saveDraftCard(a,id,input),savedId);
    verificationStage = "save retry receipt";
    assert.equal(await saveDraftCard(a,id,input),savedId);
    verificationStage = "consumed metadata removal";
    assert.equal(await findDraft(a,id),null);
    assert.equal((await a.supabase.from("scan_draft_assets").select("storage_path").eq("draft_id",id)).data?.length,0);
    verificationStage = "consumed image removal";
    const remaining=await a.supabase.storage.from("scan-drafts").list(`${a.userId}/${id}`);
    assert.equal(remaining.error,null);assert.equal(remaining.data?.length,0);
    verificationStage = "one final card";
    assert.equal((await a.supabase.from("cards").select("id").eq("id",savedId)).data?.length,1);
    console.log("PASS: live final save is idempotent and consumes recovery originals only after card confirmation");
    const discarded=await writeDraft(a,{id:discardId,expectedRevision:0,payload:{extraction:null,review:null,frontName:"discard.png",backName:null},frontMode:"replace",backMode:"remove"},image);
    const discardRow=await findDraft(a,discardId);assert.ok(discardRow?.front_path);
    await discardDraft(a,discardId,discarded.revision);
    assert.equal(await findDraft(a,discardId),null);
    const remainingDiscard=await a.supabase.storage.from("scan-drafts").list(`${a.userId}/${discardId}`);
    assert.equal(remainingDiscard.error,null);assert.equal(remainingDiscard.data?.length,0);
    console.log("PASS: live discard removes private originals and their metadata");
  } finally {
    for(const draftId of [id,discardId]) {
      const row=await findDraft(a,draftId);
      if(row)await discardDraft(a,draftId,row.revision);
    }
    const images=await a.supabase.from("card_images").select("storage_path").eq("card_id",savedId);
    if(images.data?.length)assert.equal((await a.supabase.storage.from("card-images").remove(images.data.map(image=>image.storage_path))).error,null);
    assert.equal((await a.supabase.from("cards").delete().eq("id",savedId)).error,null);
    await Promise.all(contexts.map(context=>context.supabase.auth.signOut()));
  }
}
main().catch(error=>{console.error(`FAIL: live draft verification at ${verificationStage}; category ${error instanceof DraftError ? error.code : error instanceof Error && error.message === "Test sign-in failed" ? "TEST_AUTH" : "CHECK_FAILED"}. No secrets printed.`);process.exitCode=1;});
