import { test } from "node:test";
import assert from "node:assert/strict";
import {
  incrementWeight,
  sortByWeight,
  incrementQueryWeight,
  sortByQueryWeight,
  forgetFolderWeights,
  usageIncrement,
  HALF_LIFE_MS,
  WEIGHT_EPOCH_MS,
} from "../lib/weights.js";

test("incrementWeight starts an unseen folder at 1", () => {
  assert.deepEqual(incrementWeight({}, "f1"), { f1: 1 });
});

test("incrementWeight adds 1 to an existing weight", () => {
  assert.deepEqual(incrementWeight({ f1: 3, f2: 1 }, "f1"), { f1: 4, f2: 1 });
});

test("incrementWeight does not mutate the input object", () => {
  const weights = { f1: 1 };
  incrementWeight(weights, "f1");
  assert.deepEqual(weights, { f1: 1 });
});

const folders = [
  { id: "1", name: "Zebra" },
  { id: "2", name: "Archive" },
  { id: "3", name: "budget" },
  { id: "4", name: "Inbox" },
];

test("sorts by weight, most-used first", () => {
  const weights = { "1": 2, "2": 5, "4": 1 };
  const result = sortByWeight(folders, weights);
  assert.deepEqual(
    result.map((f) => f.id),
    ["2", "1", "4", "3"],
  );
});

test("folders with equal (including zero/absent) weight fall back to case-insensitive alphabetical order", () => {
  const result = sortByWeight(folders, {});
  assert.deepEqual(
    result.map((f) => f.id),
    ["2", "3", "4", "1"],
  );
});

test("does not mutate the input array", () => {
  const input = [...folders];
  sortByWeight(folders, { "1": 5 });
  assert.deepEqual(folders, input);
});

test("incrementQueryWeight fans out across every prefix of the query", () => {
  const result = incrementQueryWeight({}, "arch", "f1");
  assert.deepEqual(result, {
    a: { f1: 1 },
    ar: { f1: 1 },
    arc: { f1: 1 },
    arch: { f1: 1 },
  });
});

test("incrementQueryWeight normalizes case and trims whitespace", () => {
  assert.deepEqual(incrementQueryWeight({}, "  AB  ", "f1"), {
    a: { f1: 1 },
    ab: { f1: 1 },
  });
});

test("incrementQueryWeight accumulates across repeated calls", () => {
  let weights = incrementQueryWeight({}, "ar", "f1");
  weights = incrementQueryWeight(weights, "arch", "f1");
  assert.deepEqual(weights, {
    a: { f1: 2 },
    ar: { f1: 2 },
    arc: { f1: 1 },
    arch: { f1: 1 },
  });
});

test("incrementQueryWeight no-ops on a blank query", () => {
  const weights = { a: { f1: 1 } };
  assert.equal(incrementQueryWeight(weights, "", "f2"), weights);
  assert.equal(incrementQueryWeight(weights, "   ", "f2"), weights);
});

test("incrementQueryWeight does not mutate the input object", () => {
  const weights = { a: { f1: 1 } };
  incrementQueryWeight(weights, "a", "f2");
  assert.deepEqual(weights, { a: { f1: 1 } });
});

test("sortByQueryWeight ranks by query-specific weight first", () => {
  const queryWeights = { arch: { "2": 5, "1": 1 } };
  const globalWeights = { "1": 10, "2": 1, "4": 3 };
  const result = sortByQueryWeight(folders, queryWeights, globalWeights, "arch");
  assert.deepEqual(
    result.map((f) => f.id),
    ["2", "1", "4", "3"],
  );
});

test("sortByQueryWeight falls back to global weight, then alphabetical, when there is no query-weight entry", () => {
  const globalWeights = { "1": 5, "4": 2 };
  const result = sortByQueryWeight(folders, {}, globalWeights, "zzz");
  assert.deepEqual(
    result.map((f) => f.id),
    ["1", "4", "2", "3"],
  );
});

test("sortByQueryWeight normalizes the query the same way incrementQueryWeight does", () => {
  const queryWeights = { arch: { "2": 5 } };
  const result = sortByQueryWeight(folders, queryWeights, {}, "  ARCH  ");
  assert.equal(result[0].id, "2");
});

test("forgetFolderWeights removes a folder's global and per-query weights", () => {
  const result = forgetFolderWeights(
    { f1: 7, f2: 2 },
    { l: { f1: 5, f2: 1 }, le: { f1: 5 }, lei: { f1: 5, f2: 1 } },
    "f1",
  );
  assert.deepEqual(result, {
    folderWeights: { f2: 2 },
    queryWeights: { l: { f2: 1 }, lei: { f2: 1 } },
  });
});

