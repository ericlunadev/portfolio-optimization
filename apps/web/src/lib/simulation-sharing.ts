import type { SimulationListItem } from "@/lib/api";

/**
 * Which slice of the visible list the user is looking at. The list mixes their
 * own simulations with the ones colleagues shared into the organization, and
 * those two sets behave differently — only the first accepts a write.
 */
export type SimulationScope = "all" | "mine" | "shared";

export const SIMULATION_SCOPES: SimulationScope[] = ["all", "mine", "shared"];

/**
 * Whether the write endpoints will accept this row.
 *
 * The API answers 403 — not 404 — on a PATCH, PUT or DELETE against a row that
 * was shared with the caller, so rendering rename, pin, re-run or delete on one
 * is a guaranteed error. `isOwner` comes from the list payload for exactly this.
 */
export function isEditable(item: Pick<SimulationListItem, "isOwner">): boolean {
  return item.isOwner;
}

/** Shared *into* the organization by someone else, so it is read-only here. */
export function isSharedWithMe(
  item: Pick<SimulationListItem, "isOwner" | "sharedWithOrg">
): boolean {
  return !item.isOwner && item.sharedWithOrg;
}

export function filterSimulations<
  T extends Pick<SimulationListItem, "isOwner" | "sharedWithOrg">,
>(items: T[], scope: SimulationScope): T[] {
  if (scope === "mine") return items.filter((item) => item.isOwner);
  if (scope === "shared") return items.filter(isSharedWithMe);
  return items;
}

/** True once a colleague has shared something, which is when the filter earns its place. */
export function hasSharedSimulations(
  items: Pick<SimulationListItem, "isOwner" | "sharedWithOrg">[]
): boolean {
  return items.some(isSharedWithMe);
}
