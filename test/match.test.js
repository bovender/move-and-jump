import { test } from "node:test";
import assert from "node:assert/strict";
import { filterFolders, matchBand, queryWords } from "../lib/match.js";

const folders = [
  { id: "1", name: "Inbox", path: "/Inbox", accountId: "a1" },
  { id: "2", name: "Archive", path: "/Archive", accountId: "a1" },
  { id: "3", name: "Projects", path: "/Archive/Projects", accountId: "a1" },
  { id: "4", name: "Budget", path: "/Work/Budget", accountId: "a2" },
  { id: "5", name: "Test", path: "/Test", accountId: "a1" },
  { id: "6", name: "Testing", path: "/Testing", accountId: "a1" },
];

test("empty (or blank) query returns no matches", () => {
  assert.deepEqual(filterFolders(folders, ""), []);
  assert.deepEqual(filterFolders(folders, "   "), []);
});

test("name-starts-with ranks above path-contains", () => {
  const result = filterFolders(folders, "arch");
  assert.deepEqual(
    result.map((f) => f.id),
    ["2", "3"],
  );
});

test("ties within a rank tier are ordered alphabetically", () => {
  const result = filterFolders(folders, "test");
  assert.deepEqual(
    result.map((f) => f.id),
    ["5", "6"],
  );
});

test("search is case-insensitive by default", () => {
  assert.deepEqual(
    filterFolders(folders, "INBOX").map((f) => f.id),
    ["1"],
  );
});

test("caseSensitive option respects case", () => {
  assert.deepEqual(filterFolders(folders, "INBOX", { caseSensitive: true }), []);
  assert.deepEqual(
    filterFolders(folders, "Inbox", { caseSensitive: true }).map((f) => f.id),
    ["1"],
  );
});

test("query with no matches returns an empty array", () => {
  assert.deepEqual(filterFolders(folders, "zzz"), []);
});

const foldersWithAccounts = [
  { id: "1", name: "Inbox", path: "/Inbox", accountId: "a1", accountName: "Personal" },
  { id: "2", name: "Inbox", path: "/Inbox", accountId: "a2", accountName: "Work" },
];

test("account-name matches rank below name and path matches", () => {
  const result = filterFolders(foldersWithAccounts, "work");
  assert.deepEqual(
    result.map((f) => f.id),
    ["2"],
  );
});

test("account name does not affect matches that already hit on name/path", () => {
  const result = filterFolders(foldersWithAccounts, "inbox");
  assert.deepEqual(
    result.map((f) => f.id),
    ["1", "2"],
  );
});

const congresses = [
  { id: "dgfn", name: "2026-10 DGfN Leipzig", path: "/Kongresse/2026-10 DGfN Leipzig" },
  { id: "dtg", name: "2026-12 DTG Leipzig", path: "/Kongresse/2026-12 DTG Leipzig" },
  { id: "dtg-f", name: "2026-12 DTG Leipzig", path: "/Fortbildung/2026-12 DTG Leipzig" },
  { id: "inbox", name: "Inbox", path: "/Inbox", accountName: "Work" },
];

test("queryWords splits on any run of whitespace", () => {
  assert.deepEqual(queryWords("  f   Lei "), ["f", "Lei"]);
  assert.deepEqual(queryWords("   "), []);
});

test("every word of a multi-word query must match, in any order", () => {
  assert.deepEqual(
    filterFolders(congresses, "f Lei").map((f) => f.id),
    ["dgfn", "dtg-f"],
  );
  assert.deepEqual(
    filterFolders(congresses, "Lei f").map((f) => f.id),
    ["dgfn", "dtg-f"],
  );
});

test("words can match across name, path and account name", () => {
  assert.deepEqual(
    filterFolders(congresses, "work inbox").map((f) => f.id),
    ["inbox"],
  );
  assert.deepEqual(
    filterFolders(congresses, "kongr dtg").map((f) => f.id),
    ["dtg"],
  );
});

test("a multi-word query ranks by its worst-matching word", () => {
  // "dtg" matches both names, but "fort" only one folder's path, so
  // that folder ranks in the path tier.
  assert.deepEqual(
    filterFolders(congresses, "dtg").map((f) => f.id),
    ["dtg", "dtg-f"],
  );
  assert.deepEqual(
    filterFolders(congresses, "fort dtg").map((f) => f.id),
    ["dtg-f"],
  );
  assert.deepEqual(
    filterFolders(
      [
        { id: "path", name: "Leipzig", path: "/Fortbildung/Leipzig" },
        { id: "name", name: "Leipzig Fortbildung", path: "/Leipzig Fortbildung" },
      ],
      "lei fort",
    ).map((f) => f.id),
    ["name", "path"],
  );
});

test("matchBand puts folders whose name holds every word first", () => {
  assert.equal(matchBand(congresses[0], "f lei"), 0);
  assert.equal(matchBand(congresses[2], "f lei"), 1);
});

test("matchBand is always 0 for single-word queries", () => {
  assert.equal(matchBand(congresses[1], "kongr"), 0);
  assert.equal(matchBand(congresses[3], "work"), 0);
});

test("matchBand respects caseSensitive", () => {
  assert.equal(matchBand(congresses[0], "f lei", { caseSensitive: true }), 1);
  assert.equal(matchBand(congresses[0], "f Lei", { caseSensitive: true }), 0);
});
