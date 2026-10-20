# Changelog

All notable changes to this project are documented here. Versions
follow [semantic versioning](https://semver.org/) — see
[ARCHITECTURE.md](ARCHITECTURE.md#versioning) for the project's policy.

## [1.3.0] - 2026-10-20

### Added

- Search queries can have several words, separated by spaces, in any
  order: a folder matches only if every word matches it, so each word
  narrows the list (e.g. `f lei` finds "2026-10 DGfN Leipzig" but not
  "2026-12 DTG Leipzig"). Words can also match a parent folder or the
  account name; folders whose own name contains all the words are
  listed first. Every word is highlighted in the results.

- A folder's search ranking can now be reset: highlight it in the
  search results and click the ⤓ icon at the end of the row, or press
  Shift+Delete. This forgets how often the folder has been used, so a
  once-busy folder (e.g. a past event's) stops outranking a newer one
  that matches the same search text.

### Changed

- Usage history now fades over time: a use counts half as much
  after 30 days, a quarter after 60, and so on, so folders you no
  longer use gradually stop outranking the ones you use now. Existing
  history is kept and treated as dating from when it was first
  recorded (1.1.0, August 2026).

## [1.2.0] - 2026-08-06

### Added

- Search ranking now also considers *what you typed*, not just
  overall usage: a folder you've previously picked after typing
  similar text now ranks ahead of your other folders for that same
  text, even if another folder is more-used overall. Falls back to
  overall usage frequency, then alphabetical, when there's no
  query-specific history yet.
- The options page now explains how search results are ranked.

## [1.1.0] - 2026-08-01

### Added

- Search results now sort by usage frequency: each time a folder is
  used for a move or jump, its weight goes up by 1, and the next
  time a search matches it, that weight is now the primary sort key
  (ties broken alphabetically) — frequently-used folders bubble to
  the top. Applies to typed-search results only; the empty-query
  recent-folders list is unchanged (still recency-based).
- The part of each result matching the typed search term is now
  highlighted (bold, accent-colored) in the results list.

## [1.0.0] - 2026-07-29

First stable release. No functional changes from 0.2.4 — the add-on
has been used in production, exercised through a real debugging cycle
(see the entries below), and reviewed; this release just adds a
public home for the project.

### Added

- `homepage_url` in the manifest, linking to
  [github.com/bovender/move-and-jump](https://github.com/bovender/move-and-jump)
  (now public), shown in Thunderbird's Add-ons Manager detail view.

## [0.2.4] - 2026-07-28

### Fixed

- The search window's fixed height could clip the recent-folders list
  (e.g. showing only 9 of 10 entries), and by how much depended on the
  viewer's font size, DPI, and OS text-scale settings, since the old
  height was a hardcoded pixel guess. The window now measures its own
  rendered content once after the initial view loads and resizes to
  fit, which works the same way regardless of environment because it's
  based on actual measurements rather than an assumed number.

## [0.2.3] - 2026-07-28

### Fixed

- Folder names with non-ASCII characters (e.g. umlauts) on IMAP
  accounts displayed as garbled text like `M&APw-nchen` instead of
  `München` — Thunderbird's `folders` API returns raw, undecoded IMAP
  "modified UTF-7" for such names. Added a decoder (`lib/imapUtf7.js`)
  applied wherever folder names are displayed or searched.

## [0.2.2] - 2026-07-28

### Fixed

- Move/jump failures are no longer silent: `background.js` now
  reports success/failure back to the search window, which shows an
  inline error message and stays open on failure instead of closing
  regardless of outcome.
- A rejected `mailTabs.get(tabId)` call (e.g. if the target tab closed
  at just the wrong moment) no longer takes down the whole popup
  initialization — it now falls back to unscoped folder search.
- The search window's title was the only hardcoded-English string in
  the UI; now routed through i18n like everything else.
- Typo fix in README.md ("developement" → "development").

## [0.2.1] - 2026-07-28

### Changed

- Search window widened from 420×420 to 560×440 to show more of
  nested folder paths, especially with the new account-name prefix.
- The options page now follows the system/Thunderbird dark theme
  instead of always rendering black-on-white.

## [0.2.0] - 2026-07-28

### Added

- Folders whose name exists in more than one account are now prefixed
  with the account name (e.g. `Work: Inbox`) wherever that's
  ambiguous, and the account name is also searchable.
- The search window always shows explicit **Move**, **Jump**, and
  **Cancel** buttons, regardless of which mode it was opened in — the
  one matching the window's mode is the default (what Enter does);
  the other lets you act differently on the highlighted folder.
- The options page now opens with a short explanation of the add-on
  and a live table of the current keyboard shortcuts (reflecting any
  rebinding you've done, not just the shipped defaults).

## [0.1.6] - 2026-07-28

### Fixed

- Keyboard shortcuts opened the search window but couldn't actually
  move or jump: `commands.onCommand` hands the active tab directly to
  its listener, same as `action.onClicked` (fixed in 0.1.3) — the
  keyboard path just hadn't been fixed the same way yet.

## [0.1.5] - 2026-07-28

### Changed

- Default shortcuts changed after real-world conflicts: `Ctrl+Shift+S`
  collided with something outside Thunderbird, and `Ctrl+Shift+G` is
  already a built-in Thunderbird shortcut.
  `move-search`/`move-last`/`jump-search`/`jump-last` are now
  `Ctrl+Shift+N` / `Ctrl+Alt+N` / `Ctrl+Shift+H` / `Ctrl+Alt+H`.

## [0.1.4] - 2026-07-28

### Fixed

- Selecting a folder with Enter (default top MRU entry, or after
  arrow-key navigation) silently did nothing: the window's own
  dismiss-on-blur handler was racing the in-flight move/jump message
  and closing the window before it completed.

## [0.1.3] - 2026-07-28

### Fixed

- Opening the search window via the toolbar button and picking a
  folder didn't move the message: `action.onClicked`'s listener wasn't
  using the tab it's handed directly, and fell back to a tab lookup
  that didn't reliably resolve from that callback.

## [0.1.2] - 2026-07-28

### Changed

- Replaced the toolbar action-popup panel with a real top-level popup
  window (`windows.create`). The panel wasn't reliably taking keyboard
  focus on Linux — the input would show a blinking caret but not
  actually receive keystrokes, which fell through to Thunderbird's own
  single-letter shortcuts underneath.

## [0.1.1] - 2026-07-28

### Fixed

- Keyboard shortcuts did nothing at all: opening the action popup
  awaited a storage write first, which drops the "user gesture" status
  `action.openPopup()` requires when invoked from a command shortcut.

## [0.1.0] - 2026-07-28

### Added

- Initial release: type-ahead search to move the selected email to a
  folder, or jump to a folder, as a lean Manifest V3 MailExtension
  with no runtime dependencies.
- Modifier-based keyboard shortcuts and a toolbar button, an options
  page (case-sensitive search, search all accounts), a shared
  most-recently-used folder list, unit tests for the pure logic in
  `lib/`, a GitHub Actions CI workflow, and localization into English,
  French, German, Spanish, and Simplified Chinese.
- Licensed under PolyForm Noncommercial 1.0.0.
