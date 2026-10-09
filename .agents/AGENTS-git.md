# GIT Conventions

- Group commits by logical change or relevance. Avoid committing too many unrelated changes at once. Prefer smaller commits with clear change boundaries.
- Do NOT prefix branch names (fix, feat, etc). The branch names should be self descriptive and short, all lowercase.

## Pull Request (PR) Conventions

- PRs can only be opened if the repo is building successfully. If it fails to build, troubleshoot and fix the issue first.
- PRs must always be created as draft, and marked as ready ONLY after a successful review by a bot or human.
- The PR description MUST be split into the following sections: `New features`, `Breaking changes`, `Other changes`. If there are no new features or no breaking changes, do not create these sections. If only minor changes are present, use just `Changes` instead of `Other changes`.
- Do NOT expose information local dev URLs, ports, or other dev-only notes in the PR descriptions.
- Do NOT add minor technical changes to the PR descriptions like version and lockfile updates, updated README and renamed files. Also no need to describe how the changes were validated or tested. These kind of information belongs to commit messages instead.
- **Do NOT add attributions to commit messages or PR descriptions**. No need to write made with Cursor or made with Claude or made with whatever.

### Sample Good PR Description

```
## New features

- **MCP Server:** Available to all PRO users, has tools to manage your account and is compatible with all the major MCP clients.
- **iOS app:** Still in beta, the iOS app is now available to all users in the App Store.
- **Dark mode:** Yes you read it, dark mode is on!

## Breaking changes

- **Dropped CoffeeScript support:** The CoffeeScript compiler was removed. Existing CoffeeScript files will be treated as text.

## Other changes

- Customizable menu icons.
- Improved TS compiler performance.
- Improved webhooks performance.
```

### Sample Bad PR Description

```
The following changes are available in this PR.

# New MCP Server

New MCP server implements 7 tools. It's integrated into the web server's API.

# iOS App

- The iOS app is made with React Native and integrates with a dedicated API.
- Refactored the iOS base view.

## Other changes:

- Remove CoffeeScript tests.
- Removed CoffeeScript compiler.
- Development URL changed from abc.com to xyz.com, port 3100.
- Updated README and .gitignore.
- Updated the Express dependency.

Made with Cursor
```

## Code Review Conventions

- **Focus on the code, not on the tests!** Reviewing unit tests is fine sometimes, but avoid pointing minor issues or mistakes with tests unless they can cause a P0 / P1 event.

### Fixing Code Reviews

- **Challenge the reviewer!** You have more access to the system context than the reviewer. A bug might not be actually a bug if the codepath depends on input that can only originate from a specific dependency.
- **Unit tests have minor importance.** Only fix unit tests if they have major logic flaws. There's no need to tweak unit tests just so they cover cases that are never happening in the real world.
