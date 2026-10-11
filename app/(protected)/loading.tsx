import { T } from "@/components/i18n/language-provider";
import { Skeleton } from "@/components/ui/skeleton";
export default function Loading() {
    return <section aria-busy="true" aria-label="Page loading" className="space-y-6">
    <p role="status" aria-live="polite" className="sr-only"><T text={"Loading page\u2026"}/></p>
    <div aria-hidden="true" className="space-y-6">
      <Skeleton className="h-9 w-48"/>
      <Skeleton className="h-5 w-3/4 max-w-md"/>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map(index => <Skeleton key={index} className="h-40 w-full rounded-xl"/>)}
      </div>
    </div>
  </section>;
}
