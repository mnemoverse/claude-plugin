#!/usr/bin/env node
// Commits a built Claude directory tree to the branch claude-directory.
//
//   node .github/scripts/claude-directory/publish.mjs --tree <dir> --ref <name> --sha <sha>
//       [--tag <tag>] [--remote origin] [--branch claude-directory] [--dry-run]
//
// The new commit's tree is exactly <dir> (the plugin is the branch root, with
// nothing else beside it) and its parent is the current head of the branch,
// or no parent when the branch does not exist yet. It is pushed as a plain
// fast-forward, never forced: if the branch moved meanwhile, the push is
// refused and nothing changes. A tree identical to the current head is not
// committed again. The working tree and the index of the checkout are not
// touched; the commit is built in a temporary index.
//
// --tag checks that the tag is "v" plus the plugin version, and refuses to
// publish different files under a version the branch already has. --dry-run
// builds the commit and prints it, without pushing.
//
// This file runs git, so it sits under .github/, outside the plugin packages
// that other hosts build from the repository tree (see .clawhubignore).
// test.mjs next to it tests these rules against a local bare repository.
//
// No dependencies. Node 20+.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { isMain, repoRoot } from "../../../scripts/claude-directory/build.mjs";
import { checkTree, context } from "../../../scripts/claude-directory/check.mjs";
import { compareVersions } from "./version.mjs";

function args(argv) {
  const out = { remote: "origin", branch: "claude-directory", dryRun: argv.includes("--dry-run") };
  for (const key of ["tree", "ref", "sha", "tag", "remote", "branch"]) {
    const i = argv.indexOf(`--${key}`);
    if (i >= 0) out[key] = argv[i + 1];
  }
  for (const key of ["tree", "ref", "sha"]) {
    if (!out[key]) throw new Error(`--${key} is required`);
  }
  return out;
}

function listFiles(dir) {
  const out = [];
  const visit = (rel) => {
    for (const e of readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      const child = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) visit(child);
      else out.push(child);
    }
  };
  visit("");
  return out.sort();
}

export function publish(opts, { cwd = repoRoot, log = console.log } = {}) {
  const treeDir = path.resolve(opts.tree);
  const gitDir = execFileSync("git", ["rev-parse", "--absolute-git-dir"], { cwd, encoding: "utf8" }).trim();
  const scratch = mkdtempSync(path.join(tmpdir(), "claude-directory-publish-"));
  const env = { ...process.env, GIT_INDEX_FILE: path.join(scratch, "index") };
  const git = (argv, extra = {}) =>
    execFileSync("git", [`--git-dir=${gitDir}`, ...argv], { cwd, env, encoding: "utf8", ...extra }).trim();
  try {
    const failures = checkTree(treeDir, context(cwd));
    if (failures.length) {
      throw new Error(`the tree does not pass check.mjs:\n${failures.map((f) => `  [${f.rule}] ${f.detail}`).join("\n")}`);
    }
    const version = JSON.parse(readFileSync(path.join(treeDir, ".claude-plugin", "plugin.json"), "utf8")).version;
    if (opts.tag && opts.tag !== `v${version}`) {
      throw new Error(`tag ${opts.tag} does not match the plugin version ${version}`);
    }

    // The current head of the branch, if it exists.
    let parent = null;
    const lsRemote = execFileSync("git", [`--git-dir=${gitDir}`, "ls-remote", "--heads", opts.remote, `refs/heads/${opts.branch}`],
      { cwd, encoding: "utf8" }).trim();
    if (lsRemote) {
      const head = lsRemote.split(/\s+/)[0];
      git(["fetch", "--no-tags", "--depth=1", opts.remote, `+refs/heads/${opts.branch}:refs/claude-directory/previous`]);
      parent = git(["rev-parse", "refs/claude-directory/previous"]);
      if (parent !== head) throw new Error(`fetched ${parent}, but the remote reported ${head}`);
    }

    // Stage exactly the built tree in a temporary index and write it.
    execFileSync("git", [`--git-dir=${gitDir}`, `--work-tree=${treeDir}`, "add", "--all", "--force", "."],
      { cwd: treeDir, env, encoding: "utf8" });
    const tree = git(["write-tree"]);
    const inTree = git(["ls-tree", "-r", "--name-only", tree]).split("\n").filter(Boolean).sort();
    const onDisk = listFiles(treeDir);
    if (JSON.stringify(inTree) !== JSON.stringify(onDisk)) {
      throw new Error(`the written tree differs from ${treeDir}`);
    }

    if (parent) {
      const parentTree = git(["rev-parse", `${parent}^{tree}`]);
      if (parentTree === tree) {
        log(`${opts.branch} at ${parent} already holds this tree (${tree}); nothing to publish.`);
        return { pushed: false, commit: parent, tree, parent };
      }
      const previous = JSON.parse(git(["show", `${parent}:.claude-plugin/plugin.json`])).version;
      const order = compareVersions(version, previous);
      if (order < 0) throw new Error(`version ${version} is lower than ${previous} on ${opts.branch}`);
      if (order === 0 && opts.tag) {
        throw new Error(`${opts.branch} already has version ${version} with different files; tag ${opts.tag} cannot publish them, release a higher version`);
      }
      if (order === 0) {
        log(`::warning::${opts.branch} already has version ${version} with different files; the directory expects a higher version for each release.`);
      }
    }

    const message = `release ${version}, generated from ${opts.ref}@${opts.sha}`;
    const commitArgs = ["commit-tree", tree, ...(parent ? ["-p", parent] : []), "-m", message];
    const commit = git(commitArgs);
    log(`commit ${commit}\n  tree    ${tree}\n  parent  ${parent || "(none: first release on this branch)"}\n  message ${message}`);
    if (opts.dryRun) {
      log(`dry run: not pushing to ${opts.remote} ${opts.branch}`);
      return { pushed: false, commit, tree, parent };
    }
    // A plain push: the remote accepts it only as a fast-forward.
    execFileSync("git", [`--git-dir=${gitDir}`, "push", opts.remote, `${commit}:refs/heads/${opts.branch}`],
      { cwd, stdio: "inherit" });
    log(`pushed ${commit} to ${opts.remote} ${opts.branch}`);
    return { pushed: true, commit, tree, parent };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

if (isMain(import.meta.url)) {
  try {
    publish(args(process.argv.slice(2)));
  } catch (err) {
    console.error(`publish failed: ${err.message}`);
    process.exit(1);
  }
}
