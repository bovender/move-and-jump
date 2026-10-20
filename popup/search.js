import { filterFolders, matchBand } from "../lib/match.js";
import { filterByAccount } from "../lib/folders.js";
import { getOptions } from "../lib/options.js";
import { decodeImapUtf7 } from "../lib/imapUtf7.js";
import { sortByQueryWeight, forgetFolderWeights } from "../lib/weights.js";
import { findMatchRanges } from "../lib/highlight.js";

const heading = document.getElementById("heading");
const input = document.getElementById("query");
const list = document.getElementById("results");
const empty = document.getElementById("empty");
const error = document.getElementById("error");
const moveButton = document.getElementById("moveButton");
const jumpButton = document.getElementById("jumpButton");
const cancelButton = document.getElementById("cancelButton");

// Passed via the window URL (see background.js's openSearchWindow),
// not storage, so both are available synchronously with no risk of a
// race against background.js. tabId identifies the mail tab this
// window was opened for — this window is its own top-level window,
// so `currentWindow: true` queries from in here would resolve to
// *this* window, not the mail window.
const params = new URLSearchParams(window.location.search);
const mode = params.get("mode") === "jump" ? "jump" : "move";
const tabId = params.has("tabId") ? Number(params.get("tabId")) : undefined;

let options;
let allFolders = [];
let recentFolders = [];
let folderWeights = {};
let queryWeights = {};
let visible = [];
let activeIndex = 0;
let showAccountPrefix = false;

// Set text and grab focus immediately, synchronously, before any
// async work below: Thunderbird only autofocuses the popup document
// itself, not a specific element, and focus() calls made after an
// await are prone to lose the race against the popup's own initial
// focus handling. The `autofocus` attribute in search.html is a
// second line of defense; render()'s repeat call below is a third.
document.title = messenger.i18n.getMessage("actionTitle");
heading.textContent = messenger.i18n.getMessage(
  mode === "move" ? "popupHeadingMove" : "popupHeadingJump",
);
input.placeholder = messenger.i18n.getMessage(
  mode === "move" ? "popupPlaceholderMove" : "popupPlaceholderJump",
);
empty.textContent = messenger.i18n.getMessage("popupNoMatches");
error.textContent = messenger.i18n.getMessage("popupError");
moveButton.textContent = messenger.i18n.getMessage("buttonMove");
jumpButton.textContent = messenger.i18n.getMessage("buttonJump");
cancelButton.textContent = messenger.i18n.getMessage("buttonCancel");
const demoteLabel = messenger.i18n.getMessage("buttonDemote");
moveButton.classList.toggle("primary", mode === "move");
jumpButton.classList.toggle("primary", mode === "jump");
input.focus();

async function init() {
  const [
    folders,
    accounts,
    opts,
    { recentFolders: recentIds = [] },
    { folderWeights: weights = {} },
    { queryWeights: qWeights = {} },
    activeTab,
  ] = await Promise.all([
    messenger.folders.query({}),
    messenger.accounts.list(),
    getOptions(messenger.storage.local),
    messenger.storage.local.get("recentFolders"),
    messenger.storage.local.get("folderWeights"),
    messenger.storage.local.get("queryWeights"),
    // The tab can close in the moment between background.js resolving
    // tabId and this running; a rejection here is only used for the
    // "search all accounts" scoping below, so fall back to unscoped
    // rather than letting the whole Promise.all reject.
    tabId === undefined ? undefined : messenger.mailTabs.get(tabId).catch(() => undefined),
  ]);
  folderWeights = weights;
  queryWeights = qWeights;

  options = opts;
  const scopedFolders = options.searchAllAccounts
    ? folders
    : filterByAccount(folders, activeTab?.displayedFolder?.accountId);

  // Folder names commonly repeat across accounts ("Inbox", "Sent", …);
  // attach each folder's account name so the list — and the search
  // ranking in lib/match.js — can disambiguate them. Only bother
  // showing the prefix in the UI when more than one account is
  // actually present in the current scope.
  const accountNameById = new Map(accounts.map((account) => [account.id, account.name]));
  allFolders = scopedFolders.map((folder) => ({
    ...folder,
    // IMAP folder names/paths come back as raw, undecoded modified
    // UTF-7 (RFC 3501) for anything containing non-ASCII characters —
    // e.g. "M&APw-nchen" instead of "München". Decode for display and
    // search matching; `id`/`accountId` are left untouched, since
    // those are opaque identifiers passed straight back to Thunderbird.
    name: decodeImapUtf7(folder.name ?? ""),
    path: decodeImapUtf7(folder.path ?? ""),
    accountName: accountNameById.get(folder.accountId) ?? "",
  }));
  showAccountPrefix = new Set(allFolders.map((folder) => folder.accountId)).size > 1;

  const byId = new Map(allFolders.map((folder) => [folder.id, folder]));
  recentFolders = recentIds.map((id) => byId.get(id)).filter(Boolean);

  render("");
  input.focus();

  // Resize once, based on the initial (recent-folders) view, so up to
  // 10 entries are visible without scrolling. Not repeated on every
  // later render() while typing — the window keeps this size and the
  // list scrolls internally for larger result sets, same as before.
  messenger.runtime
    .sendMessage({ type: "resize", height: measureRequiredWindowHeight() })
    .catch(() => {});
}

