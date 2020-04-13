TYPEDOC:= ./node_modules/.bin/typedoc
TSC:= ./node_modules/.bin/tsc

build:
	$(TSC)
	rm -rf ./node_modules/anyhow
	rm -rf ./node_modules/setmeup

clean:
	rm -rf ./lib
	rm -rf ./node_modules
	rm -f package-lock.json

docs:
	rm -rf ./docs/assets
	rm -rf ./docs/classes
	rm -rf ./docs/interfaces
	rm -rf ./docs/modules
	$(TYPEDOC) --disableOutputCheck

update:
	-ncu -u
	npm version $(shell date '+%y.%-V%u.%H%M') --force --allow-same-version --no-git-tag-version
	npm install
	$(TSC)

.PHONY: docs
