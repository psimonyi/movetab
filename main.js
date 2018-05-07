/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Move Tab extension: lets you move a tab from its context menu for when you
 * want to move it so far that dragging it would be a drag. */

'use strict';

const MID_TOP = 'movetab_menu';
const MID_NEW_WINDOW = 'newwindow';
const MID_MARK = 'toggle-mark';
const MID_PREFIX_WINDOW = 'window:';
const MID_PREFIX_TAB = 'tab:';

const DEFAULT_PREFS = {
    move: 'after',
    active: 'keep',
};

// Marked tab IDs (marked as "this is a teleport target").
let marks = new Set();

// options.js reads prefs from here (so as to get the same defaults).
var prefs = DEFAULT_PREFS;
browser.storage.sync.get().then(loaded => Object.assign(prefs, loaded));
browser.storage.onChanged.addListener(changes => {
    for (let key of Object.keys(changes)) {
        prefs[key] = changes[key].newValue;
    }
});

let menu_state = '';
makeMenuBase();

// Clear the menu and fill it with the static part that's always there.  This
// is the state when the menu is not being shown yet, so that if the
// dynamically updated part is late, the user still sees the submenu arrow.
function makeMenuBase() {
    if (menu_state === 'building') {
        menu_state = 'want-base';
        return;
    }

    browser.menus.removeAll();

    browser.menus.create({
        id: MID_TOP,
        title: browser.i18n.getMessage("menu@label"),
        contexts: ['tab'],
    });

    for (let end of ['left', 'right']) {
        browser.menus.create({
            id: end,
            parentId: MID_TOP,
            title: browser.i18n.getMessage(`${end}@label`),
            icons: {
                "16": `${end}.svg`,
            },
        });
    }

    menu_state = 'base';
}

// Build the rest of the menu, assuming we start from makeMenuBase.
async function makeMenuRest(contextTab) {
    if (menu_state === 'building') {
        menu_state = 'want-full';
        return;
    }
    if (menu_state !== 'base') makeMenuBase();
    menu_state = 'building';

    let markedTabs = await Promise.all(Array.from(marks.values())
                                       .map(id => browser.tabs.get(id)));
    markedTabs.sort((a, b) => a.index - b.index);
    const windows = await browser.windows.getAll({windowTypes: ['normal']});
    const currentWin = windows.find(win => win.focused);
    if (!currentWin) return; // Eh, can't right-click until there's a window.

    let to_tab_pattern = `${prefs.move}_tab@pattern`;

    for (let tab of markedTabs) if (tab.windowId === currentWin.id) {
        browser.menus.create({
            id: MID_PREFIX_TAB + JSON.stringify(tab.id),
            parentId: MID_TOP,
            title: browser.i18n.getMessage(to_tab_pattern, tab.title),
            enabled: contextTab.id !== tab.id,
        });
    }

    browser.menus.create({
        parentId: MID_TOP,
        type: "separator",
    });

    for (let win of windows) {
        if (win.focused) continue;
        if (win.incognito !== currentWin.incognito) continue;

        browser.menus.create({
            id: MID_PREFIX_WINDOW + JSON.stringify(win.id),
            parentId: MID_TOP,
            title: browser.i18n.getMessage('to_window@pattern', win.title),
            icons: {
                "16": 'photon-window-16.svg',
            },
        });

        for (let tab of markedTabs) if (tab.windowId === win.id) {
            browser.menus.create({
                id: MID_PREFIX_TAB + JSON.stringify(tab.id),
                parentId: MID_TOP,
                title: browser.i18n.getMessage(to_tab_pattern, tab.title),
            });
        }
    }

    browser.menus.create({
        id: MID_NEW_WINDOW,
        parentId: MID_TOP,
        title: browser.i18n.getMessage('new_window@label'),
        icons: {
            "16": 'photon-window-new-16.svg',
        },
    });

    browser.menus.create({
        parentId: MID_TOP,
        type: "separator",
    });

    let title, icons;
    if (marks.has(contextTab.id)) {
        title = browser.i18n.getMessage('mark_unset@label');
        icons = {'16': 'unmark.svg'};
    } else {
        title = browser.i18n.getMessage('mark_set@label');
        icons = {'16': 'mark.svg'};
    }
    browser.menus.create({
        id: MID_MARK,
        parentId: MID_TOP,
        title,
        icons,
    });
    // Note bug 1414566 - menus.update can't update the icon.

    if (menu_state === 'want-base') {
        makeMenuBase();
    } else if (menu_state !== 'building') {
        makeMenuRest(contextTab);
    } else {
        menu_state = 'full';
    }
}

