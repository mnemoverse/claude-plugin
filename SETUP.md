# Setup: connecting Mnemoverse memory

This plugin declares a hosted MCP server at `https://mcp.mnemoverse.com/mcp`. Authentication is a one-time browser sign-in (OAuth 2.1 with PKCE); no API key is pasted anywhere.

Steps the assistant should follow when the user installs or activates this plugin:

1. Identify this plugin's configured Mnemoverse server in the current host, including a host-native entry that intentionally replaces the plugin entry. Listed tools confirm discovery only. If that server's `memory_stats` is available, call it with `{}` in the existing account context. Confirm read access only after a successful stats result, with neither `isError: true` nor an error payload. Zero memories and an empty domains list are valid; an empty or failed response is not. Report connection status without copying domains or memory content. Do not change account, credentials or scopes, or write a test memory, just to check the connection.
2. If verification needs sign-in, use the current host's flow in the bundled `setup` skill. In Claude Code, run `/mcp`, select `plugin:mnemoverse:mnemoverse` and choose Authenticate, then complete browser sign-in to a Mnemoverse account. If the server is absent from Claude Code's configuration, add it for all projects with `claude mcp add --transport http --scope user mnemoverse https://mcp.mnemoverse.com/mcp`. Missing tools alone are not a reason to add a duplicate. Hermes Agent and Antigravity have different sign-in flows; do not give them Claude Code commands.
3. Treat an authentication error (such as 401) as failed verification. A 403 means access denied, not necessarily an expired token; do not broaden access. A timeout, transport failure, or other error leaves the connection unverified. Report the actual error and use the same host and server for recovery; do not retry in a loop.
4. After the user completes authentication or the cause is resolved, repeat the read-only check before reporting success. This verifies read access, not writes. If setup was the only request, stop. If the user already requested a memory task, continue that task and confirm completion only from its actual tool result.

Detailed rules live in the bundled `setup` skill. Never store passwords, API keys, tokens, payment data, MFA codes, government IDs or health records.
