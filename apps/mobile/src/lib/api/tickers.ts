import { api } from '@/lib/api/client';

/**
 * Ticker autocomplete backed by `GET /api/historical/search` (Yahoo Finance),
 * which returns results already filtered to equities and ETFs.
 */
export type TickerSearchResult = {
  symbol: string;
  name: string;
  exchange: string;
  type?: string;
};

export function searchTickers(query: string) {
  return api.get<TickerSearchResult[]>(`/api/historical/search?q=${encodeURIComponent(query)}`);
}
