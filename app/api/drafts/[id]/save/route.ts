import { authenticateDrafts } from "@/lib/drafts/auth";
import { singleDraftHandlers } from "@/lib/drafts/handlers";
export const runtime = "nodejs";
export const maxDuration = 60;
export const POST = singleDraftHandlers(authenticateDrafts).SAVE;