test("forgetFolderWeights lets a less-used folder win after demoting the top one", () => {
  const leipzig = [
    { id: "dgfn", name: "2026-10 DGfN Leipzig" },
    { id: "dtg", name: "2026-12 DTG Leipzig" },
  ];
  const { folderWeights, queryWeights } = forgetFolderWeights(
    { dgfn: 40, dtg: 1 },
    { lei: { dgfn: 40, dtg: 1 } },
    "dgfn",
  );
  const result = sortByQueryWeight(leipzig, queryWeights, folderWeights, "lei");
  assert.deepEqual(
    result.map((f) => f.id),
    ["dtg", "dgfn"],
  );
});

test("forgetFolderWeights is a no-op for a folder with no history", () => {
  const result = forgetFolderWeights({ f1: 1 }, { a: { f1: 1 } }, "f2");
  assert.deepEqual(result, { folderWeights: { f1: 1 }, queryWeights: { a: { f1: 1 } } });
});

test("forgetFolderWeights does not mutate its inputs", () => {
  const folderWeights = { f1: 1 };
  const queryWeights = { a: { f1: 1 } };
  forgetFolderWeights(folderWeights, queryWeights, "f1");
  assert.deepEqual(folderWeights, { f1: 1 });
  assert.deepEqual(queryWeights, { a: { f1: 1 } });
});

test("usageIncrement is 1 at the epoch and doubles every half-life", () => {
  assert.equal(usageIncrement(WEIGHT_EPOCH_MS), 1);
  assert.equal(usageIncrement(WEIGHT_EPOCH_MS + HALF_LIFE_MS), 2);
  assert.equal(usageIncrement(WEIGHT_EPOCH_MS + 3 * HALF_LIFE_MS), 8);
});

test("incrementWeight and incrementQueryWeight add the given amount", () => {
  assert.deepEqual(incrementWeight({ f1: 1 }, "f1", 2.5), { f1: 3.5 });
  assert.deepEqual(incrementQueryWeight({}, "ab", "f1", 4), {
    a: { f1: 4 },
    ab: { f1: 4 },
  });
});

test("recent use outranks heavier but older use once enough half-lives have passed", () => {
  const leipzig = [
    { id: "dgfn", name: "2026-10 DGfN Leipzig" },
    { id: "dtg", name: "2026-12 DTG Leipzig" },
  ];
  // 40 picks of one folder, then a quarter-year later 6 picks of the other:
  // 6 * 2^3 = 48 > 40.
  let weights = {};
  for (let i = 0; i < 40; i++) {
    weights = incrementWeight(weights, "dgfn", usageIncrement(WEIGHT_EPOCH_MS));
  }
  const later = WEIGHT_EPOCH_MS + 3 * HALF_LIFE_MS;
  for (let i = 0; i < 6; i++) weights = incrementWeight(weights, "dtg", usageIncrement(later));
  assert.deepEqual(
    sortByWeight(leipzig, weights).map((f) => f.id),
    ["dtg", "dgfn"],
  );
});

test("usageIncrement stays finite for many decades", () => {
  const eightyYears = 80 * 365 * 24 * 60 * 60 * 1000;
  assert.ok(Number.isFinite(usageIncrement(WEIGHT_EPOCH_MS + eightyYears)));
});

test("incrementQueryWeight collapses whitespace and skips prefixes ending in a space", () => {
  assert.deepEqual(incrementQueryWeight({}, " F   le ", "f1"), {
    f: { f1: 1 },
    "f l": { f1: 1 },
    "f le": { f1: 1 },
  });
});

test("sortByQueryWeight looks up multi-word queries the same way", () => {
  const queryWeights = { "f le": { "3": 1 } };
  const result = sortByQueryWeight(folders, queryWeights, {}, "F   LE");
  assert.equal(result[0].id, "3");
});

test("sortByQueryWeight ranks by band before any weight", () => {
  const queryWeights = { "a b": { "1": 9 } };
  const globalWeights = { "1": 9, "4": 5 };
  const bandOf = (f) => (f.id === "1" ? 1 : 0);
  const result = sortByQueryWeight(folders, queryWeights, globalWeights, "a b", bandOf);
  assert.deepEqual(
    result.map((f) => f.id),
    ["4", "2", "3", "1"],
  );
});
