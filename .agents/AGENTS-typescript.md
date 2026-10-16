# TypeScript Conventions

- Logging: prefer the `anyhow` Node module if it's referenced in the `package.json`, otherwise use the repo's configured logging module and standards.
- Settings: prefer the `setmeup` Node module if it's referenced in the `package.json`, otherwise use the repo's configured setting module (if any) and its standards. Keep hardcoded constants to a minimum, prefer setting values via settings.

## Source Documentation

- Classes, modules, functions, methods and important code blocks should have comments with a very brief explanation of what they do.
- Comments are also allowed in single lines, in case these have a meaningful impact on the output.
- When adding or updating the source code, make sure to also update the comments to reflect the changes. Be as brief as possible.

Sample source with comments:

```
/**
  * Parses arguments into a message, optionally preserving JSON structure.
  * @param args Objects or variables that should be stringified.
  * @param jsonMode Whether to preserve JSON structure in the output.
  * @returns Human readable string taken out of the parsed arguments.
  */
parseMessage = (args: any[], jsonMode = false): string => {
    let strMessage: string = null

    if (isNil(args)) {
        strMessage = ""
    } else {
        if (!isArray(args)) {
            args = [args]
        }
        if (args.length == 1 && isString(args[0])) {
            strMessage = args[0]
        }
    }

    // Stop here if all we have is a single string to be parsed.
    if (strMessage !== null) {
        return strMessage
    }

    return argsParser(args, jsonMode)
}
```

## Tests

- **Unit tests are not as important in this day and age!** If the repository already has some unit tests, you can add further tests but **only** if a specific code path can cause a P0 / P1 event. There's no need to create unit tests covering every single corner case.
- E2E testing is still desired and should be performed, when necessary.

## Migrations

- If the system is flagged as **not** in production, do not create any data migrations. If you are unsure, ask the user first before creating migrations.
- If a schema or data migration is deemed necessary for backward compatibility, check if the system has a migration mechanism in place already. If it has, use it.
- If no migration mechanism is implemented yet, create one first so it can be reused in the future for other migrations.
- Create a rollback plan for migrations to allow reverting the changes during development and testing.
