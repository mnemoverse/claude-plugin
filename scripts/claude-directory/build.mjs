#!/usr/bin/env node
// Builds the lean Claude plugin directory tree from the root sources.
//
// The Claude plugin directory accepts only plugin files: a manifest, skills,
// commands, a README and a license. This repository also carries manifests,
// CI, scripts and images for other hosts, so the directory gets a generated
// copy instead of the repository root. Every file of that copy, and how it is
// made, is listed in config.json next to this script. The root files are only
// read, never changed.
//
//   node scripts/claude-directory/build.mjs --out <dir>
//
// <dir> must not exist or be empty. The output is deterministic: the same
// sources give byte-identical files. check.mjs builds the tree and checks it
// against the directory's file rules; claude-directory-release.yml commits it
// to the claude-directory branch.
//
// No dependencies. Node 20+.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, "..", "..");

export function loadConfig(root = repoRoot) {
  return JSON.parse(readFileSync(path.join(root, "scripts", "claude-directory", "config.json"), "utf8"));
}

export function rootVersion(root = repoRoot) {
  return JSON.parse(readFileSync(path.join(root, ".claude-plugin", "plugin.json"), "utf8")).version;
}

export function expectedServerUrl(config, root = repoRoot) {
  return JSON.parse(readFileSync(path.join(root, config.manifest.serverUrlFrom), "utf8")).serverUrl;
}

class BuildError extends Error {}

function fail(file, message) {
  throw new BuildError(`${file}: ${message}`);
}

// --- Markdown helpers. Lines inside fenced code blocks are never treated as
// headings or paragraph boundaries.

