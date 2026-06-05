"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Pencil, Check, X, RefreshCw, Loader2 } from "lucide-react";
import {
  useSimulation,
  useUpdateSimulationName,
  useRerunSimulation,
  isDateRangeCurrent,
} from "@/hooks/useSimulations";
import { MarkowitzResults } from "@/components/MarkowitzResults";
import { authClient } from "@/lib/auth-client";
import { SignInPrompt } from "@/components/auth/SignInPrompt";
import { cn } from "@/lib/utils";

export default function SimulationDetailPage() {
  const t = useTranslations("SimulationDetail");
  const tCommon = useTranslations("Common");
  const tStrategies = useTranslations("Strategies");
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session, isPending: isSessionPending } = authClient.useSession();
  const isSignedIn = !!session?.user;
  const { data: simulation, isLoading } = useSimulation(isSignedIn ? params.id : null);
  const updateName = useUpdateSimulationName();
  const rerunSimulation = useRerunSimulation();

  const [isEditing, setIsEditing] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [isConfirmingRerun, setIsConfirmingRerun] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) inputRef.current?.focus();
  }, [isEditing]);

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

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-muted-foreground">{t("loadingSimulation")}</div>
      </div>
    );
  }

  if (!simulation) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push("/efficient-frontier")}
            className="rounded-lg border border-border/50 bg-card/60 px-4 py-2 text-sm font-medium transition-all hover:bg-accent hover:border-border"
          >
            ← {tCommon("back")}
          </button>
        </div>
        <div className="flex h-64 items-center justify-center text-muted-foreground">
          {t("notFound")}
        </div>
      </div>
    );
  }

  const tickers: string[] = simulation.params.tickers ?? [];
  const strategy: string = simulation.params.strategy ?? "max-sharpe";
  const tickerStr =
    tickers.length <= 4
      ? tickers.join(", ")
      : `${tickers.slice(0, 3).join(", ")} +${tickers.length - 3}`;
  const computedName = `${tickerStr} - ${tStrategies(`${strategy}.label`)}`;
  const displayName = simulation.name ?? computedName;

  function startEdit() {
    setDraftName(simulation?.name ?? "");
    setIsEditing(true);
  }

  function cancelEdit() {
    setIsEditing(false);
    setDraftName("");
  }

  function saveEdit() {
    if (!simulation) return;
    const trimmed = draftName.trim();
    const nextName = trimmed === "" ? null : trimmed;
    if (nextName === (simulation.name ?? null)) {
      cancelEdit();
      return;
    }
    updateName.mutate(
      { id: simulation.id, name: nextName },
      { onSuccess: () => setIsEditing(false) }
    );
  }

  const alreadyCurrent = isDateRangeCurrent(simulation.params.dateRange);
  const isRerunning = rerunSimulation.isPending;
  const rerunDisabled = isRerunning || alreadyCurrent;

  function handleRerun() {
    if (!simulation || rerunDisabled) return;
    if (isConfirmingRerun) {
      rerunSimulation.mutate(
        { id: simulation.id, params: simulation.params },
        { onSuccess: () => setIsConfirmingRerun(false) }
      );
    } else {
      setIsConfirmingRerun(true);
      setTimeout(() => setIsConfirmingRerun(false), 3000);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 md:gap-4">
        <button
          onClick={() => router.push("/efficient-frontier")}
          className="shrink-0 rounded-lg border border-border/50 bg-card/60 px-3 py-2 text-sm font-medium transition-all hover:bg-accent hover:border-border md:px-4"
        >
          ← {tCommon("back")}
        </button>
        {isEditing ? (
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={draftName}
              placeholder={computedName}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveEdit();
                if (e.key === "Escape") cancelEdit();
              }}
              disabled={updateName.isPending}
              maxLength={200}
              className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 font-display text-xl tracking-tight outline-none focus:border-primary md:text-3xl"
            />
            <button
              onClick={saveEdit}
              disabled={updateName.isPending}
              title={t("renameSave")}
              aria-label={t("renameSave")}
              className="shrink-0 rounded-lg border border-border/50 bg-card/60 p-2 transition-all hover:bg-accent hover:border-border disabled:opacity-50"
            >
              <Check className="h-4 w-4" />
            </button>
            <button
              onClick={cancelEdit}
              disabled={updateName.isPending}
              title={t("renameCancel")}
              aria-label={t("renameCancel")}
              className="shrink-0 rounded-lg border border-border/50 bg-card/60 p-2 transition-all hover:bg-accent hover:border-border disabled:opacity-50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <h1
              className={cn(
                "min-w-0 flex-1 truncate font-display text-xl tracking-tight md:text-3xl",
                !simulation.name && "text-muted-foreground"
              )}
            >
              {displayName}
            </h1>
            <button
              onClick={startEdit}
              title={t("renameAction")}
              aria-label={t("renameAction")}
              className="shrink-0 rounded-lg border border-border/50 bg-card/60 p-2 text-muted-foreground transition-all hover:bg-accent hover:border-border hover:text-foreground"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              onClick={handleRerun}
              disabled={rerunDisabled}
              title={
                alreadyCurrent
                  ? t("rerunAlreadyCurrent")
                  : isRerunning
                    ? t("rerunInProgress")
                    : isConfirmingRerun
                      ? t("rerunConfirm")
                      : t("rerunAction")
              }
              aria-label={
                alreadyCurrent
                  ? t("rerunAlreadyCurrent")
                  : isConfirmingRerun
                    ? t("rerunConfirm")
                    : t("rerunAction")
              }
              className={cn(
                "shrink-0 rounded-lg border border-border/50 bg-card/60 p-2 text-muted-foreground transition-all hover:bg-accent hover:border-border hover:text-foreground",
                isConfirmingRerun && "border-primary/40 bg-primary/15 text-primary hover:bg-primary/20",
                rerunDisabled && !isRerunning && "opacity-40 cursor-not-allowed hover:bg-card/60 hover:border-border/50 hover:text-muted-foreground"
              )}
            >
              {isRerunning ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </button>
          </div>
        )}
      </div>

      <MarkowitzResults
        params={simulation.params}
        result={simulation.result}
      />
    </div>
  );
}
