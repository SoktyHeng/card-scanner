import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";
export async function proxy(request: NextRequest) {
  return updateSession(request);
}
export const config = {
  matcher: [
    "/",
    "/login",
    "/auth/:path*",
    "/dashboard/:path*",
    "/cards/:path*",
    "/scan/:path*",
  ],
};
