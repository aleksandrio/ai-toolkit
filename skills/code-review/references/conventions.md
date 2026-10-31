# Team engineering conventions

Source of truth for the `code-review` skill. Each section is a review
category; findings cite the category name in brackets.

## Naming

- Variables and functions: descriptive camelCase; no abbreviations except
  `url`, `id`, `api`, `config`.
- Booleans: prefix `is`, `has`, `should`, `can`.
- Functions: verb first (`getUserById`, not `user`).
- Files: named after the main export (`UserService.ts` exports `UserService`).
- Constants: UPPER_SNAKE_CASE.

## Error handling

- Every async operation is wrapped in try/catch or has a `.catch()`.
- Error messages say which operation failed and include the relevant input.
- No empty catch blocks; at minimum log or rethrow.
- HTTP errors carry a status code and an actionable message.
- Resource cleanup goes into `finally` whenever a resource is opened.

## TypeScript

- Zero `any` without an explicit justifying comment.
- Prefer `interface` over `type` for object shapes.
- External data is `unknown`, narrowed with type guards.
- Model states with discriminated unions, not optional fields.
- Generic parameters get descriptive names (`TUser`, not `T`).

## Function design

- Single responsibility; if you need "and" to describe it, split it.
- At most 3 parameters; beyond that use an options object.
- Early returns instead of nested conditions.
- Query functions (`get*`, `find*`, `is*`) must be pure.

## Security

- No secrets in code; environment variables only.
- Validate user input at system boundaries.
- SQL: parameterized queries only.
- API responses never expose stack traces or internal paths.

## Testing

- Test names describe behavior: "returns empty array when no results found".
- Each test owns its setup and teardown.
- Specific assertions: `toEqual(expected)` instead of `toBeTruthy()`.
- Cover edge cases: empty values, null, boundary values and error paths.
