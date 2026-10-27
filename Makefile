VERSION:= $(shell date '+%y.%-V%u.1%H%M')

# Build the web Docker image locally (from the repo root, as it depends on the local core).
docker-build:
	docker buildx build --platform linux/arm64 -f web/Dockerfile -t strautomator/web .

# Release to production: set the new version, commit, create a vX tag and push it to GitHub.
# The tag triggers the Cloud Build pipeline which builds and deploys the web and functions.
deploy-git:
	@test "$$(git rev-parse --abbrev-ref HEAD)" = "master" || (echo "Releases must be created from the master branch." && exit 1)
	@git diff --quiet && git diff --cached --quiet || (echo "Commit or stash your changes before releasing." && exit 1)
	git pull --ff-only
	cd web && npm version $(VERSION) --force --allow-same-version --no-git-tag-version
	cd functions && npm version $(VERSION) --force --allow-same-version --no-git-tag-version
	git commit -m "Release v$(VERSION)" -- web/package.json web/package-lock.json functions/package.json functions/package-lock.json
	git tag -a "v$(VERSION)" -m "Release v$(VERSION)"
	git push
	git push origin "v$(VERSION)"

.PHONY: docker-build deploy-git
