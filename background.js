import { pushRecent } from "./lib/recent.js";
import { DEFAULT_OPTIONS } from "./lib/options.js";
import { decodeImapUtf7 } from "./lib/imapUtf7.js";
import {
  incrementWeight,
  incrementQueryWeight,
  forgetFolderWeights,
  usageIncrement,
} from "./lib/weights.js";

/**
 * In-memory mirror of storage.local's lastUsedFolderId, kept in sync so
 * the move-last/jump-last commands can act without waiting on a
 * storage round-trip first.
 */
let cachedLastUsedFolderId = null;
messenger.storage.local.get("lastUsedFolderId").then(({ lastUsedFolderId }) => {
  cachedLastUsedFolderId = lastUsedFolderId ?? null;
});

/** Tracks the currently open search window, if any, so a second
 * invocation replaces it instead of piling up windows. */
let searchWindowId = null;
messenger.windows.onRemoved.addListener((windowId) => {
  if (windowId === searchWindowId) searchWindowId = null;
});

/**
 * Look up a single folder by id. Thunderbird's folders API has no
 * get-by-id call, so this does a linear scan of the (typically small)
 * folder list.
 */
async function getFolderById(folderId) {
  const folders = await messenger.folders.query({});
  return folders.find((folder) => folder.id === folderId);
}

/**
 * The mail tab a move/jump should apply to. Uses currentWindow, which
 * is only correct when called before the search window exists (that
 * window is a separate top-level window and isn't a mail tab at all,
 * so it must never be "current" when this resolves) — see
 * openSearchWindow() and actOnLastFolder() for where this is safe to
 * call.
 */
async function getActiveTab() {
  const [tab] = await messenger.mailTabs.query({ active: true, currentWindow: true });
  return tab;
}

async function performMove(folderId, tabId) {
  if (tabId === undefined) {
    console.error("Move and Jump: performMove called with no tabId, nothing to move");
    return;
  }
  const { messages } = await messenger.mailTabs.getSelectedMessages(tabId);
  if (messages.length === 0) return;
  await messenger.messages.move(
    messages.map((message) => message.id),
    folderId,
    { isUserAction: true },
  );
}

async function performJump(folderId, tabId) {
  if (tabId === undefined) {
    console.error("Move and Jump: performJump called with no tabId, nothing to jump in");
    return;
  }
  await messenger.mailTabs.update(tabId, { displayedFolderId: folderId });
}

async function recordUsage(folderId, query = "") {
  cachedLastUsedFolderId = folderId;
  const [{ recentFolders = [] }, { folderWeights = {} }, { queryWeights = {} }, folder] =
    await Promise.all([
      messenger.storage.local.get("recentFolders"),
      messenger.storage.local.get("folderWeights"),
      messenger.storage.local.get("queryWeights"),
      getFolderById(folderId),
    ]);
  const amount = usageIncrement(Date.now());
  await messenger.storage.local.set({
    recentFolders: pushRecent(recentFolders, folderId),
    folderWeights: incrementWeight(folderWeights, folderId, amount),
    queryWeights: incrementQueryWeight(queryWeights, query, folderId, amount),
    lastUsedFolderId: folderId,
  });
  if (folder) {
    await messenger.action.setTitle({
      title: messenger.i18n.getMessage("tooltipLastFolder", [decodeImapUtf7(folder.path)]),
    });
  }
}

async function handleSelection(mode, folderId, tabId, query) {
  try {
    if (mode === "move") await performMove(folderId, tabId);
    else if (mode === "jump") await performJump(folderId, tabId);
    await recordUsage(folderId, query);
    return { ok: true };
  } catch (error) {
    console.error("Move and Jump: handleSelection failed", error);
    return { ok: false, error: String(error) };
  }
}

/**
 * Reset a folder's ranking by forgetting all of its recorded usage
 * (see forgetFolderWeights). The recent-folders list and the last-used
 * folder are left alone — those are about recency, not ranking.
 */
async function handleDemote(folderId) {
  try {
    const [{ folderWeights = {} }, { queryWeights = {} }] = await Promise.all([
      messenger.storage.local.get("folderWeights"),
      messenger.storage.local.get("queryWeights"),
    ]);
    await messenger.storage.local.set(forgetFolderWeights(folderWeights, queryWeights, folderId));
    return { ok: true };
  } catch (error) {
    console.error("Move and Jump: handleDemote failed", error);
    return { ok: false, error: String(error) };
  }
}

const SEARCH_WINDOW_WIDTH = 560;
const SEARCH_WINDOW_MIN_HEIGHT = 440;
const SEARCH_WINDOW_MAX_HEIGHT = 700;

