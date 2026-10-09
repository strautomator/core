# Deployment Conventions

- Package dependencies MUST be updated to their latest non-major version before each deployment to production. In this case, all validation and tests must pass with the new updated packages before the deployment can proceed.

## Versioning

- Do NOT generate a new GIT tag when updating the version, unless specifically instructed to do it!
- Packages should have their version updated with each PR or deployment. If the version was not changed compared to the latest of the master branch, confirm with the user if you should auto-update before starting a new deployment.
- Only 2 types of versioning patterns should be supported, and you should check the current version to decide which is the right one:

### Semantic Versioning 2.0.0

- Version format: `{MAJOR}.{MINOR}.{PATCH}`
- This format should be used mostly by libraries and tools
- Updates to the major version MUST be manually approved by a reviewer

### Custom Date-based Versioning

- Version format: `{year2digits}.{weekOfYear}{weekDay}.{hour}{minute}`
- This format should be used by applications and services
- Sample shell command to generate the version: `date '+%y.%-V%u.1%H%M'`

For example to update a Node package using NPM:

```
npm version $(date '+%y.%-V%u.1%H%M') --force --allow-same-version --no-git-tag-version
```
