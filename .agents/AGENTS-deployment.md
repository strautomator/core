# Deployment Conventions

- **Do NOT deploy to production unless specifically asked to!**
- Package dependencies MUST be updated to their latest non-major version before each deployment to production. In this case, all validation and tests must pass with the new updated packages before the deployment can proceed.

## Versioning

- Packages should have their version updated with each PR or deployment. If the version was not changed compared to the latest of the master branch, confirm with the user if you should auto-update before starting a new deployment.
- Do NOT generate a new GIT tag when updating the version, unless the new version is meant to be deployed to production! For example the `npm version` command should be called with the `--no-git-tag-version` parameter by default.
- Only 2 types of versioning patterns should be supported, and you should check the current version to decide which is the right one:

### Semantic Versioning 2.0.0

- Version format: `{MAJOR}.{MINOR}.{PATCH}`
- This format should be used mostly by libraries and tools
- Updates to the major version MUST be manually approved by a reviewer

### Custom Date-based Versioning

- Version format: `{year2digits}.{weekOfYear}{weekDay}.{hour}{minute}`
- This format should be used by apps and services
- Sample shell command to generate the version: `date '+%y.%-V%u.1%H%M'`

For example to update a Node package using NPM:

```
npm version $(date '+%y.%-V%u.1%H%M') --force --allow-same-version --no-git-tag-version
```

## Changelog

If the project does not have a `CHANGELOG.md` file, you can stop here. Otherwise, make sure to add the new version with the relevant changes to the `CHANGELOG.md` file, following these rules:

- **Only the relevant changes should be added!** We don't want to list trivial updates that have no impact on the usage of the library / app / service.
- Keep the same style as the existing changelog contents. A single line per relevant change.
- New features prefixed with `NEW! `
- Breaking changes prefixed with `BREAKING! `
- Deprecated features prefixed with `DEPRECATED! `
- All other changes can be added without a prefix.
