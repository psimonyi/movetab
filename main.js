/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Move Tab extension: lets you move a tab from its context menu for when you
 * want to move it so far that dragging it would be a drag. */
/* main.js: This file is run only from startup() in bootstrap.js, which
 * provides a text() function to look up translatable strings. */

'use strict';

const NS_XUL = 'http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul';
const MENU_ID = 'movetab_menu';
const POPUP_ID = 'movetab_popup';

eachWindow(addMoveMenu, removeMoveMenu);

function addMoveMenu(aWin) {
    let document = aWin.document;

    let menu = document.createElementNS(NS_XUL, 'menu');
    menu.setAttribute('id', MENU_ID);
    menu.setAttribute('label', text('menu.label'));
    menu.setAttribute('accesskey', text('menu.accesskey'));

    let popup = document.createElementNS(NS_XUL, 'menupopup');
    popup.setAttribute('id', POPUP_ID);
    popup.addEventListener('popupshowing', updateSubmenu);
    menu.appendChild(popup);

    let tabContextMenu = document.getElementById('tabContextMenu');
    let tabMoveItem = document.getElementById('context_openTabInWindow');
    tabContextMenu.insertBefore(menu, tabMoveItem);
}

function removeMoveMenu(aWin) {
    let document = aWin.document;
    let menu = document.getElementById(MENU_ID);
    menu.parentNode.removeChild(menu);
}

function updateSubmenu(event) {
    if (event.target != event.currentTarget) return;
    let document = event.target.ownerDocument;
    let popup = document.getElementById(POPUP_ID);

    while (popup.firstElementChild != null) {
        popup.removeChild(popup.firstElementChild);
    }

    let left = document.createElementNS(NS_XUL, 'menuitem');
    left.setAttribute('label', text('left.label'));
    left.setAttribute('accesskey', text('left.accesskey'));
    left.addEventListener('command', moveTabLeft);
    popup.appendChild(left);

    let right = document.createElementNS(NS_XUL, 'menuitem');
    right.setAttribute('label', text('right.label'));
    right.setAttribute('accesskey', text('right.accesskey'));
    right.addEventListener('command', moveTabRight);
    popup.appendChild(right);
}

function moveTabLeft(event) {
    let window = event.target.ownerDocument.defaultView;
    let tab = window.TabContextMenu.contextTab;
    let gBrowser = window.gBrowser;
    gBrowser.moveTabTo(tab, 0);
}

function moveTabRight(event) {
    let window = event.target.ownerDocument.defaultView;
    let tab = window.TabContextMenu.contextTab;
    let gBrowser = window.gBrowser;
    let index = gBrowser.tabs.length - 1;
    gBrowser.moveTabTo(tab, index);
}
