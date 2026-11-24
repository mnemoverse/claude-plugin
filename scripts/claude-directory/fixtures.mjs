// Negative fixtures for check.mjs. Each tree fixture takes a copy of a
// freshly built, passing tree, breaks exactly one thing, and names the rule
// that must reject it. Each build fixture breaks one root source in a copy
// and expects build.mjs to stop with the named error. check.mjs fails when a
// fixture is accepted or when a rule has no fixture.
//
// The fixtures are generated from the live rule lists, so PINNED below
// repeats those lists as literals: check.mjs fails when a live list differs,
// and a rule cannot be deleted together with the fixtures that test it.
// Change a rule and its line here in the same commit.

import { mkdirSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { FORBIDDEN_TEXT, MAX_FILE_BYTES, MAX_FILES } from "./check.mjs";

const SKILL = "skills/memory-save/SKILL.md";
const CONNECTORS = "listed on the plugin's **Connectors** tab in **Customize > Plugins**";

export const PINNED = {
  rules: [
    "required-files", "regular-files", "allowlist", "dotfile", "file-type", "file-size",
    "file-count", "frontmatter", "allowed-tools", "manifest-parse", "manifest-name", "manifest-version",
    "manifest-privacy", "manifest-mcp", "manifest-keys", "forbidden-text", "readme-words",
    "readme-disclosure", "readme-template", "refusal-kept",
  ],
  forbiddenTextIds: [
    "MNEMOVERSE_API_KEY", "mk_live", "Bearer", "Authorization:", "~/", "$HOME", "process.env",
    "os.environ", "${", "claude mcp add", "--header", "npx", "uvx",
  ],
  readmePhrases: [
    "https://mcp.mnemoverse.com/mcp",
    "OAuth",
    "## What is sent, and when",
    "`README.md`, `CLAUDE.md`, `AGENTS.md`",
    "saves a summary",
    "https://mnemoverse.com/docs/legal/privacy-policy",
    CONNECTORS,
    "https://mnemoverse.com/docs/api/claude-apps",
  ],
  refusalSentences: [
    { file: "skills/memory-save/SKILL.md", text: "Never store passwords, API keys, tokens, payment data, MFA codes, government IDs or health records." },
    { file: "skills/setup/SKILL.md", text: "Never store passwords, API keys, tokens, payment data, MFA codes, government IDs or health records." },
    { file: "commands/remember.md", text: "Never store secrets, API keys, passwords, payment data, or personal identifiers." },
  ],
  setupHeadings: [
    "# Connecting Mnemoverse memory",
    "## Check first",
    "## If tools or sign-in are missing",
    "### Claude Code",
    "### Claude apps and Cowork",
    "## If verification fails",
    "## What the connection exposes",
    "## Privacy",
  ],
  setupSectionMustContain: {
    "### Claude Code": ["`/mcp`", "Authenticate", "`memory:read`"],
    "### Claude apps and Cowork": [CONNECTORS, "https://mnemoverse.com/docs/api/claude-apps"],
  },
};

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
    { rule: "required-files", name: "a configured skill and command removed",
      mutate: (d) => {
        rmSync(path.join(d, "skills/memory-search"), { recursive: true });
        unlinkSync(path.join(d, "commands/recall.md"));
      } },
    { rule: "manifest-mcp", name: "a server under another name",
      mutate: (d) => editManifest(d, (m) => { m.mcpServers = { memory: m.mcpServers.mnemoverse }; }) },
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
    { rule: "allowed-tools", name: "allowed-tools in a skill with CRLF line endings",
      mutate: (d) => edit(d, SKILL, (t) => t.replace(/^---\n/, "---\nallowed-tools: Read, Write\n").replace(/\n/g, "\r\n")) },
    { rule: "allowed-tools", name: "allowed-tools in a skill that starts with a BOM",
      mutate: (d) => edit(d, SKILL, (t) => `\uFEFF${t.replace(/^---\n/, "---\nallowed-tools: Read, Write\n")}`) },
    { rule: "allowed-tools", name: "allowed-tools as a quoted key in a command",
      mutate: (d) => edit(d, "commands/recall.md", (t) => t.replace(/^---\n/, '---\n"allowed-tools": [Read, Write]\n')) },
    { rule: "frontmatter", name: "a skill without a front matter block",
      mutate: (d) => edit(d, SKILL, (t) => t.replace(/^---\n[\s\S]*?\n---\n/, "")) },
    { rule: "frontmatter", name: "a command whose front matter is never closed",
      mutate: (d) => edit(d, "commands/recall.md", (t) => t.replace(/\n---\n/, "\n")) },
    { rule: "manifest-mcp", name: "an empty mcpServers object", mutate: (d) => editManifest(d, (m) => { m.mcpServers = {}; }) },
    { rule: "manifest-mcp", name: "an extra key on the server",
      mutate: (d) => editManifest(d, (m) => { m.mcpServers.mnemoverse.oauth = { clientId: "x" }; }) },
    { rule: "readme-template", name: "a README with a leftover {{placeholder}}", mutate: (d) => edit(d, "README.md", (t) => `${t}\nVersion {{version}}.\n`) },
    { rule: "readme-template", name: "a README with a stray }}", mutate: (d) => edit(d, "README.md", (t) => `${t}\nSee }} here.\n`) },
  ];
  for (const key of ["userConfig", "hooks", "env", "headers", "lspServers", "skills"]) {
    fixtures.push({ rule: "manifest-keys", name: `manifest key ${key}`, mutate: (d) => editManifest(d, (m) => { m[key] = {}; }) });
  }
  for (const p of FORBIDDEN_TEXT) {
    fixtures.push({ rule: "forbidden-text", name: `text ${p.id} in a skill`,
      mutate: (d) => edit(d, SKILL, (t) => `${t}\n${p.sample}\n`) });
    fixtures.push({ rule: "forbidden-text", name: `text ${p.id} in README.md`,
      mutate: (d) => edit(d, "README.md", (t) => `${t}\n${p.sample}\n`) });
    fixtures.push({ rule: "forbidden-text", name: `text ${p.id} in a command`,
      mutate: (d) => edit(d, "commands/remember.md", (t) => `${t}\n${p.sample}\n`) });
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

// Changes that must still pass: equivalent content written differently.
export function passingVariants() {
  return [
    { name: "server fields in another key order (url before type)",
      mutate: (d) => editManifest(d, (m) => {
        const { type, url } = m.mcpServers.mnemoverse;
        m.mcpServers.mnemoverse = { url, type };
      }) },
  ];
}

const SETUP = "skills/setup/SKILL.md";
const NAMES_CONFIG = /\(rule set in scripts\/claude-directory\/config\.json\)$/;

// Root sources written differently that must still build into a tree that
// passes, with nothing a host would read differently.
export function buildPassingVariants() {
  const crlf = (t) => t.replace(/\n/g, "\r\n");
  const noAllowedTools = (out) => {
    const problems = [];
    for (const rel of [SKILL, SETUP, "commands/recall.md", "commands/remember.md"]) {
      const t = readFileSync(path.join(out, rel), "utf8");
      if (/allowed-tools/.test(t)) problems.push(`${rel} still mentions allowed-tools`);
      if (/\r|^\uFEFF/.test(t)) problems.push(`${rel} kept a CR or a BOM`);
    }
    return problems;
  };
  const all = [SKILL, SETUP, "commands/recall.md", "commands/remember.md", "commands/memory-status.md"];
  return [
    { name: "skills and commands with CRLF line endings and allowed-tools", verify: noAllowedTools,
      mutate: (r) => {
        for (const rel of all) edit(r, rel, (t) => crlf(t.replace(/^---\n/, "---\nallowed-tools: Read, Write\n")));
      } },
    { name: "a skill and a command that start with a BOM", verify: noAllowedTools,
      mutate: (r) => {
        edit(r, SKILL, (t) => `\uFEFF${t.replace(/^---\n/, "---\nallowed-tools: Read\n")}`);
        edit(r, "commands/recall.md", (t) => `\uFEFF${t}`);
      } },
    { name: "allowed-tools as a quoted key, a list, in a command", verify: noAllowedTools,
      mutate: (r) => edit(r, "commands/remember.md", (t) => t.replace(/^---\n/, '---\n"allowed-tools":\n  - Read\n  - Write\n')) },
  ];
}

export function buildFixtures() {
  return [
    { name: "every build error names config.json", expect: NAMES_CONFIG,
      mutate: (r) => edit(r, SETUP, (t) => t.replace("### Hermes Agent\n", "### Hermes\n")) },
    { name: "a heading renamed in the root setup skill", expect: /the generated copy has the headings .*"### Claude Code CLI"/,
      mutate: (r) => edit(r, SETUP, (t) => t.replace("### Claude Code\n", "### Claude Code CLI\n")) },
    { name: "a new H3 in a kept section of the setup skill", expect: /the generated copy has the headings .*"### Codex"/,
      mutate: (r) => edit(r, SETUP, (t) => t.replace("## If verification fails\n", "### Codex\n\nUse the Codex flow.\n\n## If verification fails\n")) },
    { name: "a section of the setup skill left empty", expect: /section "## What the connection exposes" is empty/,
      mutate: (r) => edit(r, SETUP, (t) => t.replace(/(## What the connection exposes\n)[\s\S]*?(\n## Privacy\n)/, "$1$2")) },
    { name: "the Claude Code section loses /mcp", expect: /section "### Claude Code" of the generated copy does not contain "`\/mcp`"/,
      mutate: (r) => edit(r, SETUP, (t) => t.replace("Tell the user to run `/mcp`, select", "Tell the user to run `/plugin`, select")) },
    { name: "the Claude Code section loses Authenticate", expect: /does not contain "Authenticate"/,
      mutate: (r) => edit(r, SETUP, (t) => t.replace("and choose Authenticate, then", "and sign in, then")) },
    { name: "the Claude Code section loses memory:read", expect: /does not contain "`memory:read`"/,
      mutate: (r) => edit(r, SETUP, (t) => t.replace("include `memory:read` and `memory:write`", "include reading and writing")) },
    { name: "the paragraph to drop was reworded", expect: /drop-paragraph: expected exactly one paragraph equal to/,
      mutate: (r) => edit(r, SETUP, (t) => t.replace("Only if the server is absent", "If the server is absent")) },
    { name: "the Claude apps sentence to rewrite was reworded", expect: /replace: expected exactly one occurrence of "Follow the current host's/,
      mutate: (r) => edit(r, SETUP, (t) => t.replace("Follow the current host's [installation guide]", "See the current host's [installation guide]")) },
    { name: "a section to drop no longer exists", expect: /drop-section: expected exactly one heading "### Hermes Agent"/,
      mutate: (r) => edit(r, SETUP, (t) => t.replace("### Hermes Agent\n", "### Hermes\n")) },
    { name: "a sentence to rewrite was reworded", expect: /replace: expected exactly one occurrence/,
      mutate: (r) => edit(r, SETUP, (t) => t.replace("as on Hermes Agent.", "as Hermes Agent does.")) },
    { name: "new claude mcp add text in a kept section", expect: /generated copy still contains "claude mcp add"/,
      mutate: (r) => edit(r, SETUP, (t) => t.replace("## If verification fails\n", "Or run claude mcp add again.\n\n## If verification fails\n")) },
    { name: "new Hermes text in a kept section", expect: /generated copy still contains "Hermes"/,
      mutate: (r) => edit(r, SETUP, (t) => t.replace("## Privacy\n", "## Privacy\n\nHermes keeps its own entry.\n")) },
    { name: "the root manifest renamed", expect: /name is "other"/,
      mutate: (r) => edit(r, ".claude-plugin/plugin.json", (t) => t.replace('"name": "mnemoverse"', '"name": "other"')) },
    { name: "a root privacyPolicyUrl that differs from config.json", expect: /privacyPolicyUrl .* differs/,
      mutate: (r) => edit(r, ".claude-plugin/plugin.json", (t) => t.replace("/docs/legal/privacy-policy", "/privacy")) },
    { name: "a source file the config lists is missing", expect: /skills\/memory-search\/SKILL\.md: is listed but does not exist/,
      mutate: (r) => rmSync(path.join(r, "skills/memory-search"), { recursive: true }) },
    { name: "an unknown README placeholder", expect: /unknown placeholder \{\{nope\}\}/,
      mutate: (r) => edit(r, "scripts/claude-directory/README.template.md", (t) => `${t}\n{{nope}}\n`) },
    { name: "a malformed README placeholder", expect: /"\{\{" is left in the rendered README/,
      mutate: (r) => edit(r, "scripts/claude-directory/README.template.md", (t) => `${t}\n{{ version }}\n`) },
    { name: "a skill to clean without front matter", expect: /does not start with a front matter block/,
      mutate: (r) => edit(r, SKILL, (t) => t.replace(/^---\n[\s\S]*?\n---\n/, "")) },
  ];
}
