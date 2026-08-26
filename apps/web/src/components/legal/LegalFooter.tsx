import Link from "next/link";
import { getTranslations } from "next-intl/server";

/**
 * One-line disclaimer closing every authenticated page, linking to the full
 * notice at `/legal`. Rendered inside `<main>` so it clears the mobile tab bar.
 */
export async function LegalFooter() {
  const t = await getTranslations("Legal");

  return (
    <footer className="mt-10 border-t border-border pt-4 dark:border-border/50">
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        {t("footerNotice")}{" "}
        <Link
          href="/legal"
          className="underline underline-offset-2 transition-colors hover:text-foreground"
        >
          {t("footerLink")}
        </Link>
      </p>
    </footer>
  );
}
