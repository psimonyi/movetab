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

// Marked tab IDs (marked as "this is a teleport target").
let marks = new Set();

// Erase and completely rebuild the context menu.
async function makeMenu() {
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

    browser.menus.create({
        id: MID_MARK,
        parentId: MID_TOP,
        title: browser.i18n.getMessage('mark@label'),
        icons: {
            "16": 'mark.svg',
        },
    });
}

makeMenu();

// When you open the tab context menu, our movement options depend on which
// window the tab is in.  The WebExtensions API won't let us build up the
// appropriate options at menu-showing time, so we have to rebuild the menu
// every time the window focus changes.
browser.windows.onFocusChanged.addListener(function (windowId) {
    if (windowId === browser.windows.WINDOW_ID_NONE) return;
    makeMenu();
});

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

// Keep the mark visible when the tab's title changes (e.g. because the user
// navigated or the page updated it itself).  Also keep the menu up to date.
browser.tabs.onUpdated.addListener(function (tabId, updates, tab) {
    if (marks.has(tabId) && 'title' in updates) {
        browser.tabs.executeScript(tab.id,
            {file: 'addMark.js', runAt: 'document_start'});
        browser.menus.update(MID_PREFIX_TAB + JSON.stringify(tab.id),
            {title: browser.i18n.getMessage('after_tab@pattern', tab.title)});
    }
});

// When the context menu is shown, update the MARK item from generic 'toggle'
// to whether it's set or unset for the context tab.  Revert to the generic
// description when the menu closes so that it won't show the wrong label if
// the next onShown takes too long because of async behaviour.
// Supported since Firefox 60.
if (browser.menus.onShown && browser.menus.onHidden) {
    browser.menus.onShown.addListener(function (info, tab) {
        let title, icons;
        if (marks.has(tab.id)) {
            title = browser.i18n.getMessage('mark_unset@label');
            icons = {'16': 'unmark.svg'};
        } else {
            title = browser.i18n.getMessage('mark_set@label');
            icons = {'16': 'mark.svg'};
        }

        // Bug 1414566 - updating icon not supported.
        browser.menus.update(MID_MARK, {title}).then(() => {
            browser.menus.refresh();
        });
    });

    browser.menus.onHidden.addListener(function () {
        // The menu was hidden.  Revert the MARK item to a generic description.
        browser.menus.update(MID_MARK, {
            title: browser.i18n.getMessage('mark@label'),
            // Bug 1414566 - updating icon not supported.
            //icons: {'16': 'mark.svg'},
        });
    });
}

browser.menus.onClicked.addListener(function (info, tab) {
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
        browser.tabs.move(tab.id, {index: -1});
    } else if (info.menuItemId === 'left') {
        browser.tabs.move(tab.id, {index: 0});
    } else if (info.menuItemId.startsWith(MID_PREFIX_WINDOW)) {
        const windowId = JSON.parse(
            info.menuItemId.slice(MID_PREFIX_WINDOW.length));
        moveTab(tab, windowId, -1);
    } else if (info.menuItemId.startsWith(MID_PREFIX_TAB)) {
        const destTabId = JSON.parse(
            info.menuItemId.slice(MID_PREFIX_TAB.length));
        browser.tabs.get(destTabId).then(destTab => {
            let offset = 1;
            if (destTab.windowId === tab.windowId
                && tab.index < destTab.index) {
                offset = 0;
            }
            moveTab(tab, destTab.windowId, destTab.index + offset);
        });
    }
});

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
