#!/usr/bin/env node
"use strict";

// Installer for @aleksandrio/ai-toolkit.
// Runs as the package postinstall and as the `ai-toolkit` bin.
// Rules: touch only files listed in its own manifest and the text between the
// sentinel markers in the consumer's CLAUDE.md; never remove `.claude/skills` as a whole.

const fs = require("node:fs");
const path = require("node:path");

const pkg = require("./package.json");

const PACKAGE_NAME = pkg.name;
const PACKAGE_VERSION = pkg.version;
const BEGIN = `<!-- BEGIN ${PACKAGE_NAME} -->`;
const END = `<!-- END ${PACKAGE_NAME} -->`;
const MANIFEST = ".ai-toolkit-manifest.json";

// Returns the consumer project root that owns the node_modules this package
// lives in, or null when the package runs from an npx cache or a checkout.
function findConsumerRoot() {
  let dir = __dirname;
  while (dir !== path.dirname(dir)) {
    if (path.basename(dir) === "node_modules") {
      const candidate = path.dirname(dir);
      const isNpxCache = candidate.split(path.sep).includes("_npx");
      if (!isNpxCache && fs.existsSync(path.join(candidate, "package.json"))) return candidate;
      return null;
    }
    dir = path.dirname(dir);
  }
  return null;
}

function findProjectRoot(consumerRoot) {
  if (process.env.PROJECT_ROOT) return path.resolve(process.env.PROJECT_ROOT);
  if (consumerRoot) return consumerRoot;
  return path.resolve(process.env.INIT_CWD || process.cwd());
}

function resolveMode(consumerRoot, projectRoot) {
  const wantsSymlink = process.argv.includes("--symlink") || process.env.AI_TOOLKIT_MODE === "symlink";
  if (!wantsSymlink) return "copy";
  if (!consumerRoot || consumerRoot !== projectRoot) {
    console.warn(
      `${PACKAGE_NAME}: symlink mode needs the package installed in the project's node_modules; using copy mode`,
    );
    return "copy";
  }
  return "symlink";
}

