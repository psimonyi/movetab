# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

name := movetab
locale := locale/*/$(name).properties
content := main.js style.css $(locale)
icons := icon48.png icon64.png

$(name).xpi: install.rdf chrome.manifest bootstrap.js $(content) $(icons)
	-rm -f -- $@
	zip -0 --quiet $@ $^

icon%.png: $(name).svg
	inkscape --export-png=$@ --export-width=$* --file=$<


.PHONY: clean
clean:
	-rm -f -- $(name).xpi $(icons)

# This is for Extension Auto-Installer.
.PHONY: test
test: $(name).xpi
	curl --http1.0 --max-time 1 --upload-file $< http://localhost:8888/
