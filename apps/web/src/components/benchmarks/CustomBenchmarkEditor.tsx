"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Plus, Search, X } from "lucide-react";
import {
  ApiError,
  MAX_CUSTOM_BENCHMARK_COMPONENTS,
  type CustomBenchmark,
  type CustomBenchmarkComponent,
} from "@/lib/api";
import { cn, formatPercent } from "@/lib/utils";

interface TickerResult {
  symbol: string;
  name: string;
  exchange: string;
}

/** A leg being edited. Weight is held as a percentage, the unit on screen. */
interface DraftLeg {
  key: string;
  ticker: string;
  weightPercent: number | null;
}

let nextKey = 0;
function newLeg(ticker = "", weightPercent: number | null = null): DraftLeg {
  return { key: `leg-${nextKey++}`, ticker, weightPercent };
}

function legsFrom(benchmark?: CustomBenchmark): DraftLeg[] {
  if (!benchmark) return [newLeg()];
  return benchmark.components.map((component) =>
    newLeg(component.ticker, component.weight * 100)
  );
}

interface CustomBenchmarkEditorProps {
  /** The benchmark being edited, or undefined when creating a new one. */
  benchmark?: CustomBenchmark;
  onSave: (input: { name: string; components: CustomBenchmarkComponent[] }) => Promise<void>;
  onCancel: () => void;
  isSaving: boolean;
  /** Rejection from the last save attempt, shown above the buttons. */
  error: unknown;
}

/**
 * Inline form for assembling a reference portfolio out of arbitrary symbols.
 *
 * Weights are literal exposures rather than shares of a whole — the same
 * reading the comparison math uses — so a basket that sums to 80% holds the
 * rest in cash, and one over 100% is levered. The total is shown but never
 * rewritten, because normalizing would silently change what the user asked for.
 */
