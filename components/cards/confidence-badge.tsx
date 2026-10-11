"use client";
import { T, useLanguage } from "@/components/i18n/language-provider";
import { cn } from "@/lib/utils";
export function ConfidenceBadge({ score }: {
    score: number | null | undefined;
}) {
    const { number } = useLanguage();
    if (score == null)
        return <span className="text-xs text-muted-foreground"><T text={"No AI confidence available"}/></span>;
    const level = score >= 0.9 ? "High" : score >= 0.7 ? "Medium" : "Low";
    return <span className={cn("inline-block rounded-md px-2 py-1 text-xs", score < 0.7 ? "bg-amber-100 text-amber-950 dark:bg-amber-950 dark:text-amber-100" : "bg-muted text-muted-foreground")}>
    {<T text={level}/>}<T text={" AI confidence: "}/>{number(Math.round(score * 100))}<T text={"%"}/>{score < 0.7 ? <T text={" — needs review"}/> : ""}
  </span>;
}
