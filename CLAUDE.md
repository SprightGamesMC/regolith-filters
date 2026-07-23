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

## Imports

- Type imports first, then value imports. (`import type` itself is lint enforced.)

## Comments

- JSDoc block above every member, both fields and methods:
    - Single line description.
    - Blank line, then `@param` for each parameter.
    - `@returns` when it returns a value. For primitive types, describe what each value means (e.g.
      `` `true` if empty, `false` otherwise ``). For complex types, name the actual type (e.g. `CacheEntry`).
    - `@throws` when it throws.
- Describe intent, not what the code already says.
- Keep comments short. Drop articles and prepositions where possible, except on functions, which read as full sentences.
- See the `example` filter for live method and field JSDoc. Methods read as full sentences. Field comments drop prepositions.
- Inline comments should be very rare, only when intent is unclear. In most cases intent should never be unclear. Variable names and code
  structure should carry the meaning, so such a comment is not needed.
    - Prefer placing the comment above the line. Put it on the same line only when the line sits among a lot of other code.

```ts
// Bad: the name already says this.
const isEmpty = value.length === 0; // check if value is empty

// Good: explains a non-obvious reason the code cannot express.
retryCount = 3; // Fewer than 3 tries fails on slow connections.
```

## TypeScript

Compiler and lint rules live in `tsconfig.global.json` and `eslint.config.mjs`. Follow the linter. Beyond what it enforces:

- Prefer `unknown` over loose types, then narrow.
- Explicit access modifiers: `private`, `protected`, `readonly`, `static`. Omit `public`. It is the default.
- Prefer guard clauses and early returns over nested branches.

## Formatting

- Enforced by `.prettierrc` and `eslint.config.mjs`. Run the formatter and do not format by hand.

## Commits

- Format: `TYPE | Description`.
- Types: `ADD`, `CHANGE`, `FIX`.
- Example: `ADD | Add skin pack validator`.
