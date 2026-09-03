import { Info } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * Surfaces where an investing disclaimer is shown. Each one maps to a key in
 * the `Legal` namespace so the wording stays in one place across the app, the
 * PDF export and the mobile client.
 */
export type DisclaimerVariant = "results" | "projections" | "advisor" | "profile";

interface DisclaimerProps {
  variant: DisclaimerVariant;
  /** Frames the notice in a bordered box instead of running it as a footnote. */
  boxed?: boolean;
  className?: string;
}

export function Disclaimer({ variant, boxed = false, className }: DisclaimerProps) {
  const t = useTranslations("Legal");
  const text = t(variant);

  if (!boxed) {
    return (
      <p className={cn("text-xs leading-relaxed text-muted-foreground", className)}>
        {text}
      </p>
    );
  }

  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-lg border border-border bg-muted/40 p-3",
        "dark:border-border/50 dark:bg-card/40",
        className
      )}
    >
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <p className="text-xs leading-relaxed text-muted-foreground">{text}</p>
    </div>
  );
}
