"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  useSimulations,
  useDeleteSimulation,
  useTogglePinnedSimulation,
  useRerunSimulation,
  isDateRangeCurrent,
} from "@/hooks/useSimulations";
import { SimulationListItem } from "@/lib/api";
import { formatNumber, formatPercent, cn } from "@/lib/utils";
import {
  Trash2,
  BarChart3,
  ChevronRight,
  Plus,
  Pin,
  PinOff,
  MoreVertical,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { SignInPrompt } from "@/components/auth/SignInPrompt";

export default function EfficientFrontierPage() {
  const t = useTranslations("EfficientFrontierList");
  const tCommon = useTranslations("Common");
  const { data: session, isPending: isSessionPending } = authClient.useSession();
  const isSignedIn = !!session?.user;

  const { data: simulations, isLoading } = useSimulations(isSignedIn);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [rerunningId, setRerunningId] = useState<string | null>(null);

  const deleteSimulation = useDeleteSimulation();
  const togglePinned = useTogglePinnedSimulation();
  const rerunSimulation = useRerunSimulation();

  if (isSessionPending) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-muted-foreground">{tCommon("loading")}</div>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <SignInPrompt
        title={t("signInTitle")}
        description={t("signInDescription")}
      />
    );
  }

  function handleDelete(id: string) {
    if (deletingId === id) {
      deleteSimulation.mutate(id, {
        onSuccess: () => setDeletingId(null),
      });
    } else {
      setDeletingId(id);
      setTimeout(
        () => setDeletingId((prev) => (prev === id ? null : prev)),
        3000
      );
    }
  }

  function handleRerun(sim: SimulationListItem) {
    if (rerunningId === sim.id) {
      rerunSimulation.mutate(
        { id: sim.id, params: sim.params },
        { onSuccess: () => setRerunningId(null) }
      );
    } else {
      setRerunningId(sim.id);
      setTimeout(
        () => setRerunningId((prev) => (prev === sim.id ? null : prev)),
        3000
      );
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-muted-foreground">{t("loadingList")}</div>
      </div>
    );
  }

  if (!simulations || simulations.length === 0) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-2xl md:text-3xl tracking-tight">
            {t("title")}
          </h1>
          <Link
            href="/efficient-frontier/new"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-all hover:brightness-110 glow-gold"
          >
            <Plus className="h-4 w-4" />
            {t("newButton")}
          </Link>
        </div>
        <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed border-border/50 bg-card/30">
          <BarChart3 className="mb-3 h-10 w-10 text-muted-foreground/50" />
          <p className="text-muted-foreground">{t("emptyTitle")}</p>
          <p className="mt-1 text-sm text-muted-foreground/70">
            {t("emptyHint")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl md:text-3xl tracking-tight">
          {t("title")}
        </h1>
        <Link
          href="/efficient-frontier/new"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-all hover:brightness-110 glow-gold"
        >
          <Plus className="h-4 w-4" />
          {t("newButton")}
        </Link>
      </div>

      <div className="space-y-3">
        {simulations.map((sim) => (
          <SimulationCard
            key={sim.id}
            sim={sim}
            onDelete={() => handleDelete(sim.id)}
            onTogglePin={() =>
              togglePinned.mutate({ id: sim.id, pinned: !sim.pinned })
            }
            isConfirmingDelete={deletingId === sim.id}
            isDeleting={deleteSimulation.isPending && deletingId === sim.id}
            onRerun={() => handleRerun(sim)}
            isConfirmingRerun={rerunningId === sim.id}
            isRerunning={rerunSimulation.isPending && rerunningId === sim.id}
          />
        ))}
      </div>
    </div>
  );
}

