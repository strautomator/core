# Strautomator

Monorepo for [Strautomator.com](https://strautomator.com):

- [core](core): business logic, shared by the web and functions as a local npm dependency (`file:../core`).
- [web](web): website and API (Nuxt), deployed to Google Cloud Run.
- [functions](functions): scheduled tasks, deployed to Google Cloud Functions.

## Builds and deployments

Everything runs on Google Cloud Build, using the [cloudbuild.yaml](cloudbuild.yaml) on the repository root:

| Event                    | Trigger               | Result                                                                  |
| ------------------------ | --------------------- | ----------------------------------------------------------------------- |
| Pull request to `master` | `strautomator-pr`     | Build only (web image + functions), nothing is pushed or deployed.      |
| Push / merge to `master` | `strautomator-build`  | Build only (web image + functions), nothing is pushed or deployed.      |
| New `v*` tag             | `strautomator-deploy` | Build, push the web image (`:vX` and `:latest`), deploy web + functions. |

To release a new version to production, from an up-to-date `master` branch:

```sh
make deploy-git
```

This sets the new date-based version on the web and functions, commits it, creates a `vYY.WWD.1HHMM` tag and pushes it to GitHub.

Secrets are never part of this repository. The web and functions download the encrypted `settings.secret.json` from a GCS bucket at startup. The `strautomator-deploy` trigger sets the `_DEPLOY=true` and `_SETTINGS_BUCKET` substitutions, and the GCP project ID comes from Cloud Build itself, so these values are not stored in the repository.
