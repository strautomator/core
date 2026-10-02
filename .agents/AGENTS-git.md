# GIT Conventions

- Avoid committing too many unrelated changes at once. Prefer smaller commits with clear change boundaries.
- Do NOT prefix branch names (fix, feat, etc). The branch names should be self descriptive and short.
- PRs can only be opened if the repo is building successfully. If it fails to build, troubleshoot and fix the issue first.
- PRs must always be created as draft, and marked as ready ONLY after a successful review by a bot or human.
- Do NOT add minor technical changes to the PR descriptions like version and lockfile updates. Also no need to describe how the changes were validated or tested.
- Do NOT add attributions to commit messages or PR descriptions (Made with Cursor, Made with Claude, etc...).
- Do NOT expose information local dev URLs, ports, or other dev-only notes in commit messages or PR descriptions.

## Code Review Conventions

- Reviewing unit tests is fine, but avoid pointing minor issues or mistakes with tests unless they can cause a P1 event.
