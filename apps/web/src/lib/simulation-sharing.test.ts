import { describe, expect, it } from "vitest";
import {
  filterSimulations,
  hasSharedSimulations,
  isEditable,
  isSharedWithMe,
} from "@/lib/simulation-sharing";

type Row = { id: string; isOwner: boolean; sharedWithOrg: boolean };

const own: Row = { id: "own", isOwner: true, sharedWithOrg: false };
const ownShared: Row = { id: "own-shared", isOwner: true, sharedWithOrg: true };
const fromColleague: Row = { id: "colleague", isOwner: false, sharedWithOrg: true };

const list = [own, ownShared, fromColleague];

describe("isEditable", () => {
  // The API answers 403 on a write against a colleague's shared row, so a
  // control rendered here is a control that cannot work.
  it("is true only for the caller's own rows", () => {
    expect(isEditable(own)).toBe(true);
    expect(isEditable(ownShared)).toBe(true);
    expect(isEditable(fromColleague)).toBe(false);
  });
});

describe("isSharedWithMe", () => {
  it("separates a colleague's shared row from one the caller shared themselves", () => {
    expect(isSharedWithMe(fromColleague)).toBe(true);
    expect(isSharedWithMe(ownShared)).toBe(false);
    expect(isSharedWithMe(own)).toBe(false);
  });
});

describe("filterSimulations", () => {
  it("returns everything visible under 'all'", () => {
    expect(filterSimulations(list, "all")).toEqual(list);
  });

  it("keeps only the caller's rows under 'mine', shared or not", () => {
    expect(filterSimulations(list, "mine").map((r) => r.id)).toEqual(["own", "own-shared"]);
  });

  it("keeps only what colleagues shared under 'shared'", () => {
    expect(filterSimulations(list, "shared").map((r) => r.id)).toEqual(["colleague"]);
  });

  it("never surfaces a row the payload did not carry", () => {
    expect(filterSimulations([], "shared")).toEqual([]);
    expect(filterSimulations([own], "shared")).toEqual([]);
  });
});

describe("hasSharedSimulations", () => {
  it("is false until a colleague shares something", () => {
    expect(hasSharedSimulations([own, ownShared])).toBe(false);
    expect(hasSharedSimulations(list)).toBe(true);
  });
});
