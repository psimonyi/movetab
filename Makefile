# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

.PHONY: default
default: movetab.xpi

files := addMark.js left.svg main.js manifest.json mark.svg movetab-16.svg \
    movetab-32.svg movetab-48.svg photon-window-16.svg \
    photon-window-new-16.svg removeMark.js right.svg unmark.svg _locales

movetab.xpi: $(files)
	zip --filesync --quiet --recurse-paths $@ $^

icon64.png: movetab-32.svg
	inkscape --export-png=$@ --export-width=64 --file=$<
