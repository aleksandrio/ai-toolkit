# @aleksandrio/ai-toolkit

Team AI artifacts for Claude Code (skills, rules and an installer), distributed
as an npm package through GitHub Packages. Source of truth lives in this
repository; consumer repositories install a pinned version and never edit the
installed files by hand.

Contents of the package:

| Path | Installed as | Purpose |
|---|---|---|
| `skills/code-review/` | `.claude/skills/code-review/` | `/code-review` skill: review against the team conventions in `references/conventions.md` |
| `rules/CLAUDE.md` | block inside the consumer's `CLAUDE.md` | team working rules, between sentinel markers |
| `install.js` | `npx ai-toolkit` (also `postinstall`) | copies the files above and writes a manifest |
| `uninstall.js` | `npx ai-toolkit-uninstall` | removes exactly what the manifest lists |

## Install in a consumer repository

1. Add a committed `.npmrc` with the scope mapping only (never an `_authToken`):

   ```
   @aleksandrio:registry=https://npm.pkg.github.com
   ```

2. Install the package:

   ```bash
   npm i -D @aleksandrio/ai-toolkit
   ```

3. Run the installer explicitly if `postinstall` did not run. npm 12 does not
   run lifecycle scripts of dependencies, and some setups install with
   `--ignore-scripts`, so treat the automatic install as best effort:

   ```bash
   npx ai-toolkit
   ```

   With npm 12 you can instead approve the script once
   (`npm install-scripts approve @aleksandrio/ai-toolkit`, which records an
   `allowScripts` entry in your `package.json`); from then on `npm install`
   runs the installer automatically.

The package is public, so reading it needs no token. The installer:

- copies `skills/code-review/` to `.claude/skills/code-review/` (removing only
  that directory first, never the whole `.claude/skills/`);
- appends the team rules to `CLAUDE.md` between
  `<!-- BEGIN @aleksandrio/ai-toolkit -->` and `<!-- END @aleksandrio/ai-toolkit -->`
  (creating the file when missing);
- writes `.claude/.ai-toolkit-manifest.json` with the package name, version,
  install time, mode and the list of installed entries.

Commit `.npmrc`, `package.json`, `package-lock.json`, `CLAUDE.md`,
`.claude/skills/code-review/` and `.claude/.ai-toolkit-manifest.json`.

### Guarantees

- Idempotent: running the installer again (or updating the package) replaces
  the content between the markers and the managed skill directory; it never
  appends a second block.
- Non-destructive: an unpaired marker in `CLAUDE.md`, or a
  `.claude/skills/code-review` directory that is not listed in the manifest,
  stops the installer with a warning and no changes.
- Scoped: only paths listed in the manifest and the text between the markers
  are ever touched. Other sentinel blocks (for example from another package)
  and your own rules stay as they are.
- `npm install` never fails because of this package: installer errors are
  printed as warnings during `postinstall`; the `ai-toolkit` bin exits with
  code 1 so you notice when running it by hand.

## Modes

| Mode | How | What it does |
|---|---|---|
| copy (default) | `npx ai-toolkit` | copies the skill into `.claude/skills/code-review/` |
| symlink | `npx ai-toolkit --symlink` or `AI_TOOLKIT_MODE=symlink npx ai-toolkit` | creates `.claude/skills/code-review` as a relative symlink to `node_modules/@aleksandrio/ai-toolkit/skills/code-review` |

Symlink mode only works when the package is installed in the project's
`node_modules` (not from the npx cache); otherwise the installer falls back to
copy mode and says so. Use copy mode when the skill must be visible to people
who do not run `npm install` (for example in a repository where `.claude/` is
committed and `node_modules/` is not).

`PROJECT_ROOT=/path/to/repo` overrides the detected project root.

## Uninstall

```bash
npx ai-toolkit-uninstall
npm uninstall @aleksandrio/ai-toolkit
```

The uninstaller reads only `.claude/.ai-toolkit-manifest.json` and removes the
listed files, directories or symlinks, the sentinel block in `CLAUDE.md` (the
file itself stays) and the manifest. Nothing else is touched.

## Publish a new version

Publishing happens only from GitHub Actions (`.github/workflows/publish-ai-toolkit.yml`)
with the workflow's `GITHUB_TOKEN`; there are no repository secrets to add.

1. Change files, commit.
2. Bump the version and push with the tag:

   ```bash
   npm version patch -m "chore(release): %s"
   git push --follow-tags
   ```

3. The workflow validates the package (`validate` job: package.json fields,
   skill frontmatter, `node --check`, `npm pack --dry-run`) on every push and
   pull request, and publishes (`publish` job) on pushes to `main` and on `v*`
   tags. A push whose version is already in the registry is skipped instead
   of failing with 409. A tag that does not match `package.json` fails.

Check the result:

```bash
npm view @aleksandrio/ai-toolkit --registry=https://npm.pkg.github.com
```

Package page: https://github.com/aleksandrio/ai-toolkit/pkgs/npm/ai-toolkit

## Decision

Chosen distribution model: **Model 1, GitHub Packages** (npm registry at
`npm.pkg.github.com`).

- The consumers are repositories already hosted on GitHub, so the first row of
  the decision table ("who consumes the artifacts") points at Model 1.
- There is no need to release content over time or to support several stacks,
  which would be the arguments for Model 3 (a product with API and CLI).
- Model 2 (AWS CodeArtifact) would require an AWS account, Terraform and OIDC
  for zero benefit to a team that does not run on AWS.
- Cost of Model 1: a `publishConfig` entry in `package.json`, publishing with
  the ephemeral `GITHUB_TOKEN`, no infrastructure. With a public package even
  reading needs no token.

The package lives in its own repository (`aleksandrio/ai-toolkit`) rather
than in a consumer project: the lesson's model separates the "source of truth"
repository from consumer repositories, a publish workflow inside a product repo
would collide with its CI, and a separate repo gives a clean Packages page with
the version list and its own Actions history.

## Private variant

To make the package private, remove `"access": "public"` from `publishConfig`
and keep the repository private (the package inherits visibility from the
repository linked through `repository.url`). Consumers then need read access:

- locally: `npm login --scope=@aleksandrio --auth-type=legacy --registry=https://npm.pkg.github.com`
  with a classic personal access token that has `read:packages` (fine-grained
  tokens do not work for GitHub Packages npm);
- in GitHub Actions of the same owner: `actions/setup-node` with
  `registry-url: https://npm.pkg.github.com`, `scope: "@aleksandrio"` and
  `NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`;
- on other CI platforms: a `GH_PKG_TOKEN` secret and a user-level `.npmrc`
  written at build time. Never commit an `_authToken` line.

A private package cannot be made public again later without deleting it, so
decide before the first publish.

## Development

```bash
node --check install.js uninstall.js
npm pack --dry-run        # should list only skills/, rules/, install.js, uninstall.js, README.md, package.json
npm pack                  # creates aleksandrio-ai-toolkit-<version>.tgz for a local test install
```

Local test: in a scratch project run `npm init -y`, `npm i -D ../aleksandrio-ai-toolkit-<version>.tgz`,
then `npx ai-toolkit` and `npx ai-toolkit-uninstall`.

## License

MIT
