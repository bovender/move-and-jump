# Roadmap

Ideas considered and deliberately deferred, so they survive between
sessions instead of living only in chat history. Not commitments or
a schedule — just a backlog with enough design context to pick back
up later. Add to this list rather than losing an idea; move an entry
into [CHANGELOG.md](CHANGELOG.md) once it actually ships.

## Fuzzy search (fzf-style matching)

Replace (not just extend) `lib/match.js`'s tiered substring matching
with proper scored fuzzy subsequence matching, like the `fzf`
command-line tool: query characters just need to appear in order,
not contiguously, with score bonuses for matches at the start of a
path segment, right after a `/`, and in unbroken runs.

**Design notes:**

- Feasible with zero dependencies — it's a pure string algorithm,
  fits the existing `lib/match.js` pattern (dependency-free, unit
  testable). The `fzy` algorithm (simpler than fzf's own) is a good
  reference implementation to study rather than reinventing scoring
  from scratch.
- The scoring is the actual work, not the subsequence check itself —
  a naive "does the subsequence exist" match produces noisy, hard to
  predict ordering for short strings like folder names.
- **Highlighting is mostly ready.** Since multi-word queries (1.3.0),
  `findMatchRanges` in `lib/highlight.js` already returns several
  ranges per label. Fuzzy matches would just need to produce
  one-character ranges, from the matched indices, which the existing
  merge step joins into runs.
- **How it ranks against usage weights (discussed 2026-10-20, not yet
  decided).** Subsequence matches are much noisier than substring
  matches, so today's "weight wins, full stop" ordering would let a
  heavily used folder that matches on scattered letters beat an exact
  substring hit. Two ways to counter that:
  - *Combined score* (match quality + k × weight): continuous, needs
    tuning, and one more use can silently flip a folder past a
    clearly better text match. Rejected as unpredictable.
  - *Bands* (recommended, and already how multi-word queries rank
    name matches above path/account matches; see `matchBand` in
    `lib/match.js`): substring/all-words matches form the top
    band, ranked exactly as today; fuzzy-only matches go in a band
    below, ranked by fuzzy score, then weight. Text quality picks the
    band and habit orders within it. It's easy to reason about, and
    existing habits keep working unchanged.
  The open question is whether fuzzy is still worth it now that
  multi-word queries (1.3.0) cover the motivating case (`f lei`).

Frequency-weighted folder ranking and search-term highlighting (both
previously listed here) shipped in 1.1.0, per-typed-query-prefix
weighting followed in 1.2.0, and multi-word queries in 1.3.0 — see [CHANGELOG.md](CHANGELOG.md) and
`lib/weights.js`/`lib/highlight.js` in [ARCHITECTURE.md](ARCHITECTURE.md).
