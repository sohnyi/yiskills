# Markdownlint Reference

Source project: <https://github.com/DavidAnson/markdownlint>

`markdownlint` is a Node.js library for checking Markdown/CommonMark/GFM style.
The wrapped package is not the same thing as `markdownlint-cli` or
`markdownlint-cli2`.

## API

Use synchronous imports for local scripts:

```javascript
import { applyFixes, getVersion } from "markdownlint";
import { lint, readConfig } from "markdownlint/sync";
```

Lint files:

```javascript
const results = lint({
  files: ["README.md"],
  config: readConfig(".markdownlint.json")
});
```

Auto-fix supported issues:

```javascript
const results = lint({ strings: { content: original } });
const fixed = applyFixes(original, results.content);
```

## Config

Config values:

- `false`: disable a rule, alias, tag, or `default`.
- `true` or `"error"`: enable as errors.
- `"warning"`: enable as warnings.
- Object: enable and pass rule parameters. Use `enabled: false` to disable
  while retaining parameters.

Order matters: `default` applies first, then keys are processed top to bottom.
Later keys override earlier keys. Rule names, aliases, tags, and `default` are
case-insensitive.

Example:

```json
{
  "default": true,
  "MD003": { "style": "atx" },
  "MD007": { "indent": 2 },
  "MD013": false,
  "whitespace": "warning"
}
```

Config files support `extends`; paths are resolved relative to the config file.
Built-in styles include:

- `markdownlint/style/all`
- `markdownlint/style/relaxed`
- `markdownlint/style/prettier`

Prettier projects should usually use:

```json
{
  "extends": "markdownlint/style/prettier"
}
```

If Prettier is configured with `--tab-width 4`, add:

```json
{
  "list-marker-space": {
    "ul_multi": 3,
    "ul_single": 3
  },
  "ul-indent": {
    "indent": 4
  }
}
```

## Inline Controls

```markdown
<!-- markdownlint-disable -->
<!-- markdownlint-enable -->
<!-- markdownlint-disable MD001 MD005 -->
<!-- markdownlint-enable MD001 MD005 -->
<!-- markdownlint-disable-line MD013 -->
<!-- markdownlint-disable-next-line MD013 -->
<!-- markdownlint-disable-file MD033 -->
<!-- markdownlint-configure-file { "MD013": false } -->
```

Use inline controls narrowly. Prefer config for project-wide conventions.

## Common Rules

- `MD001` / `heading-increment`: heading levels should increase by one.
- `MD003` / `heading-style`: consistent heading style.
- `MD004` / `ul-style`: consistent unordered list marker style.
- `MD007` / `ul-indent`: unordered list indentation.
- `MD009` / `no-trailing-spaces`: trailing spaces.
- `MD010` / `no-hard-tabs`: hard tabs.
- `MD012` / `no-multiple-blanks`: consecutive blank lines.
- `MD013` / `line-length`: line length.
- `MD022` / `blanks-around-headings`: blank lines around headings.
- `MD024` / `no-duplicate-heading`: duplicate headings.
- `MD025` / `single-title`: multiple top-level headings.
- `MD029` / `ol-prefix`: ordered-list numbering style.
- `MD031` / `blanks-around-fences`: blank lines around fenced code.
- `MD032` / `blanks-around-lists`: blank lines around lists.
- `MD033` / `no-inline-html`: inline HTML.
- `MD034` / `no-bare-urls`: bare URLs.
- `MD040` / `fenced-code-language`: fenced code blocks need languages.
- `MD041` / `first-line-heading`: first line should be top-level heading.
- `MD045` / `no-alt-text`: images need alt text.
- `MD047` / `single-trailing-newline`: exactly one trailing newline.
- `MD051` / `link-fragments`: link fragments should be valid.
- `MD052` / `reference-links-images`: referenced labels must be defined.
- `MD053` / `link-image-reference-definitions`: definitions should be used.
- `MD055` / `table-pipe-style`: table pipe style.
- `MD056` / `table-column-count`: table column count.
- `MD058` / `blanks-around-tables`: blank lines around tables.

Rule tags useful for bulk config:

- `accessibility`, `blank_lines`, `bullet`, `code`, `headings`, `html`,
  `images`, `indentation`, `language`, `line_length`, `links`, `ol`, `spaces`,
  `table`, `ul`, `url`, `whitespace`

## Custom Rules

Use custom rules only when built-in rules plus config cannot express the policy.

Rule object shape:

```javascript
export default {
  names: ["company-rule-name"],
  description: "Short description for diagnostics",
  information: new URL("https://example.com/docs/rule"),
  tags: ["company"],
  parser: "micromark",
  function: (params, onError) => {
    onError({
      lineNumber: 1,
      detail: "Problem detail",
      context: params.lines[0],
      fixInfo: { editColumn: 1, insertText: "..." }
    });
  }
};
```

Parser choices:

- `micromark`: preferred for structural Markdown rules.
- `none`: direct text checks.
- `markdownit`: legacy/custom parser compatibility.

Set `asynchronous: true` for async rule functions, then call the async or
promise API instead of `markdownlint/sync`.
