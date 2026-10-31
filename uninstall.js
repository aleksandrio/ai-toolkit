#!/usr/bin/env node
"use strict";

// Uninstaller for @aleksandrio/ai-toolkit.
// Reads only the manifest written by install.js and removes exactly what it lists:
// the managed files/directories/symlinks, the sentinel block in CLAUDE.md
// (the file itself stays) and the manifest.

const fs = require("node:fs");
const path = require("node:path");

const PACKAGE_NAME = require("./package.json").name;
const BEGIN = `<!-- BEGIN ${PACKAGE_NAME} -->`;
const END = `<!-- END ${PACKAGE_NAME} -->`;
const MANIFEST = ".ai-toolkit-manifest.json";

function removeRulesBlock(content) {
  const start = content.indexOf(BEGIN);
  const end = content.indexOf(END);
  if (start === -1 || end === -1 || end < start) return content;

  let before = content.slice(0, start);
  let after = content.slice(end + END.length);
  // Undo the blank line and the trailing newline the installer added around the block.
  if (before.endsWith("\n\n")) before = before.slice(0, -1);
  if (after.startsWith("\n")) after = after.slice(1);
  return before + after;
}

function removePath(target) {
  let stat;
  try {
    stat = fs.lstatSync(target);
  } catch {
    return false;
  }
  if (stat.isSymbolicLink()) {
    fs.unlinkSync(target);
  } else {
    fs.rmSync(target, { recursive: true, force: true });
  }
  return true;
}

function removeEmptyParents(dir, stopAt) {
  while (dir.startsWith(stopAt + path.sep) && fs.existsSync(dir) && fs.readdirSync(dir).length === 0) {
    fs.rmdirSync(dir);
    dir = path.dirname(dir);
  }
}

function main() {
  const projectRoot = path.resolve(process.env.PROJECT_ROOT || process.env.INIT_CWD || process.cwd());
  const claudeDir = path.join(projectRoot, ".claude");
  const manifestPath = path.join(claudeDir, MANIFEST);
  if (!fs.existsSync(manifestPath)) {
    console.log(`${PACKAGE_NAME}: no manifest found in ${projectRoot}, nothing to uninstall`);
    return;
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (manifest.package && manifest.package !== PACKAGE_NAME) {
    throw new Error(`manifest belongs to ${manifest.package}, not ${PACKAGE_NAME}; refusing to uninstall`);
  }

  let removed = 0;
  for (const relPath of manifest.files || []) {
    if (relPath === "CLAUDE.md") continue;
    const target = path.resolve(projectRoot, relPath);
    // Safety: only ever remove entries that live under the consumer's .claude/ directory.
    if (!target.startsWith(claudeDir + path.sep)) {
      console.warn(`${PACKAGE_NAME}: skipping ${relPath} (outside .claude/)`);
      continue;
    }
    if (removePath(target)) removed += 1;
    removeEmptyParents(path.dirname(target), claudeDir);
  }

  const rulesPath = path.join(projectRoot, "CLAUDE.md");
  if (fs.existsSync(rulesPath)) {
    const content = fs.readFileSync(rulesPath, "utf8");
    const cleaned = removeRulesBlock(content);
    if (cleaned !== content) fs.writeFileSync(rulesPath, cleaned);
  }

  fs.rmSync(manifestPath, { force: true });
  console.log(`${PACKAGE_NAME}: removed ${removed} managed entr${removed === 1 ? "y" : "ies"}, rules block and manifest from ${projectRoot}`);
}

try {
  main();
} catch (error) {
  console.error(`${PACKAGE_NAME}: uninstall failed: ${error.message}`);
  process.exitCode = 1;
}
