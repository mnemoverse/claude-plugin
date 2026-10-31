#!/usr/bin/env node
// Manifest drift guard.
//
// Twelve MCP-server manifests, across nine files in this repo and two more
// repos, all declare the same hosted server URL. Each host also mandates its
// own dialect for the fields around that URL (see README.md, "Why .mcp.json
// says http and mcp.json says streamable-http"). This script asserts both:
// the URL is the single constant in manifest-expected.json everywhere it
// appears, and each file's shape still matches the fixture that was last
// verified against that host's own docs.
//
// The Google Antigravity plugin in antigravity/ must be self-contained (the
// Marketplace bundles only that folder), so it carries a copy of skills/.
// The script also asserts that the copy is byte-identical to skills/ and that
// antigravity/plugin.json has the same version as plugin.json.
//
// No dependencies. Node 20+ (uses global fetch).

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const offline = process.argv.includes("--offline");

const RAW_BASE = "https://raw.githubusercontent.com";
const FETCH_TIMEOUT_MS = 10_000;

const expected = JSON.parse(
  readFileSync(path.join(__dirname, "manifest-expected.json"), "utf8")
);

// Each manifest: where to read it from, which fixture carries its expected
// discriminator shape, and (if it carries the server URL directly) the path
// to that field so it can be compared against the shared constant.
const manifests = [
  { file: ".mcp.json", kind: "local", local: ".mcp.json",
    fixture: "dot-mcp-json.expected.json",
    urlPath: ["mcpServers", "mnemoverse", "url"] },
  { file: "mcp.json", kind: "local", local: "mcp.json",
    fixture: "root-mcp-json.expected.json",
    urlPath: ["mcpServers", "mnemoverse", "url"] },
  { file: "plugin.json", kind: "local", local: "plugin.json",
    fixture: "root-plugin-json.expected.json",
    urlPath: null },
  { file: "kimi.plugin.json", kind: "local", local: "kimi.plugin.json",
    fixture: "kimi-plugin-json.expected.json",
    urlPath: ["mcpServers", "mnemoverse", "url"] },
  { file: "openclaw.plugin.json", kind: "local", local: "openclaw.plugin.json",
    fixture: "openclaw-plugin-json.expected.json",
    urlPath: null },
  { file: ".claude-plugin/plugin.json", kind: "local", local: ".claude-plugin/plugin.json",
    fixture: "claude-plugin-manifest.expected.json",
    urlPath: null },
  { file: "mcp_config.json", kind: "local", local: "mcp_config.json",
    fixture: "root-mcp-config-json.expected.json",
    urlPath: ["mcpServers", "mnemoverse", "serverUrl"] },
  { file: "antigravity/plugin.json", kind: "local", local: "antigravity/plugin.json",
    fixture: "antigravity-plugin-json.expected.json",
    urlPath: null },
  { file: "antigravity/mcp_config.json", kind: "local", local: "antigravity/mcp_config.json",
    fixture: "antigravity-mcp-config-json.expected.json",
    urlPath: ["mcpServers", "mnemoverse", "serverUrl"] },
  { file: "cursor-plugin/.cursor-plugin/plugin.json", kind: "remote",
    url: `${RAW_BASE}/mnemoverse/cursor-plugin/main/.cursor-plugin/plugin.json`,
    fixture: "cursor-plugin-json.expected.json",
    urlPath: null },
  { file: "cursor-plugin/mcp.json", kind: "remote",
    url: `${RAW_BASE}/mnemoverse/cursor-plugin/main/mcp.json`,
    fixture: "cursor-mcp-json.expected.json",
    urlPath: ["mcpServers", "mnemoverse", "url"] },
  { file: "gemini-extension/gemini-extension.json", kind: "remote",
    url: `${RAW_BASE}/mnemoverse/gemini-extension/main/gemini-extension.json`,
    fixture: "gemini-extension-json.expected.json",
    urlPath: ["mcpServers", "mnemoverse", "httpUrl"] },
];

