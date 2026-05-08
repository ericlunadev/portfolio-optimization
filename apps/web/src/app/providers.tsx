"use client";

import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

// Query-key roots whose successful runs charge a credit on the API. When any
// of these resolves with fresh data we invalidate ["billing"] so the wallet
// chip and ledger stay in sync without waiting for window-focus.
const METERED_QUERY_KEYS = new Set([
  "optimization",
  "optimization-tickers",
  "max-sharpe-tickers",
  "efficient-frontier-tickers",
]);

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => {
    const client: QueryClient = new QueryClient({
      queryCache: new QueryCache({
        onSuccess: (_data, query) => {
          if (METERED_QUERY_KEYS.has(query.queryKey[0] as string)) {
            client.invalidateQueries({ queryKey: ["billing"] });
          }
        },
      }),
      defaultOptions: {
        queries: {
          staleTime: 60 * 1000,
          retry: 1,
        },
      },
    });
    return client;
  });

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
