---
name: code-review
description: Review code changes against team engineering conventions, testing standards and security expectations. Use when asked to "review code", "check this PR", "review my changes" or "code review", or when a diff, branch or pull request needs feedback before merge.
---

# Code review

Review a diff, a branch or a pull request against the team conventions in
`references/conventions.md`. The conventions are the standard; do not invent
new rules, and do not restate the whole document in the output.

## Workflow

1. Get the change. If the user did not paste a diff, run `git diff` (staged,
   `main...HEAD` or the range the user names) and read the touched files for
   context; do not review files that the change does not touch.
2. Read `references/conventions.md` and check the change category by category:
   Naming, Error handling, TypeScript, Function design, Security, Testing.
3. For every issue decide the severity:
   - **Critical**: security problem, data loss, broken behavior, swallowed
     error, missing error handling on an async path, secret in code.
   - **Warning**: convention violated in a way that hurts maintainability
     (`any` without justification, function with 4+ parameters, impure query
     function, vague test assertion, missing edge-case tests).
   - **Suggestion**: naming, readability, small simplifications, optional
     improvements.
4. Prefer the smallest concrete fix. Quote the offending line when it helps,
   and suggest the replacement in one or two lines.
5. Stay within the diff. Pre-existing problems in untouched code go into a
   single short "Out of scope" note, not into the findings.

## Output format

Use exactly this structure, omitting empty severity sections:

```
## Critical
- `path/to/file.ts:42` - [Category] what is wrong and how to fix it

## Warning
- `path/to/file.ts:17` - [Category] ...

## Suggestion
- `path/to/file.ts:5` - [Category] ...

## Verdict
APPROVE | REQUEST CHANGES | NEEDS DISCUSSION

One or two sentences explaining the verdict.
```

- Every finding gets a `file:line` reference when the line is known; use
  `file` alone only when the issue concerns the whole file.
- Verdict rules: any Critical finding means `REQUEST CHANGES`; only
  Suggestions (or nothing) means `APPROVE`; Warnings without Criticals mean
  `REQUEST CHANGES` when they touch behavior or tests, otherwise `APPROVE`
  with the warnings listed; use `NEEDS DISCUSSION` when the fix depends on a
  design decision the reviewer cannot make alone (API shape, data model,
  trade-off between conventions and the repository's own rules).
- If the change is clean, say so briefly and return `APPROVE`; do not pad the
  review with filler findings.

## Precedence

When a convention conflicts with the consuming repository's own `CLAUDE.md`
or an explicit project rule, the repository wins. Mention the conflict once
in the verdict explanation.
