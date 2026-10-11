import { T } from "@/components/i18n/language-provider";
import Link from "next/link";
export default function CardNotFound() {
    return <div className="space-y-4"><h1 className="text-2xl font-semibold"><T text={"Card not found"}/></h1><p><T text={"This card is unavailable or does not belong to your account."}/></p><Link href="/cards" className="inline-block rounded py-3 underline focus-visible:outline-2"><T text={"Back to cards"}/></Link></div>;
}
