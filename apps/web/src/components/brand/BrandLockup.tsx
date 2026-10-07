"use client";

import { ProntofolioMark } from "@/components/brand/ProntofolioMark";
import { useTenant } from "@/components/tenant/TenantProvider";
import { cn } from "@/lib/utils";
import { wordmark } from "@/lib/wordmark";

/**
 * The product name as the sidebar and the phone header show it.
 *
 * A compound name split by its short name (`lib/wordmark.ts` rule 3 — our own
 * "Prontofolio" + "Pronto") is the logo on its own: a light lead and a bold
 * tail in `--primary`, lowercase, with no mark beside it. It is one short
 * word, so the phone header shows all of it too.
 *
 * Otherwise our own tenant gets the Prontofolio mark beside the name, set in
 * ink — the fallback when the short name is missing. A tenant has no mark
 * here, so its wordmark keeps the two-tone treatment, with the accented part
 * in the tenant's `--primary`.
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

  if (mark.joined) {
    return (
      <h1
        className={cn(
          "min-w-0 truncate font-display lowercase leading-none tracking-tight",
          compact ? "text-lg" : "text-[1.7rem]",
          className
        )}
        aria-label={brand.productName}
        title={brand.productName}
      >
        <span aria-hidden>
          <span className="font-light text-foreground/70">{mark.accent}</span>
          <span className="font-bold text-primary">{mark.rest}</span>
        </span>
      </h1>
    );
  }

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
