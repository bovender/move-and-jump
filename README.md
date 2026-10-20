# Move and Jump

Add-on for Thunderbird that provides keyboard shortcuts
to quickly move mail to a folder that is identified using
type-ahead search, and that also enables users to quickly
jump to a folder which is also identified by type-ahead
search.

This is a modern rewrite of the venerable [Nostalgy][] and
[Nostalgy++][] extensions. It is by no means feature complete
in comparison to the existing add-ons.

### Viable alternatives

- [Quick Folder Move][]: probably the most popular today? It did not agree with
  me too well though because I could not get the "jump to folder" function to
  work the way I wanted.
- [Nostalgy++][]: venerable, but does not play well with the dark theme on my
  Fedora KDE Plasma box.
- [mmy][]: "Move messages or yourself" add-on

## Functions

Note on shortcuts: Thunderbird's WebExtension `commands` API requires
at least one modifier key, so bare-letter shortcuts like Nostalgy's
plain <kbd>s</kbd>/<kbd>g</kbd> aren't available without falling back
to legacy, privileged code. The defaults below can be changed to
whatever you like under *Add-ons Manager → gear icon → Manage
Extension Shortcuts* (the same page also lists them, under
*Options*).

The search window always shows explicit **Move**, **Jump**, and
**Cancel** buttons, whichever way it was opened — the one matching
how you opened it is highlighted as the default (what <kbd>ENTER</kbd>
does), but you can click the other action button at any time to do
that instead for the currently highlighted folder. If the same folder
name exists in more than one account, results are prefixed with the
account name to tell them apart.

Search results are ranked by what you've picked before, and not just
overall: a folder you've picked after typing similar text before
comes first, then your most-used folders in general, then
alphabetically — so the more consistently you type a certain pattern
for a folder, the sooner it'll show up when you type that pattern
again. Recent use counts for more than older use (its weight halves
about every month), so a folder you stop using gradually makes way
for the ones you use now. The part of each result matching what you typed is highlighted.
(The full ranking logic, and why it's designed this way, is written
up in [ARCHITECTURE.md](ARCHITECTURE.md).)

If a folder you used a lot keeps crowding out the one you need now
(say, last month's project folder versus this month's, both matching
what you type), you can reset its ranking: highlight it in the search
results and click the small ⤓ icon at the right end of the row, or
press <kbd>Shift</kbd><kbd>Delete</kbd>. This forgets how often you've
used that folder, so it ranks like a folder you've never picked.
Nothing else is affected; the folder and its emails stay as they are.

### Move an email to a folder

Press <kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>N</kbd> to open a search
box. Begin typing the desired folder name or parts of it. A list of
search results updates automatically as you type. You can type
several words separated by spaces, in any order, and each one narrows
the list further — e.g. `f lei` finds "2026-10 DGfN Leipzig" but not
"2026-12 DTG Leipzig". Words can also match a parent folder or the
account name (`work inbox`), but folders whose own name contains all
the words are listed first. Press
<kbd>ENTER</kbd> to accept the selected folder and move the email.

You may also just press <kbd>ENTER</kbd> without typing anything to
move the email to the first of the 10 most recent target folders, or
navigate the list using the <kbd>UP</kbd> and <kbd>DOWN</kbd> keys to
select one of those folders.

Press <kbd>Ctrl</kbd><kbd>Alt</kbd><kbd>N</kbd> to move the email to
the last used folder directly, without opening the search box. This
last used folder is shown in the toolbar button's tooltip.

### Jump to a specific folder

Press <kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>H</kbd> to open the search
box, and start typing the name (or parts of the name) of the desired
folder. Hit <kbd>ENTER</kbd> to accept the folder and go to it.

The list of the 10 most recent folders is shared between the
'move' and the 'jump' functions, and you can accept the most
recent one, or navigate the list in the same way as when
moving an email.

Press <kbd>Ctrl</kbd><kbd>Alt</kbd><kbd>H</kbd> to jump directly to
the most recent folder, shown in the toolbar button's tooltip.

## Options

