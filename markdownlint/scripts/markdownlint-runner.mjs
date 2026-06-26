#!/usr/bin/env node
// @ts-check

import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import fs from "node:fs";
import { parse as parseJsonc } from "jsonc-parser";
import path from "node:path";
import process from "node:process";

const SKIP_DIRS = new Set([
  ".git",
  ".hg",
  ".svn",
  ".next",
  ".nuxt",
  ".turbo",
  ".vercel",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out"
]);

const MARKDOWN_EXTENSIONS = new Set([
  ".md",
  ".markdown",
  ".mdown",
  ".mkd"
]);

function usage() {
  console.log(`Usage: markdownlint-runner.mjs [--fix] [--config FILE] [--format text|json] [--quiet] [targets...]

Targets may be files or directories. With no targets, the current directory is scanned recursively.`);
}

function parseArgs(argv) {
  const options = {
    configFile: undefined,
    fix: false,
    format: "text",
    quiet: false,
    targets: []
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    } else if (arg === "--fix") {
      options.fix = true;
    } else if (arg === "--quiet") {
      options.quiet = true;
    } else if (arg === "--config" || arg === "-c") {
      index += 1;
      if (!argv[index]) {
        throw new Error("--config requires a file path");
      }
      options.configFile = argv[index];
    } else if (arg === "--format" || arg === "-f") {
      index += 1;
      if (!["text", "json"].includes(argv[index])) {
        throw new Error("--format must be text or json");
      }
      options.format = argv[index];
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      options.targets.push(arg);
    }
  }
  return options;
}

function findPackageRoot(start) {
  let current = path.resolve(start);
  while (true) {
    if (fs.existsSync(path.join(current, "package.json"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return start;
    }
    current = parent;
  }
}

function resolveFrom(baseDir, specifier) {
  const packageRoot = findPackageRoot(baseDir);
  const requireFromBase = createRequire(path.join(packageRoot, "package.json"));
  return requireFromBase.resolve(specifier);
}

async function importMarkdownlint(cwd) {
  const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const candidates = [cwd, skillRoot];
  const errors = [];
  for (const candidate of candidates) {
    try {
      const mainPath = resolveFrom(candidate, "markdownlint");
      const syncPath = resolveFrom(candidate, "markdownlint/sync");
      const [mainModule, syncModule] = await Promise.all([
        import(pathToFileURL(mainPath).href),
        import(pathToFileURL(syncPath).href)
      ]);
      return {
        applyFixes: mainModule.applyFixes,
        getVersion: mainModule.getVersion,
        lint: syncModule.lint,
        readConfig: syncModule.readConfig
      };
    } catch (error) {
      errors.push(`${candidate}: ${error.message}`);
    }
  }
  throw new Error(`Unable to resolve markdownlint. Tried:\n${errors.join("\n")}`);
}

function parseJsonOrJsonc(text) {
  return parseJsonc(text);
}

function findDefaultConfig(cwd) {
  const names = [
    ".markdownlint.json",
    ".markdownlint.jsonc"
  ];
  return names
    .map((name) => path.join(cwd, name))
    .find((file) => fs.existsSync(file));
}

function collectMarkdownFiles(targets) {
  const files = [];
  const visit = (entry) => {
    const stat = fs.statSync(entry);
    if (stat.isDirectory()) {
      if (SKIP_DIRS.has(path.basename(entry))) {
        return;
      }
      for (const child of fs.readdirSync(entry)) {
        visit(path.join(entry, child));
      }
    } else if (stat.isFile() && MARKDOWN_EXTENSIONS.has(path.extname(entry).toLowerCase())) {
      files.push(path.resolve(entry));
    }
  };
  for (const target of targets.length ? targets : [process.cwd()]) {
    visit(path.resolve(target));
  }
  return [...new Set(files)].sort();
}

function summarize(results) {
  return Object.values(results).reduce(
    (count, issues) => count + issues.length,
    0
  );
}

function formatIssue(file, issue) {
  const range = issue.errorRange ? `:${issue.errorRange[0]}` : "";
  return `${file}:${issue.lineNumber}${range} ${issue.ruleNames.join("/")} ${issue.ruleDescription}${issue.errorDetail ? ` [${issue.errorDetail}]` : ""}${issue.errorContext ? ` (${issue.errorContext})` : ""}`;
}

function printText(results) {
  for (const [file, issues] of Object.entries(results)) {
    for (const issue of issues) {
      console.log(formatIssue(file, issue));
    }
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();
  const markdownlint = await importMarkdownlint(cwd);
  const files = collectMarkdownFiles(options.targets);
  if (!files.length) {
    if (!options.quiet) {
      console.log("No Markdown files found.");
    }
    return;
  }

  const configFile = options.configFile
    ? path.resolve(options.configFile)
    : findDefaultConfig(cwd);
  const config = configFile
    ? markdownlint.readConfig(configFile, [parseJsonOrJsonc])
    : undefined;

  const lintOptions = {
    files,
    ...(config ? { config } : {})
  };
  let results = markdownlint.lint(lintOptions);

  if (options.fix) {
    for (const file of files) {
      const issues = results[file] ?? [];
      if (!issues.some((issue) => issue.fixInfo)) {
        continue;
      }
      const original = fs.readFileSync(file, "utf8");
      const fixed = markdownlint.applyFixes(original, issues);
      if (fixed !== original) {
        fs.writeFileSync(file, fixed);
      }
    }
    results = markdownlint.lint(lintOptions);
  }

  const issueCount = summarize(results);
  if (options.format === "json") {
    console.log(JSON.stringify({
      configFile,
      files,
      fixed: options.fix,
      issueCount,
      markdownlintVersion: markdownlint.getVersion(),
      results
    }, null, 2));
  } else {
    printText(results);
    if (!options.quiet) {
      const action = options.fix ? " after fixes" : "";
      console.log(`${issueCount} issue(s)${action} across ${files.length} file(s). markdownlint ${markdownlint.getVersion()}`);
    }
  }
  process.exitCode = issueCount ? 1 : 0;
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 2;
});
