# Mnemoverse Memory

Persistent memory for AI agents, shared across tools. This plugin connects Claude to the hosted Mnemoverse memory server over MCP, so a decision, preference or correction saved in one session can be recalled in the next one, and in other tools connected to the same account. It also adds the discipline that makes memory get used: recall before acting, save durable decisions afterwards.

Version 1.0.5. Source: [github.com/mnemoverse/claude-plugin](https://github.com/mnemoverse/claude-plugin).

## What it contains

- One remote MCP server, `mnemoverse`, at `https://mcp.mnemoverse.com/mcp`, declared in `.claude-plugin/plugin.json`. The plugin contains no scripts, hooks or local programs, and installs no packages.
- Skills: `agent-memory-discipline` (CC0, when to recall and what is worth saving), `setup` (connect and verify the server), `memory-search`, `memory-save`, `memory-catch-up` and `memory-onboard`.
- Commands: `/mnemoverse:remember`, `/mnemoverse:recall` and `/mnemoverse:memory-status`.

## Sign-in

The server uses OAuth 2.1 with PKCE. The sign-in happens in your browser, started by the Claude app you use; the plugin itself holds no credential and reads none from your machine. In Claude Code, run `/mcp`, select `plugin:mnemoverse:mnemoverse`, choose Authenticate, sign in to your Mnemoverse account and approve the requested scopes, which include `memory:read` and `memory:write`. Accounts have a free tier at [console.mnemoverse.com](https://console.mnemoverse.com). In chat on claude.ai, in the Claude desktop and mobile apps, and in Cowork, the server this plugin declares is listed on the plugin's **Connectors** tab in **Customize > Plugins** (claude.ai or the desktop app); connect it there and sign in ([plugin support by surface](https://claude.com/docs/plugins/platform-support)). For other ways to connect those apps, see the [Claude apps guide](https://mnemoverse.com/docs/api/claude-apps).

## What is sent, and when

Data leaves your machine only when Claude calls one of the memory tools, and it goes only to `https://mcp.mnemoverse.com/mcp`. Nothing runs in the background.

- Recall and search (`/mnemoverse:recall`, `memory-search`, `agent-memory-discipline`): the search text is sent, and matching memories from your account come back. Afterwards a rating of the memories that were used (helped or misled) is sent, which changes how later searches rank them.
- Saving (`/mnemoverse:remember`, `memory-save`, `agent-memory-discipline`): the text of the memory is sent and stored in your account.
- Status and catch-up (`/mnemoverse:memory-status`, `memory-catch-up`, `setup`): counts, domains and the newest entries are requested from your account; nothing is written.
- Onboarding a project (`memory-onboard`): Claude reads the project's own `README.md`, `CLAUDE.md`, `AGENTS.md` and contributing notes on your machine, shows you the list of durable facts it took from them, and after you agree saves a summary of each fact, one memory per fact, to your account. The files themselves are not uploaded.

The skills refuse to store passwords, access tokens, payment data and other sensitive personal data. The plugin does not record conversations.

## Privacy

Memory content lives in your Mnemoverse account and is handled under the privacy policy at https://mnemoverse.com/docs/legal/privacy-policy. Support: [support@mnemoverse.com](mailto:support@mnemoverse.com), or an issue in the source repository.

## License

MIT. The bundled `agent-memory-discipline` skill is CC0-1.0.
