TSC:= ./node_modules/.bin/tsc

# Clean compiled resources and dependencies
clean:
	rm -rf ./lib
	rm -rf ./node_modules
	rm -f package-lock.json

# Compile and build resources
build:
	$(TSC)

# Update dependencies and set new version
update:
	-rm -rf ./node_modules/strautomator-core
	-ncu -u -x chalk,strautomator-core
	-ncu -u --target minor -x strautomator-core
	npm version $(shell date '+%y.%-V%u.1%H%M') --force --allow-same-version --no-git-tag-version
	npm install
	$(TSC)

# Test the functions locally
run: build
	-cp -r ../core/settings*.json ./node_modules/strautomator-core/
	-cp -r ../core/lib/. ./node_modules/strautomator-core/lib/
	node index.js

# Deploy web and functions to production (by creating a new tag)
deploy-git:
	$(MAKE) -C .. deploy-git

.PHONY: build
