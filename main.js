/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Move Tab extension: lets you move a tab from its context menu for when you
 * want to move it so far that dragging it would be a drag. */

'use strict';

const MID_TOP = 'movetab_menu';
const MID_NEW_WINDOW = 'newwindow';

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

browser.menus.onClicked.addListener(function (info, tab) {
    if (info.menuItemId === MID_NEW_WINDOW) {
        browser.windows.create({tabId: tab.id});
    } else if (info.menuItemId === 'right') {
        browser.tabs.move(tab.id, {index: -1});
    } else if (info.menuItemId === 'left') {
        browser.tabs.move(tab.id, {index: 0});
    }
});
