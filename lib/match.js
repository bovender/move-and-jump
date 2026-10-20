/**
 * Split a query into its whitespace-separated words.
 * @param {string} query
 * @returns {string[]} empty for a blank query
 */
export function queryWords(query) {
  return query.trim().split(/\s+/).filter(Boolean);
}

/**
 * How well a single (already normalized) word matches a folder.
 * Lower is better: 0 = name starts with it, 1 = name contains it,
 * 2 = path contains it, 3 = account name contains it (only relevant
 * for folders carrying an `accountName`, used to disambiguate
 * same-named folders across accounts). `undefined` = no match.
 */
function wordTier(word, name, path, accountName) {
  if (name.startsWith(word)) return 0;
  if (name.includes(word)) return 1;
  if (path.includes(word)) return 2;
  if (accountName.includes(word)) return 3;
  return undefined;
}

/**
 * A folder's rank tier for a whole query: that of its worst-matching
 * word, or `undefined` if any word doesn't match at all.
 */
function folderTier(folder, words, norm) {
  const name = norm(folder.name ?? "");
  const path = norm(folder.path ?? "");
  const accountName = norm(folder.accountName ?? "");
  let worst = 0;
  for (const word of words) {
    const tier = wordTier(word, name, path, accountName);
    if (tier === undefined) return undefined;
    worst = Math.max(worst, tier);
  }
  return worst;
}

function normalizer(caseSensitive) {
  return caseSensitive ? (s) => s : (s) => s.toLowerCase();
}

/**
 * Filter and rank folders against a search query of one or more
 * whitespace-separated words, in any order. A folder matches only if
 * *every* word matches it on its own — in its name, its path, or its
 * account name — so each extra word narrows the list. Ranked by the
 * tier (see wordTier) of each folder's worst-matching word, ties
 * alphabetical by name.
 * @param {{name: string, path: string, accountName?: string}[]} folders
 * @param {string} query
 * @param {{caseSensitive?: boolean}} [options]
 * @returns {object[]} matching folders, best match first
 */
export function filterFolders(folders, query, { caseSensitive = false } = {}) {
  const norm = normalizer(caseSensitive);
  const words = queryWords(query).map(norm);
  if (words.length === 0) return [];

  const ranked = [];
  for (const folder of folders) {
    const rank = folderTier(folder, words, norm);
    if (rank !== undefined) ranked.push({ folder, rank });
  }

  ranked.sort(
    (a, b) =>
      a.rank - b.rank ||
      norm(a.folder.name ?? "").localeCompare(norm(b.folder.name ?? "")),
  );
  return ranked.map((r) => r.folder);
}

/**
 * Which band a matching folder ranks in, ahead of usage weight (see
 * sortByQueryWeight in lib/weights.js): for a query of several words,
 * 0 if the folder's own name contains every word, 1 if some word only
 * matched its path or account name. Typing several words describes
 * the folder's name more precisely, so a folder whose name fits that
 * description shouldn't lose to a more-used one where a short word
 * like "f" happened to match somewhere in a parent folder's name.
 * Single-word queries are always band 0, i.e. ranked purely by usage
 * as before multi-word queries existed.
 * @param {{name: string, path: string, accountName?: string}} folder
 * @param {string} query
 * @param {{caseSensitive?: boolean}} [options]
 * @returns {0 | 1}
 */
export function matchBand(folder, query, { caseSensitive = false } = {}) {
  const norm = normalizer(caseSensitive);
  const words = queryWords(query).map(norm);
  if (words.length < 2) return 0;
  const name = norm(folder.name ?? "");
  return words.every((word) => name.includes(word)) ? 0 : 1;
}
