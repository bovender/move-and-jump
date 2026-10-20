/** Usage weights fade with this half-life (see usageIncrement). */
export const HALF_LIFE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Reference point for usageIncrement: 2026-08-01, the 1.1.0 release
 * that started recording weights. Weights stored before fading was
 * introduced were plain +1 counts, i.e. exactly what a use at this
 * moment is worth — so they carry over unchanged, as if all of that
 * older usage had happened on this date, and fade from there.
 */
export const WEIGHT_EPOCH_MS = Date.UTC(2026, 7, 1);

/**
 * How much one use of a folder at time `now` adds to its weight.
 * Rather than storing a timestamp per entry and decaying every stored
 * weight, each *new* use is worth twice as much as one made a
 * half-life earlier. Weights are only ever compared with each other,
 * so that ordering is identical to "every use loses half its weight
 * per half-life" — with no change to the stored data's shape. The
 * values do grow exponentially, but stay far inside a double's range
 * (2^1023) for about 80 years at a 30-day half-life.
 * @param {number} now milliseconds since the Unix epoch
 * @returns {number}
 */
export function usageIncrement(now) {
  return 2 ** ((now - WEIGHT_EPOCH_MS) / HALF_LIFE_MS);
}

/**
 * Record one more use of a folder. Pure/immutable, mirroring
 * lib/recent.js's pushRecent — returns a new object rather than
 * mutating `weights`.
 * @param {Record<string, number>} weights
 * @param {string} folderId
 * @param {number} [amount] what this use is worth; see usageIncrement
 * @returns {Record<string, number>}
 */
export function incrementWeight(weights, folderId, amount = 1) {
  return { ...weights, [folderId]: (weights[folderId] ?? 0) + amount };
}

/**
 * Sort folders by usage weight, most-used first, falling back to a
 * case-insensitive alphabetical-by-name order for folders with equal
 * (including absent, i.e. zero) weight. Unlike lib/match.js's own
 * tie-break, this is deliberately *not* about match relevance — it
 * decides display order for a set of folders match.js already
 * decided are candidates.
 * @param {{id: string, name?: string}[]} folders
 * @param {Record<string, number>} weights
 * @returns {object[]} new array; `folders` is not mutated
 */
export function sortByWeight(folders, weights) {
  return [...folders].sort((a, b) => {
    const weightDiff = (weights[b.id] ?? 0) - (weights[a.id] ?? 0);
    if (weightDiff !== 0) return weightDiff;
    return (a.name ?? "").toLowerCase().localeCompare((b.name ?? "").toLowerCase());
  });
}

/**
 * The form a typed query is stored and looked up under: trimmed,
 * lowercased, and with runs of whitespace collapsed to one space, so
 * "f  lei" and "f lei" (a multi-word query, see lib/match.js) count
 * as the same thing.
 * @param {string} query
 * @returns {string}
 */
function normalizeQuery(query) {
  return (query ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Record one more use of a folder *for a specific typed query*,
 * fanning the increment out across every prefix of the (normalized,
 * see normalizeQuery) query. Fanning out means a *shorter* query typed on
 * some future occasion still benefits, as long as it's a prefix of
 * what was typed this time — selecting a folder after typing
 * "archive" also credits "a", "ar", …, "archiv", so typing just
 * "arch" next time already finds the association. The reverse isn't
 * true: typing *more* than was ever typed before won't match
 * anything yet — a deliberate, acceptable limit (see ARCHITECTURE.md).
 * No-ops (returns `queryWeights` unchanged) for a blank query.
 * @param {Record<string, Record<string, number>>} queryWeights
 * @param {string} query
 * @param {string} folderId
 * @param {number} [amount] what this use is worth; see usageIncrement
 * @returns {Record<string, Record<string, number>>}
 */
export function incrementQueryWeight(queryWeights, query, folderId, amount = 1) {
  const normalized = normalizeQuery(query);
  if (!normalized) return queryWeights;

  const next = { ...queryWeights };
  for (let end = 1; end <= normalized.length; end++) {
    const prefix = normalized.slice(0, end);
    // A prefix ending between two words is never looked up: the
    // query is trimmed before lookup, so "f " reads the "f" entry.
    if (prefix.endsWith(" ")) continue;
    next[prefix] = incrementWeight(next[prefix] ?? {}, folderId, amount);
  }
  return next;
}

/**
 * Forget all recorded usage of a folder — its global weight *and* its
 * weight under every query prefix — so it ranks as if it had never
 * been picked. Deliberately all-or-nothing rather than only clearing
 * the currently typed query's prefixes: with just those cleared, the
 * folder would still win the global-weight fallback against a
 * rarely-used competitor, which is exactly the case demoting is for.
 * Prefix entries left empty are dropped rather than kept as `{}`.
 * @param {Record<string, number>} folderWeights
 * @param {Record<string, Record<string, number>>} queryWeights
 * @param {string} folderId
 * @returns {{folderWeights: Record<string, number>, queryWeights: Record<string, Record<string, number>>}}
 */
export function forgetFolderWeights(folderWeights, queryWeights, folderId) {
  const { [folderId]: _removed, ...remainingGlobal } = folderWeights;
  const remainingQuery = {};
  for (const [prefix, weights] of Object.entries(queryWeights)) {
    const { [folderId]: _removedForPrefix, ...rest } = weights;
    if (Object.keys(rest).length > 0) remainingQuery[prefix] = rest;
  }
  return { folderWeights: remainingGlobal, queryWeights: remainingQuery };
}

/**
 * Sort folders for a specific typed query: first by match band (see
 * matchBand in lib/match.js; all band 0 unless `bandOf` is given),
 * then by the weight recorded for that exact (normalized) query, then
 * by overall/global weight, then alphabetically — each level only
 * breaking ties left by the one before it. Composes stable sorts
 * (`sortByWeight` already provides the global-weight + alphabetical
 * baseline) rather than a single multi-key comparator, relying on
 * `Array.prototype.sort`'s stability guarantee (ES2019+).
 * @param {{id: string, name?: string}[]} folders
 * @param {Record<string, Record<string, number>>} queryWeights
 * @param {Record<string, number>} globalWeights
 * @param {string} query
 * @param {(folder: object) => number} [bandOf]
 * @returns {object[]} new array; `folders` is not mutated
 */
export function sortByQueryWeight(folders, queryWeights, globalWeights, query, bandOf = () => 0) {
  const forQuery = queryWeights[normalizeQuery(query)] ?? {};
  return sortByWeight(folders, globalWeights)
    .sort((a, b) => (forQuery[b.id] ?? 0) - (forQuery[a.id] ?? 0))
    .sort((a, b) => bandOf(a) - bandOf(b));
}
