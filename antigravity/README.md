# Mnemoverse Memory for Google Antigravity

Hosted long-term memory for the Antigravity agent, shared with your other AI tools. Write a memory in Antigravity and recall it later in Antigravity, Claude Code, Cursor, VS Code or another MCP client connected to the same Mnemoverse account.

The plugin contains:

- `mcp_config.json`: the hosted Mnemoverse MCP server, `https://mcp.mnemoverse.com/mcp`. Sign-in is OAuth in your browser; there is no API key to paste. In Antigravity the server is named `mnemoverse_mnemoverse` (plugin name, then server name).
- `skills/`: the bundled skills, including `agent-memory-discipline` (CC0-1.0), which tells the agent when to recall from memory before acting and when to save durable decisions, corrections and failures afterwards. They are a copy of the repository's `skills/` folder, kept identical by CI.

Rating a recalled memory as helpful or misleading re-ranks what comes back next.

## Install

Antigravity CLI:

```sh
agy plugin install https://github.com/mnemoverse/claude-plugin/tree/main/antigravity
```

From a local checkout, `agy plugin install ./antigravity` does the same. In the Antigravity App and IDE, copy this folder to `~/.gemini/config/plugins/mnemoverse/` for all workspaces, or to `.agents/plugins/mnemoverse/` in one workspace.

## Sign in

The plugin declares no API key, so it installs enabled. Antigravity opens the browser for the OAuth sign-in when the server first connects. Sign in to your Mnemoverse account (free tier at [console.mnemoverse.com](https://console.mnemoverse.com), no credit card) and approve the requested scopes, which include `memory:read` and `memory:write`.

## Remove

```sh
agy plugin uninstall mnemoverse
```

In the App and IDE, delete the `mnemoverse` folder from the plugins directory you copied it to.

## Links

- [Install guide for every host](https://mnemoverse.com/docs/api/install-by-host)
- [Remote MCP server and sign-in](https://mnemoverse.com/docs/api/remote-mcp-server)
- Support: [support@mnemoverse.com](mailto:support@mnemoverse.com)
