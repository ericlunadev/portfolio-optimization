export type StationKey =
  | "macro"
  | "allocation"
  | "sectors"
  | "assets"
  | "portfolio";

export interface StationMeta {
  key: StationKey;
  index: number;
}

export const STATIONS: StationMeta[] = [
  { key: "macro", index: 1 },
  { key: "allocation", index: 2 },
  { key: "sectors", index: 3 },
  { key: "assets", index: 4 },
  { key: "portfolio", index: 5 },
];

export function getStation(key: StationKey): StationMeta {
  const station = STATIONS.find((s) => s.key === key);
  if (!station) throw new Error(`Unknown station: ${key}`);
  return station;
}
