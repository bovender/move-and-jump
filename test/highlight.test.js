import { test } from "node:test";
import assert from "node:assert/strict";
import { findMatchRanges } from "../lib/highlight.js";

test("finds a case-insensitive match by default", () => {
  assert.deepEqual(findMatchRanges("Archive/Projects", "proj"), [{ start: 8, end: 12 }]);
  assert.deepEqual(findMatchRanges("Archive/Projects", "PROJ"), [{ start: 8, end: 12 }]);
});

test("caseSensitive option respects case", () => {
  assert.deepEqual(findMatchRanges("Archive/Projects", "PROJ", { caseSensitive: true }), []);
  assert.deepEqual(findMatchRanges("Archive/Projects", "Proj", { caseSensitive: true }), [
    { start: 8, end: 12 },
  ]);
});

test("returns no ranges for a blank query", () => {
  assert.deepEqual(findMatchRanges("Inbox", ""), []);
  assert.deepEqual(findMatchRanges("Inbox", "   "), []);
});

test("returns no ranges when the query isn't in the text at all", () => {
  assert.deepEqual(findMatchRanges("Inbox", "zzz"), []);
});

test("matches at the very start and the very end of the text", () => {
  assert.deepEqual(findMatchRanges("Inbox", "In"), [{ start: 0, end: 2 }]);
  assert.deepEqual(findMatchRanges("Inbox", "box"), [{ start: 2, end: 5 }]);
});

test("highlights every word of a multi-word query, in text order", () => {
  assert.deepEqual(findMatchRanges("2026-10 DGfN Leipzig", "lei f"), [
    { start: 10, end: 11 },
    { start: 13, end: 16 },
  ]);
});

test("skips words that don't appear in the text", () => {
  assert.deepEqual(findMatchRanges("Inbox", "work inbox"), [{ start: 0, end: 5 }]);
});

test("merges overlapping and touching ranges", () => {
  assert.deepEqual(findMatchRanges("Leipzig", "lei eip"), [{ start: 0, end: 4 }]);
  assert.deepEqual(findMatchRanges("Leipzig", "lei pzig"), [{ start: 0, end: 7 }]);
});

test("prefers an occurrence at or after preferFrom, falling back to the first one", () => {
  const label = "/Leitung/Leipzig";
  assert.deepEqual(findMatchRanges(label, "lei", { preferFrom: 9 }), [{ start: 9, end: 12 }]);
  assert.deepEqual(findMatchRanges(label, "tung", { preferFrom: 9 }), [{ start: 4, end: 8 }]);
});
