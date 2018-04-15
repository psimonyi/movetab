/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Move Tab extension: lets you move a tab from its context menu for when you
 * want to move it so far that dragging it would be a drag. */

'use strict';

// Since Firefox 60, we can update the menu based on context as it's shown.
// Before that, we have to work around it by eagerly updating the menu.
const DYNAMIC_MENU = !!(browser.menus.onShown && browser.menus.onHidden);

const MID_TOP = 'movetab_menu';
const MID_NEW_WINDOW = 'newwindow';
const MID_MARK = 'toggle-mark';
const MID_PREFIX_WINDOW = 'window:';
const MID_PREFIX_TAB = 'tab:';

// Marked tab IDs (marked as "this is a teleport target").
let marks = new Set();

let menu_state = '';
if (DYNAMIC_MENU) makeMenuBase();
makeMenu();

function makeMenu() {
    if (DYNAMIC_MENU) return;

    if (menu_state === 'building' || menu_state === 'needs_redo') {
        menu_state = 'needs_redo';
        return;
    }

    // Erase and completely rebuild the context menu.
    menu_state = 'building';
    makeMenuBase().then(makeMenuRest).then(() => {
        if (menu_state !== 'building') {
            menu_state = 'redo';
            makeMenu();
        } else {
            menu_state = 'done';
        }
    });
}

// Build the static starting part of the menu.
async function makeMenuBase() {
    await browser.menus.removeAll();

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
}

// Build the rest of the menu, assuming we start from makeMenuBase.
// If contextTab is falsy, we don't know which tab the menu is for, but we do
// assume it's in the current window.
async function makeMenuRest(contextTab) {
    const contextTabId = contextTab && contextTab.id;

    // Tabs are in the order they were marked.  It might be better to sort by
    // index though.
    const markedTabs = await Promise.all(Array.from(marks.values())
                                         .map(id => browser.tabs.get(id)));
    const windows = await browser.windows.getAll({windowTypes: ['normal']});
    const currentWin = windows.find(win => win.focused);
    if (!currentWin) return; // Eh, can't right-click until there's a window.

    for (let tab of markedTabs) if (tab.windowId === currentWin.id) {
        browser.menus.create({
            id: MID_PREFIX_TAB + JSON.stringify(tab.id),
            parentId: MID_TOP,
            title: browser.i18n.getMessage('after_tab@pattern', tab.title),
            enabled: contextTabId !== tab.id,
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
                title: browser.i18n.getMessage('after_tab@pattern', tab.title),
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
    if (!contextTab) {
        title = browser.i18n.getMessage('mark@label');
        icons = {'16': 'mark.svg'};
    } else if (marks.has(contextTab.id)) {
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
}

// Since Firefox 60, we can update the menu based on context as it's shown.
// When it's hidden, we revert to a basic starting menu, just in case it's
// shown briefly due to async effects (but since all the changes take place in
// a submenu and onShown/onHidden fire for the top-level context menu, the only
// really important part is that we create the submenu).
if (DYNAMIC_MENU) {
    browser.menus.onShown.addListener(async function (info, tab) {
        await makeMenuRest(tab);
        browser.menus.refresh();
    });

    browser.menus.onHidden.addListener(function () {
        makeMenuBase();
    });
} else {
    // Before Fx60 (!DYNAMIC_MENU), the menu has to be rebuilt when window
    // focus changes because the movement options depend on which one is the
    // active window.
    browser.windows.onFocusChanged.addListener(function (windowId) {
        if (windowId === browser.windows.WINDOW_ID_NONE) return;
        makeMenu();
    });
}

// When tabs are closed, remove them from our cache of marks.  The mark can be
// restored if the tab is reopened.
browser.tabs.onRemoved.addListener(function (tabId) {
    if (marks.has(tabId)) {
        marks.delete(tabId);
        makeMenu();
    }
});

// Listen for reopened tabs that were marked.
browser.tabs.onCreated.addListener(async function (tab) {
    const isTarget = await browser.sessions.getTabValue(tab.id, 'target');
    if (isTarget) {
        setMark(tab);
        makeMenu();
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
        browser.menus.update(MID_PREFIX_TAB + JSON.stringify(tab.id),
            {title: browser.i18n.getMessage('after_tab@pattern', tab.title)});
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
        makeMenu();
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
        makeMenu();
    } else if (info.menuItemId === MID_NEW_WINDOW) {
        browser.windows.create({tabId: tab.id});
    } else if (info.menuItemId === 'right') {
        if (tab.pinned) {
            await browser.tabs.update(tab.id, {pinned: false});
        }
        browser.tabs.move(tab.id, {index: -1});
    } else if (info.menuItemId === 'left') {
        if (tab.pinned) {
            await browser.tabs.update(tab.id, {pinned: false});
        }
        let index = await pinnedTabCount(tab.windowId);
        browser.tabs.move(tab.id, {index});
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
        let offset = 1;
        if (destTab.windowId === tab.windowId
            && tab.index <= destTab.index) {
            offset = 0;
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

function moveTab(tab, destWindowId, destIndex) {
    const promise = browser.tabs.move(tab.id, {
        windowId: destWindowId,
        index: destIndex
    });
    if (tab.active) {
        // Keep this tab as the active tab after the move.
        promise.then(() => {
            browser.tabs.update(tab.id, {active: true});
            browser.windows.update(destWindowId, {focused: true});
        });
    }
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
