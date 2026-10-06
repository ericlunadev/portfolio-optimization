"use client";

import { ProntofolioMark } from "@/components/brand/ProntofolioMark";
import { useTenant } from "@/components/tenant/TenantProvider";
import { cn } from "@/lib/utils";
import { wordmark } from "@/lib/wordmark";

/**
 * The product name as the sidebar and the phone header show it.
 *
 * Our own tenant gets the Prontofolio mark beside the name, set in ink the way
 * the brand sheet sets it: the mark carries the colour. A tenant has no mark
 * here, so its wordmark keeps the two-tone treatment from `lib/wordmark.ts`,
 * with the accented part in the tenant's `--primary`.
 *
 * `compact` is the phone header: at 390px the controls beside it leave room for
 * a short mark, not a product name: our tenant shows the isotype alone, and a
 * tenant shows only the accented part of its wordmark, truncated rather than
 * wrapped.
 */
export function BrandLockup({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  const { brand, isDefault } = useTenant();
  const mark = wordmark(brand.productName, brand.shortName);

  return (
    <h1
      className={cn(
        "flex min-w-0 items-center font-display font-semibold tracking-tight",
        compact ? "gap-2 text-lg" : "gap-2.5 text-2xl",
        className
      )}
      aria-label={brand.productName}
      title={brand.productName}
    >
      {isDefault && (
        <ProntofolioMark className={compact ? "h-7 w-7" : "h-8 w-8"} />
      )}
      {/* On a phone our mark stands alone, the way the brand sheet uses the
          isotype for app icons: the name beside it does not fit next to the
          header controls at 390px. A tenant has no mark, so it keeps its name. */}
      <span
        className={cn("min-w-0 truncate", compact && isDefault && "hidden")}
        aria-hidden
      >
        <span className={isDefault ? "text-foreground" : "text-primary"}>
          {mark.accent}
        </span>
        {!compact && mark.rest && (
          <>
            {" "}
            <span className="font-normal text-foreground/80">{mark.rest}</span>
          </>
        )}
      </span>
    </h1>
  );
}
