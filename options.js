/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

let main = browser.extension.getBackgroundPage();

document.addEventListener('DOMContentLoaded', () => {
    let prefs = main.prefs;
    if (prefs.move) {
        let elem = document.getElementById(`move-${prefs.move}`);
        elem.checked = true;
    }
});

document.addEventListener('DOMContentLoaded', () => {
    for (let pref of ['move']) {
        let elems = document.querySelectorAll(`input[name=${pref}]`);
        for (let elem of elems) {
            elem.addEventListener('change', () => {
                console.log(`set pref ${pref} = ${elem.value}`);
                browser.storage.sync.set({[pref]: elem.value});
            });
        }
    }
});
