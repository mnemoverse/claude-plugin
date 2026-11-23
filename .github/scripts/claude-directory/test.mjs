#!/usr/bin/env node
// Tests for the release side of the Claude directory build: the SemVer
// ordering, the rules publish.mjs enforces against a real (local, bare) git
// remote, and that every entry point still runs when it is started through a
// symbolic link.
//
//   node .github/scripts/claude-directory/test.mjs
//
// This file and publish.mjs live under .github/ on purpose: they run git, so
// they stay out of the plugin packages that other hosts build from the
// repository tree (see .clawhubignore). The release workflow's dry-run job
// runs this file.
//
// No dependencies. Node 20+.

import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { build, repoRoot } from "../../../scripts/claude-directory/build.mjs";
import { publish } from "./publish.mjs";
import { compareVersions, VERSION_ORDER_CASES } from "./version.mjs";

let failed = 0;
function report(ok, name, detail = "") {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : ` (${detail})`}`);
}
function expectThrow(name, fn, re) {
  try {
    fn();
    report(false, name, "did not throw");
  } catch (err) {
    report(re.test(err.message), name, `threw: ${err.message}`);
  }
}

// --- SemVer ordering.
for (const [a, b, want] of VERSION_ORDER_CASES) {
  const got = compareVersions(a, b);
  report(got === want, `[version-order] ${a} vs ${b} is ${want}`, `got ${got}`);
}

const scratch = realpathSync(mkdtempSync(path.join(tmpdir(), "claude-directory-test-")));
const git = (cwd, ...argv) => execFileSync("git", argv, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

// The sources build.mjs and check.mjs read, copied so their version and text
// can be changed per scenario without touching this checkout.
const SOURCES = [".claude-plugin", "skills", "commands", "LICENSE", "scripts/manifest-expected.json", "scripts/claude-directory"];

try {
  process.env.GIT_AUTHOR_NAME = process.env.GIT_COMMITTER_NAME = "test";
  process.env.GIT_AUTHOR_EMAIL = process.env.GIT_COMMITTER_EMAIL = "test@example.invalid";

  // --- Entry points started through a symbolic link.
  const links = path.join(scratch, "links");
  mkdirSync(links);
  const link = (rel) => {
    const p = path.join(links, path.basename(rel));
    symlinkSync(path.join(repoRoot, rel), p);
    return p;
  };
  const viaBuild = path.join(scratch, "via-link");
  let r = spawnSync(process.execPath, [link("scripts/claude-directory/build.mjs"), "--out", viaBuild], { encoding: "utf8" });
  report(r.status === 0 && /files written to/.test(r.stdout), "[entry-point] build.mjs through a symlink writes the tree",
    `exit ${r.status}, stdout ${JSON.stringify(r.stdout.slice(0, 200))}`);
  r = spawnSync(process.execPath, [link("scripts/claude-directory/check.mjs"), "--dir", viaBuild, "--no-fixtures"], { encoding: "utf8" });
  report(r.status === 0 && /claude-directory check passed/.test(r.stdout), "[entry-point] check.mjs through a symlink checks the tree",
    `exit ${r.status}, stdout ${JSON.stringify(r.stdout.slice(-200))}`);
  r = spawnSync(process.execPath, [link(".github/scripts/claude-directory/publish.mjs")], { encoding: "utf8" });
  report(r.status === 1 && /--tree is required/.test(r.stderr), "[entry-point] publish.mjs through a symlink parses its arguments",
    `exit ${r.status}, stderr ${JSON.stringify(r.stderr.slice(0, 200))}`);

  // --- publish.mjs against a bare remote.
  const bare = path.join(scratch, "remote.git");
  git(scratch, "init", "--bare", "-q", bare);
  const remote = `file://${bare}`;
  const work = path.join(scratch, "work");
  for (const rel of SOURCES) cpSync(path.join(repoRoot, rel), path.join(work, rel), { recursive: true });
  git(work, "init", "-q");
  git(work, "add", "-A");
  git(work, "commit", "-q", "-m", "sources");
  const sha = git(work, "rev-parse", "HEAD");
  const manifestPath = path.join(work, ".claude-plugin", "plugin.json");
  const setVersion = (v) => {
    const m = JSON.parse(readFileSync(manifestPath, "utf8"));
    m.version = v;
    writeFileSync(manifestPath, `${JSON.stringify(m, null, 2)}\n`);
  };
  let n = 0;
  const tree = () => {
    const out = path.join(scratch, `tree-${n++}`);
    build(out, { root: work });
    return out;
  };
  const quiet = { cwd: work, log: () => {} };
  const run = (opts) => publish({ ref: "test", sha, remote, branch: "claude-directory", ...opts }, quiet);
  const head = () => {
    const line = git(work, "ls-remote", "--heads", remote, "refs/heads/claude-directory");
    return line ? line.split(/\s+/)[0] : null;
  };
  const statusBefore = git(work, "status", "--porcelain=v1", "--untracked-files=all");

  setVersion("1.0.5");
  let t = tree();
  const dry = run({ tree: t, dryRun: true });
  report(dry.pushed === false && head() === null, "[publish] a dry run pushes nothing");

  expectThrow("[publish] a tag that is not v<version> is refused", () => run({ tree: t, tag: "v9.9.9" }), /does not match the plugin version 1\.0\.5/);
  report(head() === null, "[publish] the refused tag pushed nothing");

  const first = run({ tree: t, tag: "v1.0.5" });
  report(first.pushed && first.parent === null && head() === first.commit, "[publish] first release: a new branch whose commit has no parent");
  const files = git(work, "ls-tree", "-r", "--name-only", first.commit).split("\n").sort();
  report(files.includes(".claude-plugin/plugin.json") && !files.some((f) => f.startsWith("scripts/")),
    "[publish] the release commit holds exactly the built tree", files.join(", "));

  const again = run({ tree: tree(), tag: "v1.0.5" });
  report(!again.pushed && again.commit === first.commit && head() === first.commit, "[publish] a rerun on the same tree is a no-op");

  setVersion("1.0.6");
  const second = run({ tree: tree(), tag: "v1.0.6" });
  report(second.pushed && second.parent === first.commit && head() === second.commit, "[publish] a higher version fast-forwards onto the previous release");

  setVersion("1.0.5");
  expectThrow("[publish] a lower version is refused", () => run({ tree: tree() }), /1\.0\.5 is lower than 1\.0\.6/);

  setVersion("1.0.6");
  const skill = path.join(work, "skills", "memory-save", "SKILL.md");
  writeFileSync(skill, `${readFileSync(skill, "utf8")}\nOne more line.\n`);
  const changed = tree();
  expectThrow("[publish] the same version with different files is refused when a tag is set",
    () => run({ tree: changed, tag: "v1.0.6" }), /already has version 1\.0\.6 with different files/);
  report(head() === second.commit, "[publish] the refused same-version release pushed nothing");

  const bad = tree();
  writeFileSync(path.join(bad, "package.json"), "{}\n");
  expectThrow("[publish] a tree that fails check.mjs is refused", () => run({ tree: bad }), /does not pass check\.mjs/);

  git(work, "checkout", "-q", "--", ".");
  report(git(work, "status", "--porcelain=v1", "--untracked-files=all") === statusBefore,
    "[publish] the checkout's working tree and index are left as they were");
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

console.log(failed ? `\n${failed} release test(s) FAILED` : "\nrelease tests passed");
process.exit(failed ? 1 : 0);