function readManifest(projectRoot) {
  const manifestPath = path.join(projectRoot, ".claude", MANIFEST);
  if (!fs.existsSync(manifestPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (error) {
    throw new Error(`cannot parse ${path.relative(projectRoot, manifestPath)}: ${error.message}`);
  }
}

function isManaged(manifest, relPath) {
  if (!manifest || !Array.isArray(manifest.files)) return false;
  return manifest.files.some((entry) => entry === relPath || entry.startsWith(relPath + "/"));
}

function removePath(target) {
  let stat;
  try {
    stat = fs.lstatSync(target);
  } catch {
    return;
  }
  if (stat.isSymbolicLink()) {
    fs.unlinkSync(target);
  } else {
    fs.rmSync(target, { recursive: true, force: true });
  }
}

function copyDir(source, target, installedFiles, root) {
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const src = path.join(source, entry.name);
    const dst = path.join(target, entry.name);
    if (entry.isDirectory()) {
      copyDir(src, dst, installedFiles, root);
    } else {
      fs.copyFileSync(src, dst);
      installedFiles.push(path.relative(root, dst));
    }
  }
}

function listSkills() {
  const source = path.join(__dirname, "skills");
  if (!fs.existsSync(source)) return [];
  return fs
    .readdirSync(source, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

// Guard: a skill directory that exists but is not listed in our manifest belongs
// to someone else (the user or another package). Abort instead of overwriting.
function checkSkillOwnership(projectRoot, skills, manifest) {
  for (const skill of skills) {
    const relPath = path.join(".claude", "skills", skill);
    const target = path.join(projectRoot, relPath);
    let exists = false;
    try {
      fs.lstatSync(target);
      exists = true;
    } catch {
      exists = false;
    }
    if (exists && !isManaged(manifest, relPath)) {
      throw new Error(
        `${relPath} already exists and is not listed in .claude/${MANIFEST}; ` +
          `move it away or add it to the manifest, then reinstall (nothing was changed)`,
      );
    }
  }
}

function installSkills(projectRoot, skills, mode, installedFiles) {
  const targetRoot = path.join(projectRoot, ".claude", "skills");
  fs.mkdirSync(targetRoot, { recursive: true });

  for (const skill of skills) {
    const source = path.join(__dirname, "skills", skill);
    const target = path.join(targetRoot, skill);
    removePath(target); // only our own skill directory, never the whole .claude/skills
    if (mode === "symlink") {
      fs.symlinkSync(path.relative(targetRoot, source), target, "dir");
      installedFiles.push(path.relative(projectRoot, target));
    } else {
      copyDir(source, target, installedFiles, projectRoot);
    }
  }
}

function applyRulesBlock(existing, teamRules) {
  const block = `${BEGIN}\n${teamRules.trim()}\n${END}`;
  const start = existing.indexOf(BEGIN);
  const end = existing.indexOf(END);

  if (start !== -1 && end !== -1 && end > start) {
    return existing.slice(0, start) + block + existing.slice(end + END.length);
  }

  if (start !== -1 || end !== -1) {
    // A single marker means someone edited the managed block by hand. Appending
    // a second block would duplicate rules, so leave the file for a human.
    throw new Error(`CLAUDE.md has an unpaired ${PACKAGE_NAME} marker; fix it and reinstall (nothing was changed)`);
  }

  if (!existing.trim()) return block + "\n";
  return existing.trimEnd() + "\n\n" + block + "\n";
}

function prepareRules(projectRoot) {
  const rulesFile = path.join(__dirname, "rules", "CLAUDE.md");
  if (!fs.existsSync(rulesFile)) return null;

  const teamRules = fs.readFileSync(rulesFile, "utf8");
  if (teamRules.includes(BEGIN) || teamRules.includes(END)) {
    throw new Error("rules/CLAUDE.md must not contain the sentinel markers; refusing to install");
  }

  const target = path.join(projectRoot, "CLAUDE.md");
  const existing = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "";
  return { target, content: applyRulesBlock(existing, teamRules) };
}

function writeManifest(projectRoot, mode, installedFiles) {
  const manifestDir = path.join(projectRoot, ".claude");
  fs.mkdirSync(manifestDir, { recursive: true });
  fs.writeFileSync(
    path.join(manifestDir, MANIFEST),
    JSON.stringify(
      {
        package: PACKAGE_NAME,
        version: PACKAGE_VERSION,
        installedAt: new Date().toISOString(),
        mode,
        files: installedFiles,
      },
      null,
      2,
    ) + "\n",
  );
}

function main() {
  const consumerRoot = findConsumerRoot();
  const projectRoot = findProjectRoot(consumerRoot);
  const mode = resolveMode(consumerRoot, projectRoot);
  const skills = listSkills();
  const manifest = readManifest(projectRoot);
  const installedFiles = [];

  // Validate everything first so a failure leaves the project untouched.
  const rules = prepareRules(projectRoot);
  checkSkillOwnership(projectRoot, skills, manifest);

  installSkills(projectRoot, skills, mode, installedFiles);
  if (rules) {
    fs.writeFileSync(rules.target, rules.content);
    installedFiles.push("CLAUDE.md");
  }
  writeManifest(projectRoot, mode, installedFiles);

  console.log(
    `${PACKAGE_NAME}@${PACKAGE_VERSION}: installed ${installedFiles.length} entr${installedFiles.length === 1 ? "y" : "ies"} ` +
      `(${mode} mode) into ${projectRoot}`,
  );
}

try {
  main();
} catch (error) {
  // Never fail the consumer's `npm install`; when run by hand, report failure via exit code.
  console.warn(`${PACKAGE_NAME}: install warning: ${error.message}`);
  if (process.env.npm_lifecycle_event !== "postinstall") process.exitCode = 1;
}
