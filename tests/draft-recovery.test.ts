import "./fixtures/dom";
import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { useDraftRecovery, type RecoverySnapshot } from "../components/scanner/use-draft-recovery";
import { businessCard } from "./fixtures/extraction";
import { createReviewDraft, editStandardField, validateReviewDraft } from "../lib/cards/review";
import { draftPayloadSchema, draftSaveSchema } from "../lib/drafts/schema";
const id = "00000000-0000-4000-8000-000000000013";
const meta = { id, revision: 1, expiresAt: new Date(Date.now()+86400000).toISOString(), updatedAt: new Date().toISOString() };
const extraction = businessCard();
function snapshot(): RecoverySnapshot { return { front: new File(["fixture"],"ខ្មែរ.png",{type:"image/png"}), back:null, payload:{extraction,review:createReviewDraft(extraction),frontName:"ខ្មែរ.png",backName:null} }; }
afterEach(() => { cleanup(); mock.restoreAll(); });
test("recovery accepts incomplete edits without weakening final review validation", () => {
 const value = snapshot(); value.payload.review = editStandardField(value.payload.review!,"email","unfinished@");
 assert.ok(draftPayloadSchema.safeParse(value.payload).success);
 assert.equal(validateReviewDraft(value.payload.review).success,false);
 assert.equal(draftSaveSchema.safeParse({expectedRevision:1,reviewConfirmed:false,reviewedData:{}}).success,false);
 assert.equal(draftPayloadSchema.safeParse({...value.payload,extraction:null}).success,false);
});
test("recovery is opt-in and stores only on explicit enable; final save uses the same draft identity", async () => {
 const calls: {url:string;init?:RequestInit}[]=[];
 mock.method(globalThis,"fetch",async (input: string, init?:RequestInit) => {
  calls.push({url:input,init});
  if (input === "/api/drafts" && !init?.method) return Response.json({drafts:[]});
  if (input === "/api/drafts") {
   const data=JSON.parse(String((init!.body as FormData).get("data")));
   return Response.json({meta:{...meta,id:data.id}});
  }
  return Response.json({success:true,id});
 });
 const value=snapshot(); const hook=renderHook(()=>useDraftRecovery(value,async()=>{},false));
 await waitFor(()=>assert.equal(calls.length,1));
 assert.equal(calls.filter(call=>call.init?.method==="POST").length,0);
 await act(async()=>{hook.result.current.enable();});
 await act(async()=>{await hook.result.current.saveNow();});
 const written=JSON.parse(String((calls[1].init!.body as FormData).get("data")));
 assert.equal(written.expectedRevision,0); assert.equal(written.frontMode,"replace");
 assert.equal(hook.result.current.status,"Recovery saved");
 const review=validateReviewDraft(value.payload.review!); assert.ok(review.success);
 await act(async()=>{await hook.result.current.save(review.data,null);});
 assert.equal(calls[2].url,`/api/drafts/${written.id}/save`);
 assert.equal(JSON.parse(String(calls[2].init!.body)).expectedRevision,1);
 assert.equal(hook.result.current.enabled,false);
});
test("lost write response keeps identity and a concurrent revision never overwrites local edits", async () => {
 const ids:string[]=[];
 mock.method(globalThis,"fetch",async (_input:string,init?:RequestInit) => {
  if (!init?.method) return Response.json({drafts:[]});
  ids.push(JSON.parse(String((init.body as FormData).get("data"))).id);
  if(ids.length===1) throw new Error("lost response");
  return Response.json({error:{code:"CONFLICT"}}, {status:409});
 });
 const value=snapshot(); const hook=renderHook(()=>useDraftRecovery(value,async()=>{},false));
 await act(async()=>{hook.result.current.enable();});
 await act(async()=>{await hook.result.current.saveNow();});
 await act(async()=>{await hook.result.current.saveNow();});
 assert.equal(ids[0],ids[1]); assert.match(hook.result.current.error!,/another tab/);
 assert.equal(value.payload.review!.fields.name,extraction.name);
});
test("resuming restores reviewed values and originals without extracting or creating a card", async () => {
 const value=snapshot(); value.payload.review=editStandardField(value.payload.review!,"name","កែសម្រួល");
 const calls:string[]=[]; let restored: RecoverySnapshot | null=null;
 mock.method(globalThis,"fetch",async (input:string) => {
  calls.push(input);
  if(input==="/api/drafts") return Response.json({drafts:[]});
  if(input.startsWith("https://")) return new Response(new Blob(["fixture"],{type:"image/png"}));
  return Response.json({meta,payload:value.payload,frontUrl:"https://storage.example/original",backUrl:null});
 });
 const empty={front:null,back:null,payload:{extraction:null,review:null,frontName:null,backName:null}};
 const hook=renderHook(()=>useDraftRecovery(empty,async(payload,front,back)=>{restored={payload,front,back};},false));
 await act(async()=>{await hook.result.current.resume(id);});
 assert.ok(restored); assert.equal((restored as RecoverySnapshot).payload.review!.fields.name,"កែសម្រួល");
 assert.equal((restored as RecoverySnapshot).front!.name,"ខ្មែរ.png");
 assert.equal(hook.result.current.enabled,true);
 assert.ok(calls.every(url=>!url.includes("extract")&&!url.includes("/save")));
});
test("session expiration preserves local values and failed discard keeps recovery enabled",async()=>{
 mock.method(globalThis,"fetch",async (_input:string,init?:RequestInit)=>{
  if(!init?.method) return Response.json({drafts:[]});
  if(init.method==="POST") { const data=JSON.parse(String((init.body as FormData).get("data")));return Response.json({meta:{...meta,id:data.id}}); }
  return Response.json({error:{code:"UNAUTHORIZED"}},{status:401});
 });
 const value=snapshot(); const hook=renderHook(()=>useDraftRecovery(value,async()=>{},false));
 await act(async()=>{hook.result.current.enable();});
 await act(async()=>{await hook.result.current.saveNow();});
 await act(async()=>{await hook.result.current.discard(hook.result.current.meta!.id,1);});
 assert.equal(hook.result.current.enabled,true); assert.match(hook.result.current.error!,/session has expired/);
 assert.equal(value.front!.name,"ខ្មែរ.png");
});

test("subsequent edits increment the revision and reuse the already uploaded images",async()=>{
 const payloads: {expectedRevision:number;frontMode:string;payload:RecoverySnapshot["payload"]}[]=[];
 mock.method(globalThis,"fetch",async (_input:string,init?:RequestInit)=>{
  if(!init?.method)return Response.json({drafts:[]});
  const data=JSON.parse(String((init.body as FormData).get("data")));payloads.push(data);
  return Response.json({meta:{...meta,id:data.id,revision:payloads.length}});
 });
 const value=snapshot(); const hook=renderHook(({value})=>useDraftRecovery(value,async()=>{},false),{initialProps:{value}});
 await act(async()=>{hook.result.current.enable();});
 await act(async()=>{await hook.result.current.saveNow();});
 const next={...value,payload:{...value.payload,review:editStandardField(value.payload.review!,"name","New correction")}};
 hook.rerender({value:next});
 await act(async()=>{await hook.result.current.saveNow();});
 assert.equal(payloads[1].expectedRevision,1);assert.equal(payloads[1].frontMode,"keep");
 assert.equal(payloads[1].payload.review!.fields.name,"New correction");
});
