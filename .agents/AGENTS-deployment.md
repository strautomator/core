# Deployment Conventions

- For local development, apps that need a web server or service must run in a random port between 3000 and 3100.
- Package dependencies MUST be updated to their latest non-major version before each deployment to production. In this case, all validation and tests must pass with the new updated packages before the deployment can proceed.

# Versioning

Packages should have their version updated with each PR or deployment, with the target format {year2digits}.{weekOfYear}{weekDay}.{hour}{minute}. This can be accomplished by using the command `date '+%y.%-V%u.1%H%M'`. Git tags must NOT be generated with each new version.

For example to update a Node package:

```
npm version $(date '+%y.%-V%u.1%H%M') --force --allow-same-version --no-git-tag-version
```
