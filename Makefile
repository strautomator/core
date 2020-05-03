TYPEDOC:= ./node_modules/.bin/typedoc
TSC:= ./node_modules/.bin/tsc

# Clean compiled resources and dependencies
clean:
	rm -rf ./lib
	rm -rf ./node_modules
	rm -f package-lock.json

# Generate TypeScript docs
docs:
	rm -rf ./docs/assets
	rm -rf ./docs/classes
	rm -rf ./docs/interfaces
	rm -rf ./docs/modules
	$(TYPEDOC) --disableOutputCheck

# Compile TypeScript to JS
build:
	$(TSC)

# Update dependencies and set new version
update:
	-ncu -u
	npm version $(shell date '+%y.%-V%u.%-d%H%M') --force --allow-same-version --no-git-tag-version
	npm install
	$(TSC)

# Dry run (check if startup() is completing).
dryrun:
	$(TSC)
	node dryrun.js

.PHONY: docs
