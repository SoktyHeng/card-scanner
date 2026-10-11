import { authenticateDrafts } from "@/lib/drafts/auth";
import { singleDraftHandlers } from "@/lib/drafts/handlers";
export const runtime = "nodejs";
export const { GET, DELETE } = singleDraftHandlers(authenticateDrafts);
