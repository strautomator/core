# Strautomator: Core

Contains the core business logic of Strautomator. The vast majority of the backend code is implemented here.

## Stack

- TypeScript + Firestore, running with Node.js.

## Install and deploy

- To clear and install everything from scratch: `make clean update`.
- To just update dependencies: `make update`.
- The core is not deployed by itself. It is bundled with the web and functions, which are deployed to production when a new version tag is pushed (`make deploy-git` on the repository root).

## Testing

- The `dry-run.js` script can be used to check if the code is starting up properly.
