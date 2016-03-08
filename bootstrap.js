/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* bootstrap.js: This is all boilerplate servies; see main.js. */

'use strict';

let { interfaces: Ci, utils: Cu, classes: Cc } = Components;
Cu.import('resource:///modules/CustomizableUI.jsm');
Cu.import('resource://gre/modules/Services.jsm');

let _undoers = [];

function startup(data, reason) {
    chromeStylesheet('chrome://movetab/skin/style.css');
    let text = l10n('chrome://movetab/locale/movetab.properties');
    let scope = { text: text };

    try {
        Services.scriptloader.loadSubScript(
                'chrome://movetab/content/main.js', scope);
    } catch (e) {
        // Firefox EM makes exceptions in bootstrap code too quiet.
        Cu.reportError(e);
        throw e;
    }
}

function shutdown(data, reason) {
    if (reason == APP_SHUTDOWN) return;

    // Run each undo function.
    _undoers.forEach(function (fn) {
        try {
            fn();
        } catch (ex) {
            Cu.reportError(ex);
        }
    });

    // From the MDN article How_to_convert_an_overlay_extension_to_restartless
    // where there's not much explanation.  This does at least flushBundles()
    // for nsIStringBundleService (see bug 719376).
    // HACK WARNING: The Addon Manager does not properly clear all addon
    // related caches on update; in order to fully update images and locales,
    // their caches need clearing here.
    Services.obs.notifyObservers(null, 'chrome-flush-caches', null);
}

function install(data, reason) {}
function uninstall(data, reason) {}

function toUndo(fn) {
    _undoers.push(fn);
}
function dontUndo(fn) {
    _undoers.splice(_undoers.indexOf(fn), 1);
}

/* Adds a chrome stylesheet.  All regular browser windows get it.
 * Undo functions are registered, too.
 */
function chromeStylesheet(url) {
    let uri = Services.io.newURI(url, null, null);

    function add(win) {
        let domWindowUtils = win.QueryInterface(Ci.nsIInterfaceRequestor)
                                .getInterface(Ci.nsIDOMWindowUtils);
        domWindowUtils.loadSheet(uri, domWindowUtils.AUTHOR_SHEET);
    }
    function remove(win) {
        let domWindowUtils = win.QueryInterface(Ci.nsIInterfaceRequestor)
                                .getInterface(Ci.nsIDOMWindowUtils);
        domWindowUtils.removeSheet(uri, domWindowUtils.AUTHOR_SHEET);
    }

    eachWindow(add, remove, false);
}

/* Returns a function that gets localized messages from the URL to a properties
 * file (presumably a chrome: locale URL).  Arguments to the returned function:
 * the key to get, and any strings to fill in the placeholders.
 * Undo is (I think) covered by chrome-flush-caches in shutdown().
 */
function l10n(url) {
    let sbs = Cc['@mozilla.org/intl/stringbundle;1']
              .getService(Ci.nsIStringBundleService);
    let bundle = sbs.createBundle(url);

    return function getMessage(key, ...args) {
        if (args.length == 0) return bundle.GetStringFromName(key);
        return bundle.formatStringFromName(key, args, args.length);
    };
}

/* Runs fn in each existing browser window and each browser window opened from
 * now on (after the load event fires, so you can use the DOM).  Registers
 * fnUndo to be run for cleanup: when windows are closed and with toUndo.
 *
 * Both fn and fnUndo are passed the window object.
 *
 * If fn only changes the window's DOM, you don't need to clean up when the
 * window closes.  When onClose is false, fnUndo will not run for windows that
 * are closing (so only when the extension is disabled/uninstalled).
 */
function eachWindow(fn, fnUndo, undoOnClose=false) {
    if (typeof fnUndo != 'function') {
        console.warn("fnUndo is not a function:", fnUndo);
        fnUndo = noop;
    }

    _inEachExistingWindow(fn);
    toUndo(_=> _inEachExistingWindow(fnUndo));

    var windowListener = {
        onOpenWindow: onOpenWindow,
        onCloseWindow: undoOnClose ? onCloseWindow : noop,
        onWindowTitleChange: noop,
    }

    Services.wm.addListener(windowListener);
    toUndo(_=> Services.wm.removeListener(windowListener));

    function noop() {}

    function onOpenWindow(aWindow) {
        let domWindow = aWindow.QueryInterface(Ci.nsIInterfaceRequestor)
                               .getInterface(Ci.nsIDOMWindow);

        domWindow.addEventListener('load', function loadListener() {
            domWindow.removeEventListener('load', loadListener);
            if (isBrowserWindow(domWindow)) {
                fn(domWindow);
            }
        });
    }

    function onCloseWindow(aWindow) {
        let domWindow = aWindow.QueryInterface(Ci.nsIInterfaceRequestor)
                               .getInterface(Ci.nsIDOMWindow);
        if (isBrowserWindow(domWindow)) {
            fnUndo(domWindow);
        }
    }

    function isBrowserWindow(win) {
        return win.document.documentElement
            .getAttribute('windowtype') == 'navigator:browser'
    }

    function _inEachExistingWindow(fn) {
        let enumerator = Services.wm.getEnumerator('navigator:browser');
        while (enumerator.hasMoreElements()) {
            fn(enumerator.getNext());
        }
    }
}

