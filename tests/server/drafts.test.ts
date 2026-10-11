import assert from "node:assert/strict";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import type { Database, ScanDraftRow } from "../../types/database";
import { cleanupDraft, restoreDraft, saveDraftCard, writeDraft } from "../../lib/drafts/service";
import { draftHandlers, singleDraftHandlers } from "../../lib/drafts/handlers";
import { draftSaveSchema } from "../../lib/drafts/schema";
import { createReviewDraft, validateReviewDraft } from "../../lib/cards/review";
import { businessCard } from "../fixtures/extraction";
const userId="00000000-0000-4000-8000-000000000001",id="00000000-0000-4000-8000-000000000013";
const path=`${userId}/${id}/${"a".repeat(64)}.png`;
function row(): ScanDraftRow { return {id,user_id:userId,revision:1,state:"active",payload:{extraction:businessCard(),review:createReviewDraft(businessCard()),frontName:"card.png",backName:null} as unknown as ScanDraftRow["payload"],front_path:path,back_path:null,final_card_id:null,lease_until:null,created_at:new Date().toISOString(),updated_at:new Date().toISOString(),expires_at:new Date(Date.now()+86400000).toISOString()}; }
function context(handler:(url:URL,init:RequestInit)=>Promise<Response>) {
 const requests:{url:URL;init:RequestInit}[]=[];
 const supabase=createClient<Database>("https://project.example","public-key",{auth:{persistSession:false},global:{fetch:async(input,init)=>{const url=new URL(String(input));const request={url,init:init??{}};requests.push(request);return handler(url,request.init);}}});
 return {userId,supabase,requests};
}
const json=(data:unknown,status=200)=>Response.json(data,{status});
test("draft endpoints authenticate before parsing and deny foreign-origin mutations",async()=>{
 let calls=0; const api=draftHandlers(async()=>{calls++;return null;});
 assert.equal((await api.GET(new Request("http://localhost:3000/api/drafts"))).status,401);
 const request=new Request("http://localhost:3000/api/drafts",{method:"POST",headers:{origin:"https://other.example"}});
 assert.equal((await api.POST(request)).status,403);assert.equal(calls,1);
 const result=await draftHandlers(async()=>{throw new Error("private token");}).GET(new Request("http://localhost:3000/api/drafts"));
 assert.equal(result.status,503);assert.ok(!JSON.stringify(await result.json()).includes("private token"));
 assert.match(result.headers.get("cache-control")!,/no-store/);
});
test("draft restore checks committed card first, remains owner-scoped and skips expired images",async()=>{
 const ctx=context(async(url)=>{
  assert.equal(url.searchParams.get("user_id"),`eq.${userId}`);
  if(url.pathname.endsWith("cards"))return json(null);
  return json({...row(),expires_at:new Date(Date.now()-1000).toISOString()});
 });
 await assert.rejects(restoreDraft(ctx,id),/expired/);
 assert.equal(ctx.requests.length,2);
 const receipt=context(async()=>json({id}));
 assert.deepEqual(await restoreDraft(receipt,id),{savedCardId:id});assert.equal(receipt.requests.length,1);
});
test("final draft save validates stored corrections and retries confirmed saves without consuming again",async()=>{
 const reviewed=validateReviewDraft(createReviewDraft(businessCard()));assert.ok(reviewed.success);
 const input=draftSaveSchema.parse({expectedRevision:1,reviewConfirmed:true,reviewedData:{...reviewed.data,name:"Different review"}});
 const ctx=context(async(url)=>url.pathname.endsWith("cards")?json(null):json(row()));
 await assert.rejects(saveDraftCard(ctx,id,input),/another tab/);
 assert.equal(ctx.requests.length,2);
 const receipt=context(async()=>json({id}));
 assert.equal(await saveDraftCard(receipt,id,input),id);assert.equal(receipt.requests.length,1);
});
test("interrupted draft write uses compare-and-swap and preserves its previous image snapshot",async()=>{
 const ctx=context(async(url,init)=>{
  if(url.pathname.endsWith("scan_draft_assets"))return json([]);
  if(init.method==="PATCH") {
   assert.equal(url.searchParams.get("revision"),"eq.1");assert.equal(url.searchParams.get("state"),"eq.active");
   return json(null);
  }
  if(url.searchParams.has("or"))return json([]);
  return json(row());
 });
 await assert.rejects(writeDraft(ctx,{id,expectedRevision:1,payload:{extraction:businessCard(),review:createReviewDraft(businessCard()),frontName:"card.png",backName:null},frontMode:"keep",backMode:"remove"}),/another tab/);
 assert.equal(ctx.requests.filter(request=>request.init.method==="DELETE").length,0);
});
test("cleanup retains the reservation on storage failure and removes objects before metadata",async()=>{
 const consumed: ScanDraftRow={...row(),state:"consumed"};
 const failed=context(async(url)=>url.pathname.includes("storage")?json({message:"unavailable"},503):json([{storage_path:path}]));
 await assert.rejects(cleanupDraft(failed,consumed),/temporarily unavailable/);
 assert.equal(failed.requests.filter(request=>request.url.pathname.startsWith("/rest")&&request.init.method==="DELETE").length,0);
 const done=context(async(url,init)=>{
  if(init.method==="DELETE")return json(url.pathname.includes("storage")?[{name:path}]:url.pathname.endsWith("scan_draft_assets")?[{storage_path:path}]:[{id}]);
  return json([{storage_path:path}]);
 });
 await cleanupDraft(done,consumed);
 assert.deepEqual(done.requests.filter(request=>request.init.method==="DELETE").map(request=>request.url.pathname),["/storage/v1/object/scan-drafts","/rest/v1/scan_draft_assets","/rest/v1/scan_drafts"]);
});
test("cleanup leaves an active save lease and originals untouched",async()=>{
 const ctx=context(async()=>{throw new Error("must not run");});
 await cleanupDraft(ctx,{...row(),state:"saving",lease_until:new Date(Date.now()+300000).toISOString(),expires_at:new Date(Date.now()-1000).toISOString()});
 assert.equal(ctx.requests.length,0);
});
test("final-save endpoint requires explicit review and validated payload before storage or RPC",async()=>{
 const ctx=context(async()=>{throw new Error("must not run");});
 const response=await singleDraftHandlers(async()=>ctx).SAVE(new Request(`http://localhost:3000/api/drafts/${id}/save`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({expectedRevision:1,reviewConfirmed:false,reviewedData:{}})}),{params:Promise.resolve({id})});
 assert.equal(response.status,422);assert.equal(ctx.requests.length,0);
});

test("an account switch rejects the old scan owner before any draft access",async()=>{
 const ctx=context(async()=>{throw new Error("must not run");});
 const response=await draftHandlers(async()=>ctx).GET(new Request("http://localhost:3000/api/drafts",{headers:{"x-draft-owner":"00000000-0000-4000-8000-000000000002"}}));
 assert.equal(response.status,401);assert.equal(ctx.requests.length,0);
});