function getPath(obj, segments) {
  return segments.reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

function runCheck(data, check) {
  const val = getPath(data, check.path || []);
  switch (check.kind) {
    case "equals":
      return val === check.expect
        ? { pass: true, detail: JSON.stringify(val) }
        : { pass: false, detail: `expected ${JSON.stringify(check.expect)}, got ${JSON.stringify(val)}` };
    case "present":
      return val !== undefined
        ? { pass: true, detail: JSON.stringify(val) }
        : { pass: false, detail: "missing" };
    case "absent":
      return val === undefined
        ? { pass: true, detail: "absent" }
        : { pass: false, detail: `unexpectedly present: ${JSON.stringify(val)}` };
    case "keysSubset": {
      if (val === null || typeof val !== "object" || Array.isArray(val)) {
        return { pass: false, detail: "target is not an object" };
      }
      const extra = Object.keys(val).filter((k) => !check.allowed.includes(k));
      return extra.length === 0
        ? { pass: true, detail: `keys ⊆ {${check.allowed.join(",")}}` }
        : { pass: false, detail: `unexpected keys: ${extra.join(",")}` };
    }
    case "requiredPresent": {
      if (val === null || typeof val !== "object" || Array.isArray(val)) {
        return { pass: false, detail: "target is not an object" };
      }
      const missing = check.required.filter((k) => !Object.hasOwn(val, k));
      return missing.length === 0
        ? { pass: true, detail: "all required present" }
        : { pass: false, detail: `missing: ${missing.join(",")}` };
    }
    default:
      return { pass: false, detail: `unknown check kind '${check.kind}'` };
  }
}

async function loadLocal(manifest) {
  const raw = readFileSync(path.join(repoRoot, manifest.local), "utf8");
  return JSON.parse(raw);
}

async function loadRemote(manifest) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(manifest.url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return JSON.parse(await res.text());
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const rows = [];
  let hadFailure = false;

  for (const manifest of manifests) {
    if (manifest.kind === "remote" && offline) {
      rows.push([manifest.file, "fetch", "SKIP", "--offline: remote file not checked"]);
      continue;
    }

    let data;
    try {
      data = manifest.kind === "local" ? await loadLocal(manifest) : await loadRemote(manifest);
    } catch (err) {
      const where = manifest.kind === "local" ? manifest.local : manifest.url;
      console.error(`\nFailed to load ${manifest.file} (${where}): ${err.message}`);
      if (manifest.kind === "remote") {
        console.error("Run with --offline to skip remote manifests, or check network/GitHub availability.");
      }
      rows.push([manifest.file, "load", "FAIL", err.message]);
      hadFailure = true;
      continue;
    }

    const fixture = JSON.parse(
      readFileSync(path.join(__dirname, "fixtures", manifest.fixture), "utf8")
    );

    for (const check of fixture.checks) {
      const { pass, detail } = runCheck(data, check);
      rows.push([manifest.file, check.name, pass ? "PASS" : "FAIL", detail]);
      if (!pass) hadFailure = true;
    }

    if (manifest.urlPath) {
      const { pass, detail } = runCheck(data, {
        kind: "equals",
        path: manifest.urlPath,
        expect: expected.serverUrl,
      });
      rows.push([manifest.file, "server URL matches manifest-expected.json", pass ? "PASS" : "FAIL", detail]);
      if (!pass) hadFailure = true;
    }
  }

  for (const row of antigravityMirrorRows()) {
    rows.push(row);
    if (row[2] !== "PASS") hadFailure = true;
  }

  printTable(rows);
  process.exit(hadFailure ? 1 : 0);
}

// Every file under dir, as sorted paths relative to dir with "/" separators.
function listFiles(dir) {
  const out = [];
  const walk = (rel) => {
    for (const entry of readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      const child = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(child);
      else out.push(child);
    }
  };
  walk("");
  return out.sort();
}

// antigravity/skills must stay a byte-identical copy of skills/, and
// antigravity/plugin.json must carry the same version as plugin.json.
function antigravityMirrorRows() {
  const rows = [];
  const src = path.join(repoRoot, "skills");
  const dst = path.join(repoRoot, "antigravity", "skills");
  try {
    const a = listFiles(src);
    const b = listFiles(dst);
    const inB = new Set(b);
    const inA = new Set(a);
    const problems = [
      ...a.filter((f) => !inB.has(f)).map((f) => `missing ${f}`),
      ...b.filter((f) => !inA.has(f)).map((f) => `extra ${f}`),
      ...a.filter((f) => inB.has(f) &&
        !readFileSync(path.join(src, f)).equals(readFileSync(path.join(dst, f))))
        .map((f) => `differs ${f}`),
    ];
    rows.push(["antigravity/skills", "byte-identical copy of skills/",
      problems.length ? "FAIL" : "PASS",
      problems.length ? problems.join("; ") : `${a.length} files`]);
  } catch (err) {
    rows.push(["antigravity/skills", "byte-identical copy of skills/", "FAIL", err.message]);
  }
  try {
    const rootVersion = JSON.parse(readFileSync(path.join(repoRoot, "plugin.json"), "utf8")).version;
    const agVersion = JSON.parse(
      readFileSync(path.join(repoRoot, "antigravity", "plugin.json"), "utf8")
    ).version;
    rows.push(["antigravity/plugin.json", "version matches plugin.json",
      agVersion === rootVersion ? "PASS" : "FAIL",
      `${JSON.stringify(agVersion)} vs ${JSON.stringify(rootVersion)}`]);
  } catch (err) {
    rows.push(["antigravity/plugin.json", "version matches plugin.json", "FAIL", err.message]);
  }
  return rows;
}

function printTable(rows) {
  const headers = ["file", "check", "result", "detail"];
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
  const fmt = (cols) => cols.map((c, i) => String(c).padEnd(widths[i])).join(" | ");
  console.log(fmt(headers));
  console.log(widths.map((w) => "-".repeat(w)).join("-|-"));
  for (const row of rows) console.log(fmt(row));
}

// `--selftest` exercises runCheck() against malformed inputs (a string, an
// array, null) that a remote host could plausibly return as valid JSON,
// instead of the well-formed objects every real manifest happens to be.
// It asserts requiredPresent/keysSubset FAIL cleanly with "target is not an
// object" rather than throwing (the `in` operator throws on a non-object
// right-hand side), and that a real object still passes normally.
function selftest() {
  const cases = [
    { label: "requiredPresent rejects a bare string", data: "invalid",
      check: { kind: "requiredPresent", required: ["name"] }, expectPass: false },
    { label: "requiredPresent rejects an array", data: ["invalid"],
      check: { kind: "requiredPresent", required: ["name"] }, expectPass: false },
    { label: "requiredPresent rejects null", data: null,
      check: { kind: "requiredPresent", required: ["name"] }, expectPass: false },
    { label: "requiredPresent accepts a real object", data: { name: "x" },
      check: { kind: "requiredPresent", required: ["name"] }, expectPass: true },
    { label: "keysSubset rejects a bare string", data: "invalid",
      check: { kind: "keysSubset", allowed: ["name"] }, expectPass: false },
    { label: "keysSubset rejects an array", data: ["invalid"],
      check: { kind: "keysSubset", allowed: ["name"] }, expectPass: false },
    { label: "keysSubset accepts a real object", data: { name: "x" },
      check: { kind: "keysSubset", allowed: ["name"] }, expectPass: true },
  ];

  let ok = true;
  for (const c of cases) {
    let pass, detail;
    try {
      ({ pass, detail } = runCheck(c.data, c.check));
    } catch (err) {
      pass = false;
      detail = `threw: ${err.message}`;
    }
    const result = pass === c.expectPass ? "PASS" : "FAIL";
    if (result === "FAIL") ok = false;
    console.log(`${result}  ${c.label} -> ${detail}`);
  }
  process.exit(ok ? 0 : 1);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  main().catch((err) => {
    console.error("Unexpected error:", err);
    process.exit(1);
  });
}