/**
 * How tall this window would need to be to show all of its current
 * content without the list scrolling — measured from the real,
 * rendered DOM rather than assumed, since font size, DPI, and OS text
 * scaling all affect this and none of them are known ahead of time.
 * Temporarily lifts the list's height/overflow constraints (which
 * would otherwise clip it to whatever height it currently has) so
 * `scrollHeight` reflects the natural, unclipped content size; then
 * converts that content height into an outer *window* height by
 * adding this window's current chrome overhead (title bar etc. —
 * `outerHeight - innerHeight`), whatever that happens to be on this
 * system.
 */
function measureRequiredWindowHeight() {
  document.body.classList.add("measuring");
  const contentHeight = document.documentElement.scrollHeight;
  document.body.classList.remove("measuring");
  const chromeOverhead = window.outerHeight - window.innerHeight;
  return contentHeight + chromeOverhead;
}

function folderLabel(folder) {
  return showAccountPrefix ? `${folder.accountName}: ${folder.path}` : folder.path;
}

/**
 * Fill `element` with `folder`'s label, wrapping the portions matching
 * the words of `query` (if any) in <mark> elements. Built from real DOM
 * nodes rather than innerHTML, consistent with the rest of the popup.
 */
function appendHighlighted(element, folder, query) {
  const label = folderLabel(folder);
  // The label ends with the folder's own name; prefer highlighting
  // words there over an earlier occurrence in a parent folder's name.
  const preferFrom = label.endsWith(folder.name) ? label.length - folder.name.length : 0;
  const ranges = query
    ? findMatchRanges(label, query, { caseSensitive: options.caseSensitiveSearch, preferFrom })
    : [];
  let position = 0;
  for (const { start, end } of ranges) {
    const mark = document.createElement("mark");
    mark.textContent = label.slice(start, end);
    element.append(document.createTextNode(label.slice(position, start)), mark);
    position = end;
  }
  element.append(document.createTextNode(label.slice(position)));
}

/**
 * Whether a typed-search result has any usage history that demoting
 * could reset. Every selection bumps the global weight, so a zero
 * global weight means there's nothing per-query either. Not offered
 * in the empty-query recent-folders view, whose order is recency and
 * wouldn't change.
 */
function canDemote(folder, query) {
  return Boolean(folder && query.trim() && (folderWeights[folder.id] ?? 0) > 0);
}

const SVG_NS = "http://www.w3.org/2000/svg";

/** A small "arrow down to a line" icon, drawn in currentColor. */
function createDemoteIcon() {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", "M12 3v13M6 10l6 6 6-6M5 21h14");
  svg.appendChild(path);
  return svg;
}

function createDemoteButton(folder) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "demote";
  button.tabIndex = -1;
  button.title = demoteLabel;
  button.setAttribute("aria-label", demoteLabel);
  button.appendChild(createDemoteIcon());
  // mousedown, not click, to get in ahead of the row's own mousedown
  // (which would select the folder) and to keep focus in the input.
  button.addEventListener("mousedown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    demote(folder);
  });
  return button;
}

