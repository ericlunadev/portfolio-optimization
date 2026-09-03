"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { CalendarClock, ExternalLink, Loader2, X } from "lucide-react";
import { useWallet, useBookAdvisorCall } from "@/hooks/useBilling";
import { useOrgSettings } from "@/hooks/useOrgSettings";
import { advisorCtaView } from "@/lib/org-settings";
import { Disclaimer } from "@/components/legal/Disclaimer";
import { ApiError } from "@/lib/api";

type ModalView = "confirm" | "insufficient" | "success";

/**
 * Rendered only where the caller's organization has an advisor to book: the
 * platform's, in `advisor_mode = 'platform'`, or the tenant's own. Anything else
 * renders nothing at all — routing a tenant's clients to our advisor is a channel
 * conflict and, in most jurisdictions, a licensing problem. See PLAN Task 3.3.
 *
 * The cost and the advisor's name are data, not constants and not translated
 * copy, so a tenant inherits neither our price nor our possessive.
 */
export function AdvisorCallCta() {
  const t = useTranslations("AdvisorCta");
  const { settings } = useOrgSettings();
  const advisor = advisorCtaView(settings);
  const cost = advisor.visible ? advisor.costCredits : 0;
  const providerName = advisor.visible ? advisor.providerName : null;

  const { data: wallet } = useWallet();
  const balance = wallet?.credits ?? 0;
  const canAfford = balance >= cost;

  const [open, setOpen] = useState(false);
  const [view, setView] = useState<ModalView>("confirm");
  const [bookingUrl, setBookingUrl] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");

  const book = useBookAdvisorCall();

  function openModal() {
    setView(canAfford ? "confirm" : "insufficient");
    setErrorMessage("");
    setBookingUrl(null);
    setIdempotencyKey(crypto.randomUUID());
    setOpen(true);
  }

  function closeModal() {
    setOpen(false);
    book.reset();
  }

  async function handleConfirm() {
    setErrorMessage("");
    try {
      const result = await book.mutateAsync(idempotencyKey);
      setBookingUrl(result.bookingUrl);
      setView("success");
    } catch (err) {
      if (err instanceof ApiError && err.isInsufficientCredits()) {
        setView("insufficient");
        return;
      }
      setErrorMessage(t("errorGeneric"));
    }
  }

  // After every hook, so the hook order does not change with the tenant.
  if (!advisor.visible) return null;

  return (
    <>
      <div className="glass-card mt-6 p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-primary/15 p-2 text-primary dark:bg-primary/10">
              <CalendarClock className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-medium text-foreground">{t("title")}</h3>
              <p className="text-sm text-muted-foreground">
                {providerName
                  ? t("subtitleNamed", { provider: providerName })
                  : t("subtitle")}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={openModal}
            className="shrink-0 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-all hover:brightness-110"
          >
            {t("button")}
          </button>
        </div>
        <Disclaimer variant="advisor" className="mt-4" />
      </div>

      {open && (
        <AdvisorModal
          view={view}
          balance={balance}
          cost={cost}
          providerName={providerName}
          bookingUrl={bookingUrl}
          errorMessage={errorMessage}
          isPending={book.isPending}
          onConfirm={handleConfirm}
          onClose={closeModal}
        />
      )}
    </>
  );
}

interface AdvisorModalProps {
  view: ModalView;
  balance: number;
  cost: number;
  providerName: string | null;
  bookingUrl: string | null;
  errorMessage: string;
  isPending: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

function AdvisorModal({
  view,
  balance,
  cost,
  providerName,
  bookingUrl,
  errorMessage,
  isPending,
  onConfirm,
  onClose,
}: AdvisorModalProps) {
  const t = useTranslations("AdvisorCta");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4 backdrop-blur-sm dark:bg-black/60"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-lg md:p-6 dark:shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={t("cancel")}
          className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        {view === "confirm" && (
          <div className="space-y-4">
            <div>
              <h2 className="font-display text-xl tracking-tight">
                {providerName
                  ? t("modalTitleNamed", { provider: providerName })
                  : t("modalTitle")}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {t("modalBody", { cost })}
              </p>
              <p className="mt-3 text-xs text-muted-foreground">
                {t("modalBalance", { balance })}
              </p>
            </div>

            <Disclaimer variant="advisor" boxed />

            {errorMessage && (
              <div className="rounded-lg border border-rose-600/40 bg-rose-500/10 p-3 text-sm text-rose-700 dark:border-rose-500/30 dark:text-rose-200">
                {errorMessage}
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isPending}
                className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
              >
                {t("cancel")}
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={isPending}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("confirm", { cost })}
              </button>
            </div>
          </div>
        )}

        {view === "insufficient" && (
          <div className="space-y-4">
            <div>
              <h2 className="font-display text-xl tracking-tight">
                {t("insufficientTitle")}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {t("insufficientBody", { cost, balance })}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {t("cancel")}
              </button>
              <Link
                href="/billing"
                onClick={onClose}
                className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-center text-sm font-medium text-primary-foreground transition-all hover:brightness-110"
              >
                {t("goToBilling")}
              </Link>
            </div>
          </div>
        )}

        {view === "success" && bookingUrl && (
          <div className="space-y-4">
            <div>
              <h2 className="font-display text-xl tracking-tight">
                {t("successTitle")}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {t("successBody")}
              </p>
            </div>
            <a
              href={bookingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-all hover:brightness-110"
            >
              <ExternalLink className="h-4 w-4" />
              {t("openBookingLink")}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
