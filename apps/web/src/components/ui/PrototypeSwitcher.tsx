"use client";

/**
 * PROTOTYPE — throwaway dev-only bar that cycles a `?<param>=` search param.
 * Never renders in production builds. Delete with the prototype it serves.
 */

import { Suspense, useCallback, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export interface PrototypeVariant {
  key: string;
  name: string;
}

function Bar({ param, variants }: { param: string; variants: readonly PrototypeVariant[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // `null` = the unmodified page, kept in the cycle as the baseline.
  const keys: (string | null)[] = [null, ...variants.map((v) => v.key)];
  const current = searchParams.get(param);
  const idx = Math.max(0, keys.indexOf(current));

  const go = useCallback(
    (step: number) => {
      const next = keys[(idx + step + keys.length) % keys.length];
      const sp = new URLSearchParams(searchParams.toString());
      if (next) sp.set(param, next);
      else sp.delete(param);
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [idx, pathname, searchParams, param]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.closest("input, textarea, select, [contenteditable]") || t.isContentEditable)) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  const v = variants.find((x) => x.key === current);
  // Deliberately loud and theme-inverted so it never reads as part of the design.
  return (
    <div className="fixed bottom-24 left-0 right-0 z-[100] flex justify-center pointer-events-none md:bottom-5">
      <div className="pointer-events-auto flex items-center gap-1 rounded-full bg-foreground px-1.5 py-1.5 text-background shadow-2xl ring-1 ring-black/20">
        <button onClick={() => go(-1)} className="h-8 w-8 rounded-full hover:bg-background/15" aria-label="Previous">
          ←
        </button>
        <span className="min-w-[13rem] px-2 text-center font-mono text-xs">
          {v ? `${v.key} — ${v.name}` : "current wordmark"}
          <span className="ml-2 opacity-50">
            {idx}/{keys.length - 1}
          </span>
        </span>
        <button onClick={() => go(1)} className="h-8 w-8 rounded-full hover:bg-background/15" aria-label="Next">
          →
        </button>
      </div>
    </div>
  );
}

export function PrototypeSwitcher(props: { param: string; variants: readonly PrototypeVariant[] }) {
  if (process.env.NODE_ENV === "production") return null;
  return (
    <Suspense fallback={null}>
      <Bar {...props} />
    </Suspense>
  );
}
