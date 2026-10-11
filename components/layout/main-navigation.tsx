"use client";
import { T, useLanguage } from "@/components/i18n/language-provider";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, CreditCard, ScanLine } from "lucide-react";
export function MainNavigation() {
    return <NavigationLinks pathname={usePathname()}/>;
}
export function NavigationLinks({ pathname }: {
    pathname: string;
}) {
    const { t } = useLanguage();
    return <nav aria-label={t("Main navigation")} className="grid w-full grid-cols-3 gap-1 rounded-xl bg-muted/60 p-1 md:w-auto">
    {[{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }, { href: "/cards", label: "Cards", icon: CreditCard }, { href: "/scan", label: "Scan card", icon: ScanLine }].map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${active ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:bg-card/70 hover:text-foreground"}`}><Icon className="hidden size-4 sm:block" aria-hidden="true"/>{<T text={label}/>}</Link>;
        })}
  </nav>;
}
