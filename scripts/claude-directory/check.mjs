#!/usr/bin/env node
// Checks the lean Claude plugin directory tree against the directory's rules.
//
//   node scripts/claude-directory/check.mjs                 build into a temp dir, check it, run the negative fixtures
//   node scripts/claude-directory/check.mjs --out <dir>     the same, but keep the built tree in <dir> (for a CI artifact)
//   node scripts/claude-directory/check.mjs --dir <dir>     check an already built tree, without building
//   node scripts/claude-directory/check.mjs --no-fixtures   skip the negative fixtures
//
// The rules follow the directory's pre-submission checklist: only plugin
// files, no dotfiles other than the manifest, no package or lock files, no
// scripts or images, file size and count limits, no allowed-tools, a manifest
// that declares exactly the hosted server, no text that reads or passes a
// credential, and a README that says what the plugin sends and where. Every
// rule has a negative fixture in fixtures.mjs that must fail it, so a rule
// that stops biting fails this check too, and fixtures.mjs pins the rule
// data (rule ids, forbidden text, README phrases, refusal sentences, the
// setup skill's headings) as literals, so a deleted rule fails it as well.
//
// Text files are read as LF without a byte order mark, as build.mjs writes
// them, so CRLF line endings or a BOM cannot hide front matter.
//
// No dependencies. Node 20+.