export function CustomBenchmarkEditor({
  benchmark,
  onSave,
  onCancel,
  isSaving,
  error,
}: CustomBenchmarkEditorProps) {
  const t = useTranslations("Benchmarks.custom");
  const [name, setName] = useState(benchmark?.name ?? "");
  const [legs, setLegs] = useState<DraftLeg[]>(() => legsFrom(benchmark));

  const filled = legs.filter((leg) => leg.ticker && leg.weightPercent !== null);
  const duplicated = new Set(
    legs
      .map((leg) => leg.ticker)
      .filter((ticker, i, all) => ticker && all.indexOf(ticker) !== i)
  );
  const total = filled.reduce((sum, leg) => sum + (leg.weightPercent ?? 0), 0);

  const canSave =
    name.trim().length > 0 &&
    filled.length > 0 &&
    filled.length === legs.length &&
    duplicated.size === 0 &&
    total !== 0;

  function update(key: string, patch: Partial<DraftLeg>) {
    setLegs((current) =>
      current.map((leg) => (leg.key === key ? { ...leg, ...patch } : leg))
    );
  }

  async function save() {
    if (!canSave || isSaving) return;
    await onSave({
      name: name.trim(),
      components: filled.map((leg) => ({
        ticker: leg.ticker,
        weight: (leg.weightPercent ?? 0) / 100,
      })),
    });
  }

  return (
    <div className="rounded-lg border border-border bg-card/60 p-4 dark:border-border/50 dark:bg-card/40">
      <h4 className="mb-3 font-display text-base">
        {benchmark ? t("editTitle") : t("createTitle")}
      </h4>

      <label className="mb-4 block">
        <span className="mb-1 block text-xs font-medium text-muted-foreground">
          {t("nameLabel")}
        </span>
        <input
          type="text"
          value={name}
          maxLength={60}
          placeholder={t("namePlaceholder")}
          onChange={(event) => setName(event.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">{t("legsLabel")}</p>
        {legs.map((leg) => (
          <div key={leg.key} className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <TickerField
                ticker={leg.ticker}
                onChange={(ticker) => update(leg.key, { ticker })}
              />
              {duplicated.has(leg.ticker) && (
                <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">
                  {t("duplicateTicker")}
                </p>
              )}
            </div>
            <div className="relative w-24 shrink-0">
              <input
                type="number"
                inputMode="decimal"
                aria-label={t("weightAria", { ticker: leg.ticker || "—" })}
                min={-500}
                max={500}
                step={1}
                value={leg.weightPercent ?? ""}
                onChange={(event) =>
                  update(leg.key, {
                    weightPercent:
                      event.target.value === "" ? null : Number(event.target.value),
                  })
                }
                className="w-full rounded-md border border-input bg-background py-2 pl-3 pr-7 text-right text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                %
              </span>
            </div>
            <button
              type="button"
              onClick={() => setLegs((current) => current.filter((l) => l.key !== leg.key))}
              disabled={legs.length === 1}
              aria-label={t("removeLeg")}
              className="mt-2 shrink-0 text-muted-foreground transition-colors hover:text-destructive disabled:cursor-not-allowed disabled:opacity-30"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setLegs((current) => [...current, newLeg()])}
          disabled={legs.length >= MAX_CUSTOM_BENCHMARK_COMPONENTS}
          className="inline-flex items-center gap-1.5 rounded-md border border-border/60 px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          {t("addLeg")}
        </button>
        <p className="text-xs text-muted-foreground">
          {t("total", { total: formatPercent(total / 100) })}
        </p>
      </div>

      {/* A basket that is not fully invested is legitimate, so this explains the
          reading rather than blocking the save. */}
      {filled.length > 0 && Math.abs(total - 100) > 0.01 && duplicated.size === 0 && (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
          {total < 100 ? t("underInvested") : t("levered")}
        </p>
      )}

      {error instanceof ApiError && (
        <p className="mt-3 text-sm text-rose-600 dark:text-rose-400" role="alert">
          {error.code === "unpriced_tickers"
            ? t("unpricedTickers", { tickers: error.message })
            : error.code === "limit_reached"
              ? t("limitReached")
              : t("saveFailed")}
        </p>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          {t("cancel")}
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!canSave || isSaving}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
          {t("save")}
        </button>
      </div>
    </div>
  );
}

/**
 * Symbol picker for one leg.
 *
 * Yahoo's search filters down to equities and ETFs, so index symbols like
 * `^GSPC` never appear in its results — and reaching exactly those is half the
 * point of a custom benchmark. The typed text is therefore always offered as a
 * symbol in its own right, below whatever the search found.
 */
function TickerField({
  ticker,
  onChange,
}: {
  ticker: string;
  onChange: (ticker: string) => void;
}) {
  const t = useTranslations("Benchmarks.custom");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<TickerResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const query = search.trim();
    if (query.length < 1) {
      setResults([]);
      return;
    }

    setIsSearching(true);
    const timeout = setTimeout(async () => {
      try {
        const apiBase = process.env.NEXT_PUBLIC_API_URL || "";
        const res = await fetch(
          `${apiBase}/api/historical/search?q=${encodeURIComponent(query)}`,
          { credentials: process.env.NEXT_PUBLIC_API_URL ? "include" : "same-origin" }
        );
        setResults(await res.json());
      } catch {
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function select(symbol: string) {
    onChange(symbol.trim().toUpperCase());
    setSearch("");
    setIsOpen(false);
  }

  const typed = search.trim().toUpperCase();
  const showTypedOption =
    typed.length > 0 && !results.some((result) => result.symbol.toUpperCase() === typed);

  if (ticker) {
    return (
      <div className="flex items-center rounded-md border border-input bg-background px-3 py-2 text-sm">
        <span className="flex-1 truncate font-medium">{ticker}</span>
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label={t("clearTicker")}
          className="text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative" ref={containerRef}>
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="text"
        value={search}
        placeholder={t("tickerPlaceholder")}
        onChange={(event) => {
          setSearch(event.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(search.length > 0)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && typed) {
            event.preventDefault();
            select(typed);
          }
        }}
        className="w-full rounded-md border border-input bg-background py-2 pl-10 pr-10 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      {isSearching && (
        <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
      )}

      {isOpen && (results.length > 0 || showTypedOption) && (
        <div className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-md border border-border bg-popover text-popover-foreground shadow-lg">
          {results.map((result) => (
            <button
              key={result.symbol}
              type="button"
              onClick={() => select(result.symbol)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
            >
              <div className="min-w-0 flex-1">
                <div className="font-medium">{result.symbol}</div>
                <div className="truncate text-xs text-muted-foreground">{result.name}</div>
              </div>
              <div className="text-xs text-muted-foreground">{result.exchange}</div>
            </button>
          ))}
          {showTypedOption && (
            <button
              type="button"
              onClick={() => select(typed)}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted",
                results.length > 0 && "border-t border-border/60"
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="font-medium">{typed}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {t("useSymbolAsTyped")}
                </div>
              </div>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
