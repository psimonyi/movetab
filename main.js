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
const MARKER_SEPARATOR_ID = 'movetab_landmark_separator';

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

    for (let end of ['left', 'right']) {
        let item = document.createElementNS(NS_XUL, 'menuitem');
        item.setAttribute('label', text(end + '.label'));
        item.setAttribute('accesskey', text(end + '.accesskey'));
        item.addEventListener('command', moveTab.bind(null, end));
        popup.appendChild(item);
    }

    let separator = document.createElementNS(NS_XUL, 'menuseparator');
    separator.setAttribute('id', MARKER_SEPARATOR_ID);
    popup.appendChild(separator);

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
    let window = document.defaultView;
    let popup = document.getElementById(POPUP_ID);
    let separator = document.getElementById(MARKER_SEPARATOR_ID);

    while (separator.nextElementSibling != null) {
        popup.removeChild(separator.nextElementSibling);
    }

    let thisIndex = window.TabContextMenu.contextTab._tPos;
    separator.hidden = true;

    for (let tab of window.gBrowser.tabs) {
        if (isMarkerTab(tab)) {
            separator.hidden = false;
            let item = document.createElementNS(NS_XUL, 'menuitem');
            let index = tab._tPos - (thisIndex < tab._tPos ? 1 : 0);
            item.setAttribute('label', markerLabel(tab.label));
            item.addEventListener('command', moveTab.bind(null, index));
            popup.appendChild(item);
        }
    }
}

function isMarkerTab(tab) {
    /* Marker tabs help us find places near the middle of the tab list.  This
     * could be a lot smarter, but for now it's just all about:* tabs. */
    return tab.linkedBrowser.currentURI.scheme == 'about';
}

function markerLabel(s) {
    return text('before.label').replace('%s', _=>s);
}

function moveTab(index, event) {
    let window = event.target.ownerDocument.defaultView;
    let tab = window.TabContextMenu.contextTab;
    let gBrowser = window.gBrowser;
    if (index == 'left') index = 0;
    if (index == 'right') index = gBrowser.tabs.length - 1;
    gBrowser.moveTabTo(tab, index);
}
