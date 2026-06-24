/**
 * Station metadata for the Academia screen. Port of
 * apps/web/src/components/academia/lessons.ts — pure data, no platform deps.
 *
 * The educational copy itself lives entirely in the `academia.*` i18n
 * namespace (messages/{es,en}.json); these keys index into it.
 */

export type StationKey = 'macro' | 'allocation' | 'sectors' | 'assets' | 'portfolio';

export interface StationMeta {
  key: StationKey;
  index: number;
}

export const STATIONS: StationMeta[] = [
  { key: 'macro', index: 1 },
  { key: 'allocation', index: 2 },
  { key: 'sectors', index: 3 },
  { key: 'assets', index: 4 },
  { key: 'portfolio', index: 5 },
];

export function getStation(key: StationKey): StationMeta {
  const station = STATIONS.find((s) => s.key === key);
  if (!station) throw new Error(`Unknown station: ${key}`);
  return station;
}