browser.menus.onShown.addListener(async function (info, tab) {
    await makeMenuRest(tab);
    browser.menus.refresh();
});

// When the menu is hidden, clear it back to a stub ready for the next onShown.
browser.menus.onHidden.addListener(makeMenuBase);

// When tabs are closed, remove them from our cache of marks.  The mark can be
// restored if the tab is reopened.
browser.tabs.onRemoved.addListener(function (tabId) {
    if (marks.has(tabId)) {
        marks.delete(tabId);
    }
});

// Listen for reopened tabs that were marked.
browser.tabs.onCreated.addListener(async function (tab) {
    const isTarget = await browser.sessions.getTabValue(tab.id, 'target');
    if (isTarget) {
        setMark(tab);
    }
});

// Since marking tabs happens in content (as a hack around the WebExtensions
// API not providing a real way to do it), we have to re-do it sometimes:
// - when the tab's title changes (e.g. the page updated itself, or the user
//   navigated somewhere)
// - when the tab is restored after being unloaded (because if the tab was
//   marked while unloaded, the script won't have run)
// Running addMark.js is idempotent, so it's okay if we are over-eager with it.
// Also the menu item needs to be updated, of course.
browser.tabs.onUpdated.addListener(function (tabId, updates, tab) {
    // When loading an unloaded tab, the sequence of events is strange.  The
    // 'url' reported is still 'about:blank' when 'discarded' changes to false,
    // and we can't run content scripts yet.  So listen for 'url' changes too.
    if (marks.has(tabId) && ('title' in updates
                          || 'discarded' in updates
                          || 'url' in updates)) {
        browser.tabs.executeScript(tab.id,
            {file: 'addMark.js', runAt: 'document_start'});
        let to_tab_pattern = `${prefs.move}_tab@pattern`;
        browser.menus.update(MID_PREFIX_TAB + JSON.stringify(tab.id),
            {title: browser.i18n.getMessage(to_tab_pattern, tab.title)});
    }
});

// When this extension is upgraded, refresh the cache of marked tabs.
browser.runtime.onInstalled.addListener(async function (details) {
    if (details.reason == 'update') {
        let tabs = await browser.tabs.query({});
        let tabs_targets = await Promise.all(tabs.map(async tab =>
            [tab, await browser.sessions.getTabValue(tab.id, 'target')]));

        for (let [tab, isTarget] of tabs_targets) {
            if (isTarget) {
                setMark(tab);
            }
        }
    }
});