The options page (Add-ons Manager → Move and Jump → *Preferences*)
opens with a short explanation of the add-on and a live table of the
current keyboard shortcuts, followed by the actual preferences:

Preference                | Default
--------------------------|----------
Case-sensitive search     | off (search is case-insensitive)
Search in all accounts    | on (folders from all accounts are being listed)

## Installation

Install it straight from
[addons.thunderbird.net](https://addons.thunderbird.net/en-US/thunderbird/addon/move-and-jump/) —
click **Add to Thunderbird**. Installed this way, Thunderbird also
handles future updates automatically.

### Building from source

To try an unreleased change ahead of the next published version,
build and install it manually instead:

```sh
npm install
npm run build   # produces web-ext-artifacts/move-and-jump-<version>.xpi
```

Then in Thunderbird: *Add-ons Manager* (hamburger menu → Add-ons and
Themes) → gear icon → **Install Add-on From File…** → select the
`.xpi`. Unlike Firefox, stock Thunderbird ships with add-on signature
enforcement **off** by default, so this works without touching
`about:config`. (If your build/distro has it turned on and installation
is refused, set `xpinstall.signatures.required` to `false` in
`about:config`, restart, and try again.)

This installs it as a regular, persistent add-on, but — unlike
installing from ATN — it won't auto-update itself; building and
reinstalling a new `.xpi` is how you pick up further changes this way.

## Localization

The UI is available in English (default), French, German, Spanish, and
Simplified Chinese, matching Thunderbird's own display-language
setting automatically. The non-English strings (`_locales/*/messages.json`)
were translated by Claude and haven't been reviewed by native speakers —
corrections via PR are welcome.

## Development

This is a dependency-free WebExtension (Manifest V3); the only
tool involved is [web-ext][] for running, building, and linting it.

```sh
npm install
npm start   # launches Thunderbird with the add-on loaded (expects
            # `thunderbird` on PATH; override with
            # `npm start -- --firefox-binary /path/to/thunderbird`)
npm test    # runs the unit tests (Node's built-in test runner)
npm run lint   # validates manifest.json and source with web-ext lint
npm run build  # packages a .xpi into web-ext-artifacts/
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for how the add-on is put
together and why, [CHANGELOG.md](CHANGELOG.md) for what's changed
between versions, and [ROADMAP.md](ROADMAP.md) for deferred ideas.
A GitHub Actions workflow
([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs the same
three commands (test, lint, build) on every push and pull request.
Pushing a version tag (`vX.Y.Z`, matching `manifest.json`'s version)
triggers [.github/workflows/release.yml](.github/workflows/release.yml),
which signs and publishes the release to
[addons.thunderbird.net](https://addons.thunderbird.net) and creates a
GitHub release — see [ARCHITECTURE.md](ARCHITECTURE.md#publishing-to-addonsthunderbirdnet-atn)
for the details.

## Contributing to development

Pull requests are welcome.

This add-on is being co-authored by Claude Code (Sonnet 5).

## Disclaimer

This add-on moves your email between folders, and — as of 1.2.0 —
which folder gets picked can depend on your own past search and
selection history, not just what you typed in the moment. It's been
used in daily production use without incident, but it's provided
as-is, with no warranty: you're responsible for checking that a
message ended up where you expected (the toolbar tooltip always shows
the last-used folder), and neither this project nor its author is
liable for lost, misfiled, or "where on earth did that email go"
messages. See the license below for the formal version of this.

## License

[PolyForm Noncommercial 1.0.0](LICENSE). True permissive licenses
(MIT, BSD, Apache) can't forbid commercial use, so this add-on uses
a noncommercial source-available license instead: you may freely
use, modify, and redistribute it for any noncommercial purpose;
commercial use requires a separate arrangement with the copyright
holder.

[mmy]: https://github.com/arjanarcheologie/mmy
[Nostalgy]: https://github.com/nostalgy/nostalgy
[Nostalgy++]: https://github.com/opto/nostalgy-xpi
[Quick Folder Move]: https://addons.mozilla.org/thunderbird/addon/quick-folder-move
[web-ext]: https://github.com/mozilla/web-ext