function SimulationCard({
  sim,
  onDelete,
  onTogglePin,
  isConfirmingDelete,
  isDeleting,
  onRerun,
  isConfirmingRerun,
  isRerunning,
}: {
  sim: SimulationListItem;
  onDelete: () => void;
  onTogglePin: () => void;
  isConfirmingDelete: boolean;
  isDeleting: boolean;
  onRerun: () => void;
  isConfirmingRerun: boolean;
  isRerunning: boolean;
}) {
  const t = useTranslations("EfficientFrontierList");
  const tStrategies = useTranslations("Strategies");
  const formattedDate = formatCreatedAt(sim.createdAt);
  const alreadyCurrent = isDateRangeCurrent(sim.params.dateRange);
  const rerunDisabled = isRerunning || alreadyCurrent;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  const tickerStr =
    sim.tickers.length <= 4
      ? sim.tickers.join(", ")
      : `${sim.tickers.slice(0, 3).join(", ")} +${sim.tickers.length - 3}`;
  const computedName = `${tickerStr} - ${tStrategies(`${sim.strategy}.label`)}`;
  const displayName = sim.name ?? computedName;

  return (
    <div className="glass-card group transition-colors hover:border-border">
      <div className="flex items-center gap-3 px-4 py-3">
        <Link
          href={`/efficient-frontier/${sim.id}`}
          className="flex flex-1 items-center gap-3 text-left"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              {sim.pinned && (
                <Pin
                  className="h-3.5 w-3.5 shrink-0 fill-primary text-primary"
                  aria-label={t("pinnedLabel")}
                />
              )}
              <h3 className="truncate text-sm font-medium group-hover:text-primary transition-colors">
                {displayName}
              </h3>
              <span className="shrink-0 text-xs text-muted-foreground">
                {formattedDate}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {sim.tickers.slice(0, 6).map((tk) => (
                <span
                  key={tk}
                  className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium"
                >
                  {tk}
                </span>
              ))}
              {sim.tickers.length > 6 && (
                <span className="text-[10px] text-muted-foreground">
                  +{sim.tickers.length - 6}
                </span>
              )}
            </div>
          </div>

          <div className="hidden gap-4 text-right text-xs sm:flex">
            <div>
              <div className="text-muted-foreground">{t("colReturn")}</div>
              <div className="font-medium">
                {formatPercent(sim.expectedReturn)}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">{t("colVolatility")}</div>
              <div className="font-medium">
                {formatPercent(sim.volatility)}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">{t("colSharpe")}</div>
              <div className="font-medium">{formatNumber(sim.sharpeRatio, 2)}</div>
            </div>
          </div>

          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
        </Link>

        <div ref={menuRef} className="relative shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              setMenuOpen((open) => !open);
            }}
            aria-label={t("moreActions")}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className={cn(
              "rounded-md p-1.5 text-muted-foreground transition-colors",
              isConfirmingDelete
                ? "bg-red-900/20 text-red-400"
                : isConfirmingRerun
                  ? "bg-primary/15 text-primary"
                  : "hover:bg-muted hover:text-foreground"
            )}
          >
            <MoreVertical className="h-4 w-4" />
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full z-20 mt-1 w-56 overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-lg"
            >
              <button
                type="button"
                role="menuitem"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  setMenuOpen(false);
                  onTogglePin();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
              >
                {sim.pinned ? (
                  <PinOff className="h-4 w-4" />
                ) : (
                  <Pin className="h-4 w-4" />
                )}
                {sim.pinned ? t("unpinAction") : t("pinAction")}
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={rerunDisabled}
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  if (rerunDisabled) return;
                  setMenuOpen(false);
                  onRerun();
                }}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted",
                  isConfirmingRerun && "text-primary",
                  rerunDisabled && !isRerunning && "opacity-40 cursor-not-allowed hover:bg-popover"
                )}
                title={alreadyCurrent ? t("rerunAlreadyCurrent") : undefined}
              >
                {isRerunning ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                {alreadyCurrent
                  ? t("rerunAlreadyCurrent")
                  : isRerunning
                    ? t("rerunInProgress")
                    : isConfirmingRerun
                      ? t("rerunConfirm")
                      : t("rerunAction")}
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={isDeleting}
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  onDelete();
                }}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted",
                  isConfirmingDelete && "text-red-400"
                )}
              >
                <Trash2 className="h-4 w-4" />
                {isConfirmingDelete ? t("deleteConfirm") : t("deleteAction")}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-4 border-t border-border/50 px-4 py-2 text-xs sm:hidden">
        <div>
          <span className="text-muted-foreground">{t("colReturnShort")} </span>
          <span className="font-medium">
            {formatPercent(sim.expectedReturn)}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">{t("colVolatilityShort")} </span>
          <span className="font-medium">{formatPercent(sim.volatility)}</span>
        </div>
        <div>
          <span className="text-muted-foreground">{t("colSharpeShort")} </span>
          <span className="font-medium">{formatNumber(sim.sharpeRatio, 2)}</span>
        </div>
      </div>
    </div>
  );
}

function formatCreatedAt(isoString: string): string {
  try {
    const date = new Date(isoString);
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  } catch {
    return isoString;
  }
}
