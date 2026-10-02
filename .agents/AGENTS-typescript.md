# TypeScript Conventions

- Classes, modules, functions, methods and important code blocks should have comments with a very brief explanation of what they do.
- Comments are also allowed in single lines, in case these have a meaningful impact on the output.
- Logging: prefer the `anyhow` Node module if it's referenced in the package.json, otherwise use the repo's configured logging module and standards.
- Settings: prefer the `setmeup` Node module if it's referenced in the package.json, otherwise use the repo's configured setting module (if any) and standards. Keep hardcoded constants to a minimum, prefer setting values via settings.

## Migrations