/**
 * Open the search UI as a real top-level popup window rather than the
 * toolbar action's popup panel. The action-popup panel turned out to
 * be unreliable at actually taking keyboard focus on (at least some)
 * Linux window managers — the input would show a blinking caret but
 * not receive keystrokes, which fell through to Thunderbird's own
 * single-letter shortcuts instead. A genuine top-level window is
 * subject to normal window-manager focus handling and doesn't have
 * that problem. See ARCHITECTURE.md for the full story.
 *
 * The target mail tab is resolved *before* the popup window exists
 * (or passed in already resolved) and threaded through explicitly via
 * the URL, rather than re-queried later — once the popup window
 * exists, "current window" no longer reliably means the mail window.
 */
async function openSearchWindow(mode, tabId) {
  const resolvedTabId = tabId ?? (await getActiveTab())?.id;
  if (resolvedTabId === undefined) {
    console.error("Move and Jump: openSearchWindow could not resolve a target mail tab");
  }

  if (searchWindowId !== null) {
    await messenger.windows.remove(searchWindowId).catch(() => {});
    searchWindowId = null;
  }

  let left;
  let top;
  try {
    const current = await messenger.windows.getCurrent();
    left = Math.round(current.left + (current.width - SEARCH_WINDOW_WIDTH) / 2);
    top = Math.round(current.top + (current.height - SEARCH_WINDOW_MIN_HEIGHT) / 3);
  } catch {
    // Fall back to the platform's default placement.
  }

  const params = new URLSearchParams({ mode });
  if (resolvedTabId !== undefined) params.set("tabId", String(resolvedTabId));

  const win = await messenger.windows.create({
    type: "popup",
    url: `popup/search.html?${params}`,
    width: SEARCH_WINDOW_WIDTH,
    height: SEARCH_WINDOW_MIN_HEIGHT,
    left,
    top,
    allowScriptsToClose: true,
  });
  searchWindowId = win.id;
}

/**
 * Called once the popup has measured how tall its own initial content
 * (heading + input + up to 10 recent folders + buttons) actually
 * rendered — fonts, DPI, and OS text-scale settings all affect how
 * tall that really is, so no fixed pixel guess holds up across
 * environments (see search.js's measureRequiredWindowHeight()).
 * Clamped between the window's initial height (a sensible floor,
 * leaving headroom for typed searches that return more than the
 * recent-folder list's 10 entries) and a generous ceiling (guards
 * against pathological cases on unusual systems).
 */
async function resizeSearchWindow(requestedHeight) {
  if (searchWindowId === null) return;
  const height = Math.min(
    SEARCH_WINDOW_MAX_HEIGHT,
    Math.max(SEARCH_WINDOW_MIN_HEIGHT, Math.round(requestedHeight)),
  );
  await messenger.windows.update(searchWindowId, { height });
}

async function actOnLastFolder(mode, tabId) {
  if (!cachedLastUsedFolderId) {
    await openSearchWindow(mode, tabId);
    return;
  }
  const folderId = cachedLastUsedFolderId;
  if (mode === "move") await performMove(folderId, tabId);
  else await performJump(folderId, tabId);
  await recordUsage(folderId);
}

// commands.onCommand hands us the active tab directly as its second
// argument (Thunderbird 106+) — use that, same as action.onClicked
// below, rather than an independent currentWindow query. That query
// (getActiveTab(), still used as a last-resort fallback inside
// openSearchWindow) turned out not to reliably resolve a tab when
// called from these event callbacks — confirmed via the
// "could not resolve a target mail tab" diagnostic, which is what
// silently broke the keyboard-shortcut path.
messenger.commands.onCommand.addListener((command, tab) => {
  switch (command) {
    case "move-search":
      return openSearchWindow("move", tab?.id);
    case "jump-search":
      return openSearchWindow("jump", tab?.id);
    case "move-last":
      return actOnLastFolder("move", tab?.id);
    case "jump-last":
      return actOnLastFolder("jump", tab?.id);
    default:
      return undefined;
  }
});

// action.onClicked hands us the clicked tab directly — use that
// rather than an independent currentWindow query, which is not
// guaranteed to resolve the same way from this callback.
messenger.action.onClicked.addListener((tab) => openSearchWindow("move", tab.id));

messenger.runtime.onMessage.addListener((message) => {
  if (message?.type === "select") {
    return handleSelection(message.mode, message.folderId, message.tabId, message.query);
  }
  if (message?.type === "demote") {
    return handleDemote(message.folderId);
  }
  if (message?.type === "resize") {
    return resizeSearchWindow(message.height);
  }
  return undefined;
});

messenger.runtime.onInstalled.addListener(async () => {
  const { options } = await messenger.storage.local.get("options");
  if (!options) {
    await messenger.storage.local.set({ options: DEFAULT_OPTIONS });
  }
});