import { cpSync, lstatSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { build, expectedServerUrl, frontmatterBlock, isMain, loadConfig, normalizeText, repoRoot, rootVersion } from "./build.mjs";

export const MAX_FILE_BYTES = 256 * 1024;
export const MAX_FILES = 512;
export const PERMITTED_ALLOWED_TOOLS = ["Read", "Grep", "Glob", "LS"];

const SEGMENT = "[A-Za-z0-9][A-Za-z0-9._-]*";
const ALLOWED_EXACT = new Set(["README.md", "LICENSE", ".claude-plugin/plugin.json"]);
const ALLOWED_GLOBS = [
  new RegExp(`^skills/${SEGMENT}/SKILL\\.md$`),
  new RegExp(`^skills/${SEGMENT}/references/${SEGMENT}\\.md$`),
  new RegExp(`^commands/${SEGMENT}\\.md$`),
];

const FORBIDDEN_NAMES = new Set([
  "package.json", "package-lock.json", "npm-shrinkwrap.json", "yarn.lock", "pnpm-lock.yaml",
  "bun.lock", "bun.lockb", "requirements.txt", "pyproject.toml", "uv.lock", "Pipfile.lock",
]);
const FORBIDDEN_EXTENSIONS = new Set([
  ".mjs", ".cjs", ".js", ".ts", ".py", ".sh", ".bash", ".zsh", ".ps1", ".bat", ".cmd", ".exe",
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico", ".pdf", ".zip", ".mcpb", ".dxt",
]);

const MANIFEST_KEYS = new Set(["name", "displayName", "version", "description", "author", "homepage",
  "repository", "privacyPolicyUrl", "license", "keywords", "mcpServers"]);
const MANIFEST_FORBIDDEN_KEYS = ["userConfig", "headers", "env", "hooks", "lspServers"];

// Text that reads a credential from the user's machine, passes one to a
// server, or installs and runs code. `sample` is what the negative fixture
// injects. The plugin's refusal sentences ("Never store passwords, API
// keys, tokens ...") match none of these, and the refusal rule keeps them.
export const FORBIDDEN_TEXT = [
  { id: "MNEMOVERSE_API_KEY", re: /MNEMOVERSE_API_KEY/, sample: "export MNEMOVERSE_API_KEY=x" },
  { id: "mk_live", re: /mk_live/, sample: "use a key that starts with mk_live" },
  { id: "Bearer", re: /\bbearer\b/i, sample: "send it as a Bearer token" },
  { id: "Authorization:", re: /authorization\s*:/i, sample: "Authorization: x" },
  { id: "~/", re: /~\//, sample: "edit ~/.config/file" },
  { id: "$HOME", re: /\$HOME\b|%USERPROFILE%/i, sample: "cd $HOME" },
  { id: "process.env", re: /process\.env/, sample: "read process.env.TOKEN" },
  { id: "os.environ", re: /os\.environ/, sample: "read os.environ['TOKEN']" },
  { id: "${", re: /\$\{/, sample: "url: ${TOKEN}" },
  { id: "claude mcp add", re: /claude\s+mcp\s+add/i, sample: "run claude mcp add x" },
  { id: "--header", re: /--header\b/, sample: "pass --header x" },
  { id: "npx", re: /\bnpx\s/, sample: "run npx some-package" },
  { id: "uvx", re: /\buvx\s/, sample: "run uvx some-package" },
];

export const RULES = [
  "required-files", "regular-files", "allowlist", "dotfile", "file-type", "file-size",
  "file-count", "frontmatter", "allowed-tools", "manifest-parse", "manifest-name", "manifest-version",
  "manifest-privacy", "manifest-mcp", "manifest-keys", "forbidden-text", "readme-words",
  "readme-disclosure", "readme-template", "refusal-kept",
];

// Files that a host reads front matter from: each must start with one.
const NEEDS_FRONTMATTER = [new RegExp(`^skills/${SEGMENT}/SKILL\\.md$`), new RegExp(`^commands/${SEGMENT}\\.md$`)];
// allowed-tools as a key anywhere in a front matter block, bare or quoted,
// at any indentation.
const ALLOWED_TOOLS_KEY = /^\s*["']?allowed-tools["']?\s*:(.*)$/im;

function walk(dir) {
  const out = [];
  const visit = (rel) => {
    for (const entry of readdirSync(path.join(dir, rel)).sort()) {
      const child = rel ? `${rel}/${entry}` : entry;
      const st = lstatSync(path.join(dir, child));
      if (st.isSymbolicLink()) out.push({ rel: child, kind: "symlink", size: 0 });
      else if (st.isDirectory()) visit(child);
      else if (st.isFile()) out.push({ rel: child, kind: "file", size: st.size });
      else out.push({ rel: child, kind: "special", size: 0 });
    }
  };
  visit("");
  return out;
}

function wordsOutsideCode(markdown) {
  let inFence = false;
  let count = 0;
  for (const line of markdown.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    count += line.replace(/`[^`]*`/g, " ").split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
  }
  return count;
}

// Structural equality that ignores the order of object keys.
function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => Object.hasOwn(b, k) && deepEqual(a[k], b[k]));
}

// Returns a list of {rule, detail} failures; an empty list means the tree passes.
export function checkTree(dir, ctx) {
  const failures = [];
  const bad = (rule, detail) => failures.push({ rule, detail });
  const entries = walk(dir);
  const files = entries.filter((e) => e.kind === "file");
  const read = (rel) => readFileSync(path.join(dir, rel), "utf8");
  const has = (rel) => files.some((f) => f.rel === rel);

  const required = new Set([...ALLOWED_EXACT, ctx.config.manifest.to, ctx.config.readme.to,
    ...ctx.config.files.map((f) => f.to)]);
  for (const rel of [...required].sort()) if (!has(rel)) bad("required-files", `${rel} is missing`);

  for (const e of entries) {
    if (e.kind === "symlink") bad("regular-files", `${e.rel} is a symbolic link`);
    if (e.kind === "special") bad("regular-files", `${e.rel} is not a regular file`);
    const allowed = ALLOWED_EXACT.has(e.rel) || ALLOWED_GLOBS.some((re) => re.test(e.rel));
    if (!allowed) bad("allowlist", `${e.rel} is outside the allowed file list`);
    if (e.rel !== ".claude-plugin/plugin.json" && e.rel.split("/").some((s) => s.startsWith("."))) {
      bad("dotfile", `${e.rel} is a dotfile or sits in a dot-directory`);
    }
    const base = path.posix.basename(e.rel);
    if (FORBIDDEN_NAMES.has(base) || FORBIDDEN_EXTENSIONS.has(path.posix.extname(base).toLowerCase())) {
      bad("file-type", `${e.rel} is a package, lock, script or image file`);
    }
    if (e.size > MAX_FILE_BYTES) bad("file-size", `${e.rel} is ${e.size} bytes, over ${MAX_FILE_BYTES}`);
  }
  if (entries.length > MAX_FILES) bad("file-count", `${entries.length} files, over ${MAX_FILES}`);

  const text = new Map();
  for (const f of files) {
    if (f.size <= MAX_FILE_BYTES) text.set(f.rel, normalizeText(read(f.rel)));
  }

  for (const [rel, body] of text) {
    if (!rel.endsWith(".md")) continue;
    const fm = frontmatterBlock(body);
    if (NEEDS_FRONTMATTER.some((re) => re.test(rel))) {
      if (fm === null) bad("frontmatter", `${rel} does not start with a front matter block`);
      else if (fm.body === null) bad("frontmatter", `${rel} has a front matter block that is never closed`);
    }
    if (fm === null) continue;
    // An unclosed block is searched to the end of the file.
    const m = ALLOWED_TOOLS_KEY.exec(fm.body === null ? body : fm.body);
    if (m) {
      bad("allowed-tools", `${rel} sets allowed-tools (${m[1].trim() || "a list"}); the directory build ships none, and the directory accepts at most ${PERMITTED_ALLOWED_TOOLS.join(", ")}`);
    }
  }

  if (text.has(".claude-plugin/plugin.json")) {
    let manifest;
    try {
      manifest = JSON.parse(text.get(".claude-plugin/plugin.json"));
    } catch (err) {
      bad("manifest-parse", `.claude-plugin/plugin.json is not valid JSON: ${err.message}`);
    }
    if (manifest !== undefined && (manifest === null || typeof manifest !== "object" || Array.isArray(manifest))) {
      bad("manifest-parse", ".claude-plugin/plugin.json is not a JSON object");
      manifest = undefined;
    }
    if (manifest) {
      if (manifest.name !== "mnemoverse") bad("manifest-name", `name is ${JSON.stringify(manifest.name)}, expected "mnemoverse"`);
      if (manifest.version !== ctx.version) bad("manifest-version", `version is ${JSON.stringify(manifest.version)}, root is ${JSON.stringify(ctx.version)}`);
      if (typeof manifest.privacyPolicyUrl !== "string" || !/^https:\/\/\S+$/.test(manifest.privacyPolicyUrl)) {
        bad("manifest-privacy", `privacyPolicyUrl ${JSON.stringify(manifest.privacyPolicyUrl)} is not an https:// URL`);
      }
      const expected = { mnemoverse: { type: "http", url: ctx.serverUrl } };
      if (!deepEqual(manifest.mcpServers, expected)) {
        bad("manifest-mcp", `mcpServers is ${JSON.stringify(manifest.mcpServers)}, expected ${JSON.stringify(expected)}`);
      }
      for (const key of Object.keys(manifest)) {
        if (MANIFEST_FORBIDDEN_KEYS.includes(key)) bad("manifest-keys", `forbidden key "${key}"`);
        else if (!MANIFEST_KEYS.has(key)) bad("manifest-keys", `unexpected key "${key}"`);
      }
    }
  }

  for (const [rel, body] of text) {
    body.split("\n").forEach((line, i) => {
      for (const p of FORBIDDEN_TEXT) {
        if (p.re.test(line)) bad("forbidden-text", `${rel}:${i + 1} contains ${p.id}`);
      }
    });
  }

  if (text.has("README.md")) {
    const readme = text.get("README.md");
    const words = wordsOutsideCode(readme);
    if (words < ctx.config.readme.minWords) bad("readme-words", `README.md has ${words} words outside code, under ${ctx.config.readme.minWords}`);
    for (const phrase of ctx.config.readme.mustContain) {
      if (!readme.includes(phrase)) bad("readme-disclosure", `README.md does not contain "${phrase}"`);
    }
    const left = /\{\{|\}\}/.exec(readme);
    if (left) bad("readme-template", `README.md contains "${left[0]}", a template placeholder that was not filled`);
  }

  for (const { file, text: sentence } of ctx.config.refusalSentences) {
    if (!text.has(file) || !text.get(file).includes(sentence)) bad("refusal-kept", `${file} lost the refusal sentence "${sentence}"`);
  }

  return failures;
}

export function context(root = repoRoot) {
  const config = loadConfig(root);
  return { config, version: rootVersion(root), serverUrl: expectedServerUrl(config, root) };
}

// A copy of the sources build.mjs reads, for the build fixtures.
function sourceCopy(scratch) {
  const root = mkdtempSync(path.join(scratch, "src-"));
  for (const rel of [".claude-plugin", "skills", "commands", "LICENSE", "scripts/manifest-expected.json", "scripts/claude-directory"]) {
    cpSync(path.join(repoRoot, rel), path.join(root, rel), { recursive: true });
  }
  return root;
}

function treeListing(dir) {
  return walk(dir).map((e) => `${String(e.size).padStart(6)}  ${e.rel}`).join("\n");
}

async function main(argv) {
  const arg = (name) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const ctx = context();
  const scratch = mkdtempSync(path.join(tmpdir(), "claude-directory-"));
  let ok = true;
  try {
    let dir = arg("--dir");
    if (dir) {
      dir = path.resolve(dir);
    } else {
      dir = path.resolve(arg("--out") || path.join(scratch, "tree"));
      build(dir);
    }
    console.log(`Tree: ${dir}\n${treeListing(dir)}\n`);

    const failures = checkTree(dir, ctx);
    if (failures.length === 0) {
      console.log(`PASS  the tree meets all ${RULES.length} rules`);
    } else {
      ok = false;
      for (const f of failures) console.log(`FAIL  [${f.rule}] ${f.detail}`);
    }

    if (!argv.includes("--no-fixtures")) {
      const { treeFixtures, buildFixtures, buildPassingVariants, passingVariants, PINNED } = await import("./fixtures.mjs");
      console.log("\nNegative fixtures (each must be rejected):");
      const covered = new Set();
      for (const fx of treeFixtures(ctx)) {
        const copy = mkdtempSync(path.join(scratch, "fx-"));
        cpSync(dir, copy, { recursive: true, verbatimSymlinks: true });
        fx.mutate(copy);
        const got = checkTree(copy, ctx);
        const hit = got.some((f) => f.rule === fx.rule);
        if (hit) covered.add(fx.rule);
        else ok = false;
        console.log(`${hit ? "PASS" : "FAIL"}  [${fx.rule}] ${fx.name}${hit ? "" : ` (not rejected by ${fx.rule}; got ${got.map((f) => f.rule).join(", ") || "no failures"})`}`);
        rmSync(copy, { recursive: true, force: true });
      }
      for (const fx of passingVariants()) {
        const copy = mkdtempSync(path.join(scratch, "ok-"));
        cpSync(dir, copy, { recursive: true, verbatimSymlinks: true });
        fx.mutate(copy);
        const got = checkTree(copy, ctx);
        if (got.length) ok = false;
        console.log(`${got.length ? "FAIL" : "PASS"}  [accepted] ${fx.name}${got.length ? ` (rejected: ${got.map((f) => f.detail).join("; ")})` : ""}`);
        rmSync(copy, { recursive: true, force: true });
      }
      for (const rule of RULES) {
        if (!covered.has(rule)) {
          ok = false;
          console.log(`FAIL  [${rule}] no negative fixture proves this rule rejects anything`);
        }
      }
      for (const fx of buildFixtures()) {
        const root = sourceCopy(scratch);
        fx.mutate(root);
        let error = null;
        try {
          build(path.join(root, "out"), { root });
        } catch (err) {
          error = err;
        }
        const hit = error !== null && fx.expect.test(error.message);
        if (!hit) ok = false;
        console.log(`${hit ? "PASS" : "FAIL"}  [build] ${fx.name}${hit ? "" : ` (build ${error ? `failed with: ${error.message}` : "succeeded"})`}`);
      }
      for (const fx of buildPassingVariants()) {
        const root = sourceCopy(scratch);
        fx.mutate(root);
        let got;
        try {
          const out = path.join(root, "out");
          build(out, { root });
          got = checkTree(out, context(root)).map((f) => `[${f.rule}] ${f.detail}`);
          got.push(...(fx.verify ? fx.verify(out) : []));
        } catch (err) {
          got = [`build failed with: ${err.message}`];
        }
        if (got.length) ok = false;
        console.log(`${got.length ? "FAIL" : "PASS"}  [build-accepted] ${fx.name}${got.length ? ` (${got.join("; ")})` : ""}`);
      }
      // The rule data must equal the literals pinned in fixtures.mjs, so a
      // rule deleted from check.mjs or config.json cannot also delete the
      // fixtures that would have caught it.
      const setup = ctx.config.files.find((f) => f.to === "skills/setup/SKILL.md") || {};
      const live = {
        rules: RULES,
        forbiddenTextIds: FORBIDDEN_TEXT.map((p) => p.id),
        readmePhrases: ctx.config.readme.mustContain,
        refusalSentences: ctx.config.refusalSentences.map(({ file, text: t }) => ({ file, text: t })),
        setupHeadings: setup.expectedHeadings,
        setupSectionMustContain: setup.sectionMustContain,
      };
      for (const [key, want] of Object.entries(PINNED)) {
        const same = JSON.stringify(live[key]) === JSON.stringify(want);
        if (!same) ok = false;
        console.log(`${same ? "PASS" : "FAIL"}  [pinned] ${key} matches fixtures.mjs${same ? "" : `: live ${JSON.stringify(live[key])}, pinned ${JSON.stringify(want)}`}`);
      }
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
  console.log(ok ? "\nclaude-directory check passed" : "\nclaude-directory check FAILED");
  process.exit(ok ? 0 : 1);
}

if (isMain(import.meta.url)) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
