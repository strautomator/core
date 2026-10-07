# TypeScript Conventions

- Logging: prefer the `anyhow` Node module if it's referenced in the package.json, otherwise use the repo's configured logging module and standards.
- Settings: prefer the `setmeup` Node module if it's referenced in the package.json, otherwise use the repo's configured setting module (if any) and standards. Keep hardcoded constants to a minimum, prefer setting values via settings.

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

## Migrations

- If a new feature or a code change requires data to be migrated, do NOT add a migration procedure in the source code. Instead, check if the repository already implements any migration mechanism, and if it does, create the new migration file there. If not, ask the user how to proceed BEFORE implementing the changes.
