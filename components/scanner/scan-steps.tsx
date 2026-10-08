import { Check } from "lucide-react";
export function ScanSteps({ current }: { current: number }) {
  return <ol aria-label="Scan progress" className="grid grid-cols-5 gap-1 rounded-xl border bg-muted/30 p-3 sm:gap-3 sm:p-4">
    {["Image", "Preview", "Extract", "Review", "Save"].map((label, index) => <li key={label} aria-current={index === current ? "step" : undefined} className="flex min-w-0 flex-col items-center gap-2 text-center">
      <span aria-hidden="true" className={`flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${index <= current ? "bg-primary text-primary-foreground" : "border bg-card text-muted-foreground"}`}>{index < current ? <Check className="size-4" /> : index + 1}</span>
      <span className={`text-[11px] sm:text-sm ${index === current ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{label}<span className="sr-only">{index < current ? ": complete" : index === current ? ": current step" : ": upcoming"}</span></span>
    </li>)}
  </ol>;
}
