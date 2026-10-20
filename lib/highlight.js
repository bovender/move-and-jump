import { queryWords } from "./match.js";

/**
 * Find where the words of `query` appear in `text`, for highlighting
 * the matched portions of a displayed folder label. This deliberately
 * re-derives positions from the final *displayed* string rather than
 * threading match positions through lib/match.js's matching —
 * simpler, and correct regardless of which field (name/path/account
 * name) actually caused the match, since it just looks at what's on
 * screen.
 *
 * Each word is highlighted once: preferably at or after `preferFrom`
 * (the caller passes where the folder's own name starts in the label,
 * so a word that's in both a parent folder and the name is marked in
 * the name), otherwise at its first occurrence. Overlapping or
 * touching ranges are merged.
 * @param {string} text
 * @param {string} query
 * @param {{caseSensitive?: boolean, preferFrom?: number}} [options]
 * @returns {{start: number, end: number}[]} sorted, non-overlapping;
 *   empty if `query` is blank or none of its words appear in `text`
 *   (the latter can happen if a folder matched on a field not shown
 *   in the label, e.g. an account name when the account prefix isn't
 *   displayed).
 */
export function findMatchRanges(text, query, { caseSensitive = false, preferFrom = 0 } = {}) {
  const norm = caseSensitive ? (s) => s : (s) => s.toLowerCase();
  const haystack = norm(text);

  const ranges = [];
  for (const word of queryWords(query).map(norm)) {
    let start = haystack.indexOf(word, preferFrom);
    if (start === -1) start = haystack.indexOf(word);
    if (start !== -1) ranges.push({ start, end: start + word.length });
  }

  ranges.sort((a, b) => a.start - b.start);
  const merged = [];
  for (const range of ranges) {
    const last = merged.at(-1);
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else merged.push({ ...range });
  }
  return merged;
}
