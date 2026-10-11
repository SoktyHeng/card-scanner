import { authenticateDrafts } from "@/lib/drafts/auth";
import { draftHandlers } from "@/lib/drafts/handlers";
export const runtime = "nodejs";
export const maxDuration = 60;
export const { GET, POST } = draftHandlers(authenticateDrafts);
