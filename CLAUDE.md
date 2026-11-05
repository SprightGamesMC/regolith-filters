# Regolith Filters Conventions

## Layout

- One folder per filter (`filter_one`, `filter_two`, `filter_three`).
- Write TypeScript in `src`. Build to `dest` with `tsc`.
- Never edit `dest` because it is generated. Rebuild after you change `src`.
- `filter.json` runs `./dest/Main.js`. `Main.ts` is the entry point.
- Rebuild before you commit: `npm run build`.

## Filter Files

The `example` filter is the reference for how a filter looks. Copy it to start a new filter, then rename and adjust. Read its files instead
of rebuilding the layout from text here.

Keep every file concise. After you change the code, update the docs to match. Do not add a line for every feature added in a run. Describe
only what matters to the filter as a whole and remove anything no longer central.

## Tests

- Tests live in `tests`. Test files are named `ClassName.test.ts`.
- Folders: `Unit`, `Integration`, `Helpers` (shared fixtures and utilities), `Types` (types only for tests).
- The `example` filter has all four as the reference. A filter only needs the folders it uses. Always include `Unit`, and add `Integration`,
  `Helpers`, or `Types` when its tests need them.
- Run with `npm test`. Uses `node --import tsx`. No build required.

## Changes

- A change contains only what it is for. Never change a setting default or other value as part of unrelated work. When a value seems wrong,
  report it instead of changing it.

## Files and Classes

- One class per file. Filename equals the class name.
- `export default class`. Use `abstract` for classes with only static members.
- Shared types and interfaces go in `src/Types` (e.g. `src/Types/PackagerTypes.ts`).
- Member order: static fields, static methods, instance fields, constructor, instance methods.

## Naming

- `PascalCase` for classes, files, folders.
- `camelCase` for methods, variables, parameters.
- Static class fields: `UPPER_SNAKE_CASE` when `readonly`, `camelCase` when mutable. A `UPPER_SNAKE_CASE` field must be `readonly`.
- Never declare variables at file scope. Everything belongs inside a class.
- Full words. No abbreviations (`config` not `cfg`, `response` not `res`).
- `src` and `dest` stay lowercase. All other folders use `PascalCase`.

## Functions and Values

- Function names describe what the function does. A verb phrase, not a noun or adjective.
- The name of a fraction, scale, progress, or ratio states what it measures, as in `<thing>Fraction`, not only `fraction`.
- A function never takes a boolean parameter. Put the boolean in an optional `options` parameter, typed as an `<Name>Options` type in
  `src/Types`. State the default in the field's JSDoc and apply it with `??` at the use site.
- Never hardcode data in a function. Put it in a named field. Simple string literals are the one exception.

## Imports

- Type imports first, then value imports. (`import type` itself is lint enforced.)

## Control Statements

- Use early returns and guard clauses at the top of a function, then write the main logic unindented. A guard that applies to every path
  goes in one early return at the top.
- Use at most three levels of nested `if`. Extract a function only when the part has a clear purpose of its own or removes real duplication,
  never only to remove an indent level. Write short checks, single use predicates, and small setters inline.
- Use `if` with `else` only when exactly one branch must run, no branch exits, and code continues after the branches. Never use `else` after
  `return`, `break`, `continue`, or `throw`.
- Use separate `if` statements when each branch exits, or when more than one branch can run.
- Use `for...in` only to iterate over the keys of an object or enum. Use `do...while` only when the body must run at least once.

## Writing

These rules apply to all text: comments, JSDoc, error messages, Markdown files, and commit messages.

- Use plain, literal language. A reader with weak English must be able to read every sentence word for word.
- Use simple grammar. Keep sentences short, with one idea each. Put the subject before the verb, and never put a clause inside another
  clause.
- Never use idioms or figurative language, in prose or in code names. Write `contains`, not `holds`. Write `is part of`, not `belongs to`.
  Write `examine`, not `look at`. Real product and format names stay as they are.
- Use a colon only to introduce a list of items. Never use one as a label or to lead into a clause. Reword those into full sentences.
- Never put a fact and the action or result it leads to in one sentence, whatever word joins them, such as "so" or "which means". Write the
  action or result as its own sentence first. Add the fact as a separate sentence only when the reader needs the reason.
- Add an example only when the text is unclear without it. Keep its names generic, with placeholders such as `Example` or `<Name>`.

## Comments

- Put a JSDoc block above every member, both fields and methods, and above every type, interface, and class. A JSDoc block contains these
  parts, in order.
    - Single line description.
    - The `@param` lines. One `@param name - Description.` per parameter.
    - `@returns` when it returns a value. For primitive types, describe what each value means (e.g.
      `` `true` if empty, `false` otherwise ``). For complex types, name the actual type (e.g. `CacheEntry`).
    - `@throws` when it throws.
    - A blank line separates the parts, never the lines inside a part. Every line ends with a period.
- Every comment except an inline `//` comment is a JSDoc block.
- Make the code show its intent with clear names and structure before you add a comment. A comment states only what the code cannot show,
  such as a reason. It never repeats what the code does.
- Keep comments short. Method comments are full sentences. Field, type, and inline comments leave out articles and prepositions where
  possible.
- See the `example` filter for live method and field JSDoc.
- Inline comments are rare. Put one above the line, or on the same line only when there is a lot of other code around it. It never ends with
  a period.

```ts
// Bad. The variable name already states this
// check if value is empty
const isEmpty = value.length === 0;

// Good. It gives a reason that the code alone does not show
// Fewer than 3 tries fails on slow connections
retryCount = 3;
```

## TypeScript

Compiler and lint rules live in `tsconfig.global.json` and `eslint.config.mjs`. Follow the linter. Beyond what it enforces:

- Prefer `unknown` over loose types, then narrow.
- Explicit access modifiers: `private`, `protected`, `readonly`, `static`. Omit `public`. It is the default.

## Formatting

- Enforced by `.prettierrc` and `eslint.config.mjs`. Run the formatter and do not format by hand.

## Commits

- Format: `<TYPE> | <TASK> | <Summary>`, as in `ADD | EXAMPLE-123 | Add <Feature>`. Leave out `<TASK> | ` when the commit has no
  associated task. `<Summary>` is in the imperative mood. `<TYPE>` is one of these values.
    - `ADD` is for a new filter or feature.
    - `CHANGE` is for different behavior or output that users notice.
    - `FIX` is for something broken that now works.
    - `REFACTOR` is for a code change that users do not notice.
    - `CHORE` is for a change outside filter code, such as docs, CI, or dependencies.
- A commit that completes several tasks lists every task ID, as in `ADD | EXAMPLE-123 | EXAMPLE-124 | Add <Feature>`.
- Avoid combining tasks of different types in one commit. When a commit must combine them, list each type once, as in
  `ADD | FIX | EXAMPLE-123 | EXAMPLE-124 | Add <Feature> and fix <Bug>`.