function render(query) {
  const trimmed = query.trim();
  const matchOptions = { caseSensitive: options.caseSensitiveSearch };
  visible = trimmed
    ? sortByQueryWeight(
        filterFolders(allFolders, trimmed, matchOptions),
        queryWeights,
        folderWeights,
        trimmed,
        (folder) => matchBand(folder, trimmed, matchOptions),
      )
    : recentFolders;
  activeIndex = 0;

  list.innerHTML = "";
  for (const folder of visible) {
    const item = document.createElement("li");
    const label = document.createElement("span");
    label.className = "label";
    appendHighlighted(label, folder, trimmed);
    item.appendChild(label);
    if (canDemote(folder, trimmed)) item.appendChild(createDemoteButton(folder));
    item.addEventListener("mousedown", (event) => {
      event.preventDefault();
      select(mode, folder);
    });
    list.appendChild(item);
  }
  highlight();

  empty.hidden = !(trimmed && visible.length === 0);
  moveButton.disabled = jumpButton.disabled = visible.length === 0;
}

function highlight() {
  for (const [index, item] of [...list.children].entries()) {
    item.classList.toggle("active", index === activeIndex);
  }
  list.children[activeIndex]?.scrollIntoView({ block: "nearest" });
}

function moveActive(delta) {
  if (visible.length === 0) return;
  activeIndex = (activeIndex + delta + visible.length) % visible.length;
  highlight();
}

// Guards against our own dismiss-on-blur handler below racing a
// deliberate selection closed: if Enter (unlike the arrow keys)
// causes this window to lose focus as a side effect, blur would fire
// while select()'s sendMessage is still in flight and close the
// window before the move/jump actually happens. Once we've decided to
// close on purpose, further blur events are a no-op.
let closing = false;

async function select(actionMode, folder) {
  if (!folder) {
    console.error("Move and Jump: select() called with no folder", {
      activeIndex,
      visibleCount: visible.length,
    });
    return;
  }
  error.hidden = true;
  closing = true;
  try {
    const response = await messenger.runtime.sendMessage({
      type: "select",
      mode: actionMode,
      folderId: folder.id,
      tabId,
      query: input.value,
    });
    if (response?.ok === false) throw new Error(response.error);
  } catch (sendError) {
    console.error("Move and Jump: select failed", sendError);
    closing = false;
    error.hidden = false;
    return;
  }
  window.close();
}

/**
 * Reset `folder`'s ranking (see handleDemote in background.js), then
 * mirror the same change in this window's in-memory copy of the
 * weights and re-render, so the new order shows up immediately.
 */
async function demote(folder) {
  error.hidden = true;
  try {
    const response = await messenger.runtime.sendMessage({
      type: "demote",
      folderId: folder.id,
    });
    if (response?.ok === false) throw new Error(response.error);
  } catch (sendError) {
    console.error("Move and Jump: demote failed", sendError);
    error.hidden = false;
    return;
  }
  ({ folderWeights, queryWeights } = forgetFolderWeights(folderWeights, queryWeights, folder.id));
  render(input.value);
}

input.addEventListener("input", () => render(input.value));

input.addEventListener("keydown", (event) => {
  switch (event.key) {
    case "ArrowDown":
      event.preventDefault();
      moveActive(1);
      break;
    case "ArrowUp":
      event.preventDefault();
      moveActive(-1);
      break;
    case "Enter":
      event.preventDefault();
      select(mode, visible[activeIndex]);
      break;
    case "Delete":
      // Shift+Delete, as in Firefox's address bar for removing a
      // suggestion. Anything else (including Shift+Delete on a row
      // with nothing to reset) keeps the input's default behavior.
      if (event.shiftKey && canDemote(visible[activeIndex], input.value)) {
        event.preventDefault();
        demote(visible[activeIndex]);
      }
      break;
    case "Escape":
      event.preventDefault();
      closing = true;
      window.close();
      break;
    default:
      break;
  }
});

moveButton.addEventListener("click", () => select("move", visible[activeIndex]));
jumpButton.addEventListener("click", () => select("jump", visible[activeIndex]));
cancelButton.addEventListener("click", () => {
  closing = true;
  window.close();
});

// This is a real top-level window rather than an anchored toolbar
// popup, so nothing dismisses it automatically when the user clicks
// elsewhere — do that ourselves. Guarded by `closing` (see above).
window.addEventListener("blur", () => {
  if (!closing) window.close();
});

init();
