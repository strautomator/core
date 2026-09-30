# GIT Conventions

- Avoid committing too many unrelated changes at once. Prefer smaller commits with clear change boundaries.
- Do NOT prefix branch names (fix, feat, etc). The branch names should be self descriptive and short.
- PRs can only be opened if the repo is building successfully. If it fails to build, troubleshoot and fix the issue first.
- PRs must always be created as draft, and marked as ready ONLY after a successful review by a bot or human.
- GIT tags are used for deployment, do NOT create GIT tags unless a new deployment is planned.
- Development environments: do NOT expose local URLs, ports, or other dev-only notes in commit messages or PR descriptions.
