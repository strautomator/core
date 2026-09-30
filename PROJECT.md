# Strautomator: Core

Contains the core business logic of Strautomator. The vast majority of the backend code is implemented here.

## Stack

- TypeScript + Firestore, running with Node.js.

## Install and deploy

- To clear and install everything from scratch: `make clean update`.
- To just update dependencies: `make update`.
- Deployment means pushing to master on GitHub.

## Testing

- The `dry-run.js` script can be used to check if the code is starting up properly.