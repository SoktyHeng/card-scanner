import { cn } from "@/lib/utils";

/** Decorative only; the containing loading view supplies the announcement. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("skeleton relative overflow-hidden rounded-lg", className)} />;
}
