# Strautomator: Core

Contains the core business logic of Strautomator. Most of the backend code should be implemented here.

## Stack

- TypeScript + Firestore, running with Node.js.

## Code Style

- Keep the same style and patterns used in the existing source code, paying attention to comments, line breaks and code blocks.

## Dependencies

- To clear and install everything from scratch: `make clean update`.
- To just update dependencies: `make update`

## Testing instructions

- The `dry-run.js` script can be used to check if the code is starting up properly.
