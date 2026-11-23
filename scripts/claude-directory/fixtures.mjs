// Negative fixtures for check.mjs. Each tree fixture takes a copy of a
// freshly built, passing tree, breaks exactly one thing, and names the rule
// that must reject it. Each build fixture breaks one root source in a copy
// and expects build.mjs to stop with the named error. check.mjs fails when a
// fixture is accepted or when a rule has no fixture.

import { mkdirSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { FORBIDDEN_TEXT, MAX_FILE_BYTES, MAX_FILES } from "./check.mjs";

const SKILL = "skills/memory-save/SKILL.md";

function put(dir, rel, contents) {
  mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  writeFileSync(path.join(dir, rel), contents);
}

function edit(dir, rel, fn) {
  const p = path.join(dir, rel);
  writeFileSync(p, fn(readFileSync(p, "utf8")));
}

function editManifest(dir, fn) {
  edit(dir, ".claude-plugin/plugin.json", (t) => {
    const m = JSON.parse(t);
    fn(m);
    return JSON.stringify(m, null, 2);
  });
}

export function treeFixtures(ctx) {
  const fixtures = [
    { rule: "required-files", name: "LICENSE removed", mutate: (d) => unlinkSync(path.join(d, "LICENSE")) },
    { rule: "required-files", name: "README.md removed", mutate: (d) => unlinkSync(path.join(d, "README.md")) },
    { rule: "regular-files", name: "a reference that is a symbolic link",
      mutate: (d) => {
        mkdirSync(path.join(d, "skills/memory-save/references"), { recursive: true });
        symlinkSync("../../../LICENSE", path.join(d, "skills/memory-save/references/link.md"));
      } },
    { rule: "allowlist", name: "a notes file at the top level", mutate: (d) => put(d, "NOTES.md", "notes\n") },
    { rule: "allowlist", name: "a skill file outside SKILL.md and references/", mutate: (d) => put(d, "skills/memory-save/extra.md", "x\n") },
    { rule: "allowlist", name: "a second manifest file", mutate: (d) => put(d, ".claude-plugin/marketplace.json", "{}\n") },
    { rule: "dotfile", name: "a .mcp.json beside the manifest", mutate: (d) => put(d, ".mcp.json", "{}\n") },
    { rule: "dotfile", name: "a .DS_Store inside a skill", mutate: (d) => put(d, "skills/memory-save/.DS_Store", "x") },
    { rule: "file-type", name: "package.json", mutate: (d) => put(d, "package.json", "{}\n") },
    { rule: "file-type", name: "package-lock.json", mutate: (d) => put(d, "package-lock.json", "{}\n") },
    { rule: "file-type", name: "a .mjs script", mutate: (d) => put(d, "scripts/run.mjs", "export {};\n") },
    { rule: "file-type", name: "a .py script", mutate: (d) => put(d, "skills/memory-save/run.py", "pass\n") },
    { rule: "file-type", name: "a .sh script", mutate: (d) => put(d, "hooks/run.sh", "true\n") },
    { rule: "file-type", name: "a .js file", mutate: (d) => put(d, "server.js", "\n") },
    { rule: "file-type", name: "an image", mutate: (d) => put(d, "assets/icon.png", "x") },
    { rule: "file-size", name: `a reference over ${MAX_FILE_BYTES} bytes`,
      mutate: (d) => put(d, "skills/memory-save/references/big.md", "a ".repeat(MAX_FILE_BYTES / 2 + 1)) },
    { rule: "file-count", name: `more than ${MAX_FILES} files`,
      mutate: (d) => { for (let i = 0; i < MAX_FILES; i++) put(d, `skills/memory-save/references/r${i}.md`, "x\n"); } },
    { rule: "allowed-tools", name: "allowed-tools: Read, Write in a skill",
      mutate: (d) => edit(d, SKILL, (t) => t.replace(/^---\n/, "---\nallowed-tools: Read, Write\n")) },
    { rule: "allowed-tools", name: "allowed-tools as a YAML list in a command",
      mutate: (d) => edit(d, "commands/recall.md", (t) => t.replace(/^---\n/, "---\nallowed-tools:\n  - Read\n")) },
    { rule: "manifest-parse", name: "plugin.json that is not JSON", mutate: (d) => put(d, ".claude-plugin/plugin.json", "{ name: mnemoverse\n") },
    { rule: "manifest-parse", name: "plugin.json that is a JSON array", mutate: (d) => put(d, ".claude-plugin/plugin.json", "[]\n") },
    { rule: "manifest-name", name: "a renamed plugin", mutate: (d) => editManifest(d, (m) => { m.name = "mnemoverse-memory"; }) },
    { rule: "manifest-version", name: "a version that differs from the root", mutate: (d) => editManifest(d, (m) => { m.version = `${ctx.version}-x`; }) },
    { rule: "manifest-privacy", name: "no privacyPolicyUrl", mutate: (d) => editManifest(d, (m) => { delete m.privacyPolicyUrl; }) },
    { rule: "manifest-privacy", name: "an http:// privacyPolicyUrl",
      mutate: (d) => editManifest(d, (m) => { m.privacyPolicyUrl = m.privacyPolicyUrl.replace("https://", "http://"); }) },
    { rule: "manifest-mcp", name: "mcpServers as a path to a file", mutate: (d) => editManifest(d, (m) => { m.mcpServers = "./.mcp.json"; }) },
    { rule: "manifest-mcp", name: "another server URL",
      mutate: (d) => editManifest(d, (m) => { m.mcpServers.mnemoverse.url = "https://example.com/mcp"; }) },
    { rule: "manifest-mcp", name: "headers on the server",
      mutate: (d) => editManifest(d, (m) => { m.mcpServers.mnemoverse.headers = { "X-Test": "1" }; }) },
    { rule: "manifest-mcp", name: "a second server",
      mutate: (d) => editManifest(d, (m) => { m.mcpServers.other = { type: "http", url: ctx.serverUrl }; }) },
  ];
  for (const key of ["userConfig", "hooks", "env", "headers", "lspServers", "skills"]) {
    fixtures.push({ rule: "manifest-keys", name: `manifest key ${key}`, mutate: (d) => editManifest(d, (m) => { m[key] = {}; }) });
  }
  for (const p of FORBIDDEN_TEXT) {
    fixtures.push({ rule: "forbidden-text", name: `text ${p.id} in a skill`,
      mutate: (d) => edit(d, SKILL, (t) => `${t}\n${p.sample}\n`) });
  }
  fixtures.push(
    { rule: "readme-words", name: "a README under 40 words outside code",
      mutate: (d) => put(d, "README.md", `# Mnemoverse Memory\n\nShort.\n\n\`\`\`\n${"word ".repeat(80)}\n\`\`\`\n`) },
  );
  for (const phrase of ctx.config.readme.mustContain) {
    fixtures.push({ rule: "readme-disclosure", name: `README without "${phrase}"`,
      mutate: (d) => edit(d, "README.md", (t) => t.split(phrase).join("")) });
  }
  for (const { file, text } of ctx.config.refusalSentences) {
    fixtures.push({ rule: "refusal-kept", name: `${file} without its refusal sentence`,
      mutate: (d) => edit(d, file, (t) => t.split(text).join("")) });
  }
  return fixtures;
}

const SETUP = "skills/setup/SKILL.md";

export function buildFixtures() {
  return [
    { name: "a required heading renamed in the root setup skill", expect: /required heading "### Claude Code" is missing/,
      mutate: (r) => edit(r, SETUP, (t) => t.replace("### Claude Code\n", "### Claude Code CLI\n")) },
    { name: "a section to drop no longer exists", expect: /drop-section: expected exactly one heading "### Hermes Agent"/,
      mutate: (r) => edit(r, SETUP, (t) => t.replace("### Hermes Agent\n", "### Hermes\n")) },
    { name: "a sentence to rewrite was reworded", expect: /replace: expected exactly one occurrence/,
      mutate: (r) => edit(r, SETUP, (t) => t.replace("as on Hermes Agent.", "as Hermes Agent does.")) },
    { name: "the paragraph to drop appears twice", expect: /drop-paragraph: expected exactly one paragraph/,
      mutate: (r) => edit(r, SETUP, (t) => t.replace("## If verification fails\n", "Or run claude mcp add again.\n\n## If verification fails\n")) },
    { name: "new Hermes text in a kept section", expect: /generated copy still contains "Hermes"/,
      mutate: (r) => edit(r, SETUP, (t) => t.replace("## Privacy\n", "## Privacy\n\nHermes keeps its own entry.\n")) },
    { name: "the root manifest renamed", expect: /name is "other"/,
      mutate: (r) => edit(r, ".claude-plugin/plugin.json", (t) => t.replace('"name": "mnemoverse"', '"name": "other"')) },
    { name: "a root privacyPolicyUrl that differs from config.json", expect: /privacyPolicyUrl .* differs/,
      mutate: (r) => edit(r, ".claude-plugin/plugin.json", (t) => t.replace("/docs/legal/privacy-policy", "/privacy")) },
    { name: "a source file the config lists is missing", expect: /ENOENT/,
      mutate: (r) => rmSync(path.join(r, "skills/memory-search"), { recursive: true }) },
    { name: "an unknown README placeholder", expect: /unknown placeholder \{\{nope\}\}/,
      mutate: (r) => edit(r, "scripts/claude-directory/README.template.md", (t) => `${t}\n{{nope}}\n`) },
  ];
}
