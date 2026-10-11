import { redirect } from "next/navigation";
import { getPageSession } from "@/lib/auth/session";

export default async function HomePage() {
  redirect(await getPageSession() ? "/dashboard" : "/login");
}
