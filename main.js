/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Move Tab extension: lets you move a tab from its context menu for when you
 * want to move it so far that dragging it would be a drag. */

'use strict';

const MENU_ID = 'movetab_menu';

browser.menus.create({
    id: MENU_ID,
    title: browser.i18n.getMessage("menu.label"),
    contexts: ['tab'],
});

for (let end of ['left', 'right']) {
    browser.menus.create({
        id: end,
        /*icons: {
            "16": `${end}.png`,
            "32": `${end}32.png`,
        },*/
        parentId: MENU_ID,
        title: browser.i18n.getMessage(`${end}.label`),
    });
}

browser.menus.create({
    parentId: MENU_ID,
    type: "separator",
});

browser.menus.onClicked.addListener(function (info, tab) {
    if (info.menuItemId === 'right') {
        browser.tabs.move(tab.id, {index: -1});
    } else if (info.menuItemId === 'left') {
        browser.tabs.move(tab.id, {index: 0});
    }
});
