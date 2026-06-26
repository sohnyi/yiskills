---
name: markdownlint
description: Lint, diagnose, and auto-fix Markdown/CommonMark/GFM style issues with David Anson's markdownlint Node.js library. Use when the user asks to check Markdown, fix markdownlint warnings/errors, create or tune .markdownlint configuration, explain MD### rule violations, make Markdown compatible with Prettier, or implement project-specific markdownlint custom rules.
---

# Markdownlint

Use this skill to run and apply `markdownlint` checks from the
`DavidAnson/markdownlint` Node.js library.

## Quick Start

Prefer the bundled runner when the user asks to lint or fix files:

```bash
node <skill-dir>/scripts/markdownlint-runner.mjs [targets...]
node <skill-dir>/scripts/markdownlint-runner.mjs --fix [targets...]
```

If no target is provided, the runner scans the current directory recursively for
Markdown files and skips common generated/dependency directories.

Useful flags:

- `--fix`: apply markdownlint's safe automatic fixes, then re-lint.
- `--config <file>`: read a JSON/JSONC config file via `markdownlint.readConfig`.
- `--format text|json`: choose human-readable output or raw JSON.
- `--quiet`: suppress success messages.

Run from the repository root so relative config `extends` values resolve as the
project expects.

## Dependency Handling

The runner resolves `markdownlint` in this order:

1. The target repository's `node_modules` from the current working directory.
2. This skill's local `node_modules`.

If resolution fails, install the dependency in the target repository or in the
skill folder:

```bash
npm install --save-dev markdownlint
npm install --prefix <skill-dir>
```

Do not confuse this package with `markdownlint-cli` or `markdownlint-cli2`; the
GitHub project wrapped by this skill is the library package, so script/API usage
is the reliable integration point.

## Workflow

1. Inspect existing project conventions first:
   - Look for `.markdownlint.json`, `.markdownlint.jsonc`, package scripts, CI
     jobs, editor settings, and Prettier config.
   - Prefer project config over inventing a new style.
2. Run the bundled runner without `--fix` to get the exact violations.
3. For fix requests, run with `--fix`, then review remaining violations.
4. Manually edit remaining issues that have no safe automatic fix.
5. Re-run the runner and report the final result.

Use `--format json` when you need structured diagnostics for further editing or
summaries.

## Configuration Guidance

Use `.markdownlint.json` or `.markdownlint.jsonc` for reusable project config.
Common examples:

```json
{
  "default": true,
  "MD013": false,
  "MD033": false
}
```

For projects formatted by Prettier, prefer extending the built-in Prettier
style:

```json
{
  "extends": "markdownlint/style/prettier"
}
```

For a full rule/configuration summary, read
`references/markdownlint-reference.md`.

## Inline Suppressions

Use comments sparingly and as close as possible to the exceptional content:

```markdown
<!-- markdownlint-disable-next-line MD013 -->
This intentionally long line is clearer when kept intact.
```

Avoid blanket file disables unless the file is generated, vendored, or otherwise
not worth linting.

## Custom Rules

Only create custom rules when configuration cannot express the policy. Read
`references/markdownlint-reference.md` before authoring rules. Prefer
`parser: "micromark"` for new rules; use `parser: "none"` for simple text-only
checks.