function fenceMask(lines) {
  const inFence = [];
  let open = null;
  for (const line of lines) {
    const m = /^\s*(```+|~~~+)/.exec(line);
    if (open === null && m) {
      open = m[1][0];
      inFence.push(true);
    } else if (open !== null) {
      inFence.push(true);
      if (m && m[1][0] === open) open = null;
    } else {
      inFence.push(false);
    }
  }
  return inFence;
}

function headingLevel(line) {
  const m = /^(#{1,6})\s/.exec(line);
  return m ? m[1].length : 0;
}

function findHeading(lines, heading) {
  const mask = fenceMask(lines);
  return lines.map((l, i) => (!mask[i] && l === heading ? i : -1)).filter((i) => i >= 0);
}

function dropSection(text, heading, file) {
  const lines = text.split("\n");
  const hits = findHeading(lines, heading);
  if (hits.length !== 1) fail(file, `drop-section: expected exactly one heading "${heading}", found ${hits.length}`);
  const start = hits[0];
  const level = headingLevel(heading);
  const mask = fenceMask(lines);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const l = headingLevel(lines[i]);
    if (!mask[i] && l > 0 && l <= level) {
      end = i;
      break;
    }
  }
  lines.splice(start, end - start);
  return lines.join("\n");
}

function dropParagraph(text, needle, file) {
  const lines = text.split("\n");
  const mask = fenceMask(lines);
  const paragraphs = [];
  let start = null;
  for (let i = 0; i <= lines.length; i++) {
    const blank = i === lines.length || (lines[i].trim() === "" && !mask[i]);
    if (!blank && start === null) start = i;
    if (blank && start !== null) {
      paragraphs.push([start, i]);
      start = null;
    }
  }
  const hits = paragraphs.filter(([s, e]) => lines.slice(s, e).join("\n").includes(needle));
  if (hits.length !== 1) fail(file, `drop-paragraph: expected exactly one paragraph containing "${needle}", found ${hits.length}`);
  const [s, e] = hits[0];
  // Remove the paragraph and the blank line that follows it.
  const removeEnd = e < lines.length && lines[e].trim() === "" ? e + 1 : e;
  lines.splice(s, removeEnd - s);
  return lines.join("\n");
}

function replaceOnce(text, find, replacement, file) {
  const count = text.split(find).length - 1;
  if (count !== 1) fail(file, `replace: expected exactly one occurrence of "${find}", found ${count}`);
  return text.replace(find, () => replacement);
}

// Removes top-level keys from YAML front matter, including any indented or
// list continuation lines of a multi-line value.
export function stripFrontmatterKeys(text, keys, file) {
  if (!text.startsWith("---\n")) return text;
  const close = text.indexOf("\n---\n", 4);
  if (close < 0) fail(file, "front matter is not closed");
  const head = text.slice(4, close).split("\n");
  const kept = [];
  let dropping = false;
  for (const line of head) {
    const key = /^([A-Za-z0-9_-]+)\s*:/.exec(line);
    if (key) dropping = keys.includes(key[1]);
    else if (!/^(\s|-\s)/.test(line)) dropping = false;
    if (!dropping) kept.push(line);
  }
  return `---\n${kept.join("\n")}${text.slice(close)}`;
}

function applyEdits(text, entry) {
  let out = text;
  for (const edit of entry.edits || []) {
    switch (edit.op) {
      case "drop-section":
        out = dropSection(out, edit.heading, entry.from);
        break;
      case "drop-paragraph":
        out = dropParagraph(out, edit.contains, entry.from);
        break;
      case "replace":
        out = replaceOnce(out, edit.find, edit.with, entry.from);
        break;
      default:
        fail(entry.from, `unknown edit op "${edit.op}"`);
    }
  }
  const lines = out.split("\n");
  for (const heading of entry.requiredHeadings || []) {
    if (findHeading(lines, heading).length !== 1) {
      fail(entry.from, `required heading "${heading}" is missing from the generated copy`);
    }
  }
  for (const needle of entry.mustNotContain || []) {
    if (out.includes(needle)) fail(entry.from, `generated copy still contains "${needle}"`);
  }
  return out;
}

function buildManifest(config, root) {
  const m = config.manifest;
  const src = JSON.parse(readFileSync(path.join(root, m.from), "utf8"));
  if (src.name !== m.name) fail(m.from, `name is ${JSON.stringify(src.name)}, expected ${JSON.stringify(m.name)}`);
  if (src.privacyPolicyUrl !== undefined && src.privacyPolicyUrl !== m.privacyPolicyUrl) {
    fail(m.from, `privacyPolicyUrl ${JSON.stringify(src.privacyPolicyUrl)} differs from config.json`);
  }
  const generated = {
    name: m.name,
    version: src.version,
    privacyPolicyUrl: m.privacyPolicyUrl,
    mcpServers: { [m.serverName]: { type: m.serverType, url: expectedServerUrl(config, root) } },
  };
  for (const key of m.copyKeys) {
    if (src[key] === undefined) fail(m.from, `${key} is missing`);
  }
  // Fixed key order, so the output does not depend on the source's order.
  const order = ["name", "displayName", "version", "description", "author", "homepage",
    "repository", "privacyPolicyUrl", "license", "keywords", "mcpServers"];
  const out = {};
  for (const key of order) {
    if (key in generated) out[key] = generated[key];
    else if (m.copyKeys.includes(key)) out[key] = src[key];
  }
  for (const key of m.copyKeys) {
    if (!order.includes(key)) fail("config.json", `manifest.copyKeys has "${key}", which the build does not place`);
  }
  return `${JSON.stringify(out, null, 2)}\n`;
}

function renderReadme(config, root) {
  const r = config.readme;
  const values = {
    version: rootVersion(root),
    serverUrl: expectedServerUrl(config, root),
    privacyPolicyUrl: config.manifest.privacyPolicyUrl,
  };
  const text = readFileSync(path.join(root, r.template), "utf8").replace(/\{\{(\w+)\}\}/g, (all, key) => {
    if (!(key in values)) fail(r.template, `unknown placeholder ${all}`);
    return values[key];
  });
  return text;
}

// Returns the generated files as a sorted array of [relativePath, contents].
export function generate({ root = repoRoot, config = loadConfig(root) } = {}) {
  const files = new Map();
  const put = (rel, contents) => {
    if (files.has(rel)) fail(rel, "generated twice");
    files.set(rel, contents);
  };
  put(config.manifest.to, buildManifest(config, root));
  put(config.readme.to, renderReadme(config, root));
  for (const entry of config.files) {
    let text = readFileSync(path.join(root, entry.from), "utf8");
    if (entry.stripFrontmatterKeys) text = stripFrontmatterKeys(text, entry.stripFrontmatterKeys, entry.from);
    text = applyEdits(text, entry);
    put(entry.to, text);
  }
  return [...files.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

export function writeTree(outDir, files) {
  if (existsSync(outDir) && readdirSync(outDir).length > 0) {
    throw new BuildError(`${outDir}: output directory is not empty`);
  }
  for (const [rel, contents] of files) {
    const dest = path.join(outDir, rel);
    mkdirSync(path.dirname(dest), { recursive: true });
    writeFileSync(dest, contents, { mode: 0o644 });
  }
}

export function build(outDir, options = {}) {
  const files = generate(options);
  writeTree(outDir, files);
  return files;
}

function main(argv) {
  const i = argv.indexOf("--out");
  if (i < 0 || !argv[i + 1]) {
    console.error("usage: node scripts/claude-directory/build.mjs --out <dir>");
    process.exit(2);
  }
  const outDir = path.resolve(argv[i + 1]);
  try {
    const files = build(outDir);
    for (const [rel, contents] of files) console.log(`${String(Buffer.byteLength(contents)).padStart(6)}  ${rel}`);
    console.log(`${files.length} files written to ${outDir}`);
  } catch (err) {
    if (err instanceof BuildError) {
      console.error(`build failed: ${err.message}`);
      process.exit(1);
    }
    throw err;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) main(process.argv.slice(2));
