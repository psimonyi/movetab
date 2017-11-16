/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Move Tab extension: lets you move a tab from its context menu for when you
 * want to move it so far that dragging it would be a drag. */

'use strict';

const MID_TOP = 'movetab_menu';
const MID_NEW_WINDOW = 'newwindow';
const MID_PREFIX_WINDOW = 'window:';

// Erase and completely rebuild the context menu.
async function makeMenu() {
    browser.menus.removeAll();

    browser.menus.create({
        id: MID_TOP,
        title: browser.i18n.getMessage("menu.label"),
        contexts: ['tab'],
    });

    for (let end of ['left', 'right']) {
        browser.menus.create({
            id: end,
            parentId: MID_TOP,
            title: browser.i18n.getMessage(`${end}.label`),
            icons: {
                "16": `${end}.svg`,
            },
        });
    }

    browser.menus.create({
        id: MID_NEW_WINDOW,
        parentId: MID_TOP,
        title: browser.i18n.getMessage('newwindow.label'),
        icons: {
            "16": 'photon-window-new-16.svg',
        },
    });

    browser.menus.create({
        parentId: MID_TOP,
        type: "separator",
    });

    const windows = await browser.windows.getAll({windowTypes: ['normal']});
    const currentWin = windows.find(win => win.focused);
    if (!currentWin) return; // Eh, can't right-click until there's a window.
    for (let win of windows) {
        if (win.focused) continue;
        if (win.incognito !== currentWin.incognito) continue;

        browser.menus.create({
            id: MID_PREFIX_WINDOW + JSON.stringify(win.id),
            parentId: MID_TOP,
            title: browser.i18n.getMessage('to.window.pattern', win.title),
            icons: {
                "16": 'photon-window-16.svg',
            },
        });
    }
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

browser.menus.onClicked.addListener(function (info, tab) {
    if (info.menuItemId === MID_NEW_WINDOW) {
        browser.windows.create({tabId: tab.id});
    } else if (info.menuItemId === 'right') {
        browser.tabs.move(tab.id, {index: -1});
    } else if (info.menuItemId === 'left') {
        browser.tabs.move(tab.id, {index: 0});
    } else if (info.menuItemId.startsWith(MID_PREFIX_WINDOW)) {
        const windowId = JSON.parse(
            info.menuItemId.slice(MID_PREFIX_WINDOW.length));
        browser.tabs.move(tab.id, {windowId: windowId, index: -1});
    }
});
