import { cn } from "@/lib/utils";

export function ConfidenceBadge({ score }: { score: number | null | undefined }) {
  if (score == null) return <span className="text-xs text-muted-foreground">No AI confidence available</span>;
  const level = score >= 0.9 ? "High" : score >= 0.7 ? "Medium" : "Low";
  return <span className={cn("inline-block rounded-md px-2 py-1 text-xs", score < 0.7 ? "bg-amber-100 text-amber-950 dark:bg-amber-950 dark:text-amber-100" : "bg-muted text-muted-foreground")}>
    {level} AI confidence: {Math.round(score * 100)}%{score < 0.7 ? " — needs review" : ""}
  </span>;
}