browser.menus.onClicked.addListener(async function (info, tab) {
    if (info.menuItemId === MID_MARK) {
        // Toggle whether this tab is marked.
        if (marks.has(tab.id)) {
            clearMark(tab);
        } else {
            setMark(tab);
        }
    } else if (info.menuItemId === MID_NEW_WINDOW) {
        browser.windows.create({tabId: tab.id});
    } else if (info.menuItemId === 'right') {
        if (tab.pinned) {
            await browser.tabs.update(tab.id, {pinned: false});
        }
        moveTab(tab, tab.windowId, -1);
    } else if (info.menuItemId === 'left') {
        if (tab.pinned) {
            await browser.tabs.update(tab.id, {pinned: false});
        }
        let index = await pinnedTabCount(tab.windowId);
        moveTab(tab, tab.windowId, index);
    } else if (info.menuItemId.startsWith(MID_PREFIX_WINDOW)) {
        const windowId = JSON.parse(
            info.menuItemId.slice(MID_PREFIX_WINDOW.length));
        let index = -1;
        if (tab.pinned) {
            index = await pinnedTabCount(windowId);
        }
        moveTab(tab, windowId, index);
    } else if (info.menuItemId.startsWith(MID_PREFIX_TAB)) {
        const destTabId = JSON.parse(
            info.menuItemId.slice(MID_PREFIX_TAB.length));
        const destTab = await browser.tabs.get(destTabId);
        if (tab.pinned != destTab.pinned) {
            await browser.tabs.update(tab.id, {pinned: destTab.pinned});
        }

        // We know tab is not destTab because the menu item's disabled then.
        let offset = prefs.move === 'after' ? 1 : 0;
        if (tab.windowId === destTab.windowId
            && tab.index < destTab.index) {
            offset -= 1;
        }
        moveTab(tab, destTab.windowId, destTab.index + offset);
    }
});

// Since pinned tabs must all be at the start, this is also the index of the
// first non-pinned tab.
async function pinnedTabCount(windowId) {
    let tabs = await browser.tabs.query({windowId, pinned: true});
    return tabs.length;
}

async function moveTab(tab, destWindowId, destIndex) {
    if (tab.active && prefs.active === 'next') {
        // Activate the next tab before doing the move to avoid unnecessary
        // tabbox scrolling.
        let nextTab = await pickNextTab(tab);
        await browser.tabs.update(nextTab.id, {active: true});
    }

    await browser.tabs.move(tab.id, {
        windowId: destWindowId,
        index: destIndex
    });

    if (tab.active && prefs.active === 'keep') {
        browser.tabs.update(tab.id, {active: true});
        browser.windows.update(destWindowId, {focused: true});
    }
}

// Choose which tab to select next when prefs.active === 'next'.
// Return the tab object.
async function pickNextTab(tab) {
    // Try the adjacent undiscarded tabs of the same pinnedness, preferring the
    // one to the right.
    let right = await findTab({
        windowId: tab.windowId,
        index: tab.index + 1,
        pinned: tab.pinned,
    });
    if (right && !right.discarded) return right;

    let left = await findTab({
        windowId: tab.windowId,
        index: tab.index - 1,
        pinned: tab.pinned,
    });
    if (left && !left.discarded) return left;

    // Give up on the 'undiscarded' criterion, again preferring the right.
    if (right) return right;
    if (left) return left;

    // This tab is the last tab of the same pinnedness in its window, so go for
    // the adjacent tab of the other pinnedness.  If this is the only
    // pinned tab, then it must be index 0 and the adjacent non-pinned tab is
    // index 1.  If this is the only non-pinned tab, the adjacent pinned tab is
    // the rightmost pinned tab, which comes immediately before this tab.
    let next = await findTab({
        windowId: tab.windowId,
        index: tab.pinned ? 1 : tab.index - 1,
    });
    if (next) return next;

    // I guess that means this is the only tab in the window, so just stick
    // with the orignal tab.
    return tab;
}

async function findTab(queryInfo) {
    let result = await browser.tabs.query(queryInfo);
    return result.length ? result[0] : null;
}

function setMark(tab) {
    marks.add(tab.id);
    browser.sessions.setTabValue(tab.id, 'target', true);
    browser.tabs.executeScript(tab.id,
        {file: 'addMark.js', runAt: 'document_start'});
}

function clearMark(tab) {
    marks.delete(tab.id);
    browser.sessions.removeTabValue(tab.id, 'target');
    browser.tabs.executeScript(tab.id,
        {file: 'removeMark.js', runAt: 'document_start'});
}
