# Deployment Conventions

- Package dependencies MUST be updated to their latest non-major version before each deployment to production. In this case, all validation and tests must pass with the new updated packages before the deployment can proceed.

## Versioning

- Packages should have their version updated with each PR or deployment, with the target format {year2digits}.{weekOfYear}{weekDay}.{hour}{minute}.
- Sample shell command to generate the version: `date '+%y.%-V%u.1%H%M'`.
- Do NOT generate a new GIT tag when updating the version, unless specifically instructed to do it.

For example to update a Node package:

```
npm version $(date '+%y.%-V%u.1%H%M') --force --allow-same-version --no-git-tag-version
```
