"use client";

import { useState, useEffect, useRef } from "react";
import { Search, X, Loader2, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface TickerResult {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
}

export interface AssetRow {
  id: string;
  ticker: string;
  allocation: number | null;
}

interface AssetAllocationFormProps {
  assets: AssetRow[];
  onChange: (assets: AssetRow[]) => void;
}

function generateId() {
  return Math.random().toString(36).slice(2, 9);
}

function AssetRowInput({
  index,
  asset,
  onTickerChange,
  onAllocationChange,
  onRemove,
}: {
  index: number;
  asset: AssetRow;
  onTickerChange: (ticker: string) => void;
  onAllocationChange: (allocation: number | null) => void;
  onRemove: () => void;
}) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<TickerResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchTimeout = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (searchTimeout.current) {
      clearTimeout(searchTimeout.current);
    }

    if (search.length < 1) {
      setResults([]);
      setShowResults(false);
      return;
    }

    setIsSearching(true);
    searchTimeout.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/historical/search?q=${encodeURIComponent(search)}`);
        const data = await res.json();
        setResults(data);
        setShowResults(true);
      } catch (error) {
        console.error("Search error:", error);
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => {
      if (searchTimeout.current) {
        clearTimeout(searchTimeout.current);
      }
    };
  }, [search]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectTicker = (symbol: string) => {
    onTickerChange(symbol);
    setSearch("");
    setShowResults(false);
  };

  const clearTicker = () => {
    onTickerChange("");
    setSearch("");
  };

  return (
    <div className="flex items-center gap-3">
      <span className="w-16 shrink-0 text-sm text-muted-foreground">
        Activo {index + 1}
      </span>

      <div className="relative flex-1" ref={containerRef}>
        {asset.ticker ? (
          <div className="flex items-center rounded-md border border-input bg-background px-3 py-2 text-sm">
            <span className="flex-1 font-medium">{asset.ticker}</span>
            <button
              onClick={clearTicker}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Seleccionar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onFocus={() => search.length > 0 && setShowResults(true)}
              className="w-full rounded-md border border-input bg-background py-2 pl-10 pr-10 text-sm"
            />
            {isSearching && (
              <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
          </div>
        )}

        {showResults && results.length > 0 && (
          <div className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-md border border-input bg-background shadow-lg">
            {results.map((result) => (
              <button
                key={result.symbol}
                onClick={() => selectTicker(result.symbol)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
              >
                <div className="flex-1">
                  <div className="font-medium">{result.symbol}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {result.name}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">{result.exchange}</div>
              </button>
            ))}
          </div>
        )}

        {showResults && search.length > 0 && results.length === 0 && !isSearching && (
          <div className="absolute z-50 mt-1 w-full rounded-md border border-input bg-background p-3 text-center text-sm text-muted-foreground shadow-lg">
            No se encontraron resultados
          </div>
        )}
      </div>

      <div className="relative w-24 shrink-0">
        <input
          type="number"
          min={0}
          max={100}
          step={0.1}
          placeholder=""
          value={asset.allocation ?? ""}
          onChange={(e) => {
            const val = e.target.value;
            onAllocationChange(val === "" ? null : Number(val));
          }}
          className="w-full rounded-md border border-input bg-background px-3 py-2 pr-8 text-right text-sm"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
          %
        </span>
      </div>

      <button
        onClick={onRemove}
        className="shrink-0 text-muted-foreground hover:text-destructive"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function AssetAllocationForm({ assets, onChange }: AssetAllocationFormProps) {
  const updateAsset = (index: number, updates: Partial<AssetRow>) => {
    const updated = [...assets];
    updated[index] = { ...updated[index], ...updates };
    onChange(updated);
  };

  const removeAsset = (index: number) => {
    onChange(assets.filter((_, i) => i !== index));
  };

  const addAsset = () => {
    onChange([...assets, { id: generateId(), ticker: "", allocation: null }]);
  };

  const clearAll = () => {
    onChange(assets.map((a) => ({ ...a, ticker: "", allocation: null })));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Asignación de Activos</h3>
        <button
          onClick={clearAll}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          <Trash2 className="inline h-3 w-3" /> Limpiar
        </button>
      </div>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="w-16 shrink-0" />
        <span className="flex-1">Activo</span>
        <span className="w-24 shrink-0 text-right">Asignación (opcional)</span>
        <span className="w-4 shrink-0" />
      </div>

      <div className="space-y-2">
        {assets.map((asset, index) => (
          <AssetRowInput
            key={asset.id}
            index={index}
            asset={asset}
            onTickerChange={(ticker) => updateAsset(index, { ticker })}
            onAllocationChange={(allocation) => updateAsset(index, { allocation })}
            onRemove={() => removeAsset(index)}
          />
        ))}
      </div>

      <button
        onClick={addAsset}
        className={cn(
          "flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-input",
          "py-2 text-sm text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
        )}
      >
        <Plus className="h-4 w-4" />
        Agregar Activo
      </button>
    </div>
  );
}
