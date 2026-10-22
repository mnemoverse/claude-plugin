# Setup: connecting Mnemoverse memory

This plugin declares a hosted MCP server at `https://mcp.mnemoverse.com/mcp`. Authentication is a one-time browser sign-in (OAuth 2.1 with PKCE); no API key is pasted anywhere.

Steps Claude should follow when the user installs or activates this plugin:

1. Check the tools from this plugin's configured Mnemoverse server; their presence only confirms discovery. If its `memory_stats` tool is available, call it with `{}` in the existing account context. Confirm the authenticated read connection only after a successful stats result, with neither `isError: true` nor an error payload. Zero memories and an empty domains list are valid success results; an empty or failed response is not. Report only the connection status, without copying domains or memory content. Do not write a test memory or change credentials, account, or access scopes to test the connection.
2. If the tools are missing, the user needs a Mnemoverse account: free tier at https://console.mnemoverse.com, no credit card. Installing the plugin does not open a browser, and Claude Code does not start the sign-in by itself. Ask the user to run `/mcp`, select the Mnemoverse server (from this plugin it is listed as `plugin:mnemoverse:mnemoverse`) and choose Authenticate, then complete the sign-in in the browser and grant the requested scopes, which include `memory:read` and `memory:write`.
3. If the server is not listed in `/mcp`, have the user add it for all their projects: `claude mcp add --transport http --scope user mnemoverse https://mcp.mnemoverse.com/mcp`, then authenticate from `/mcp` as in step 2. Without `--scope user` the server is added for the current project only.
4. If the call returns an authentication error (such as 401), report that verification failed and have the user run `/mcp`, select the same server and choose Authenticate or Re-authenticate as offered. Report 403 as access denied; do not assume an expired token or broaden access. A timeout, transport failure, or other error leaves the connection unverified; report the actual error instead of claiming sign-in succeeded or credentials are invalid.
5. After authentication or recovery, repeat the read-only check in step 1 before reporting success. This checks read access; it does not verify writes.

Detailed rules live in the bundled `setup` skill. Never store secrets, API keys, passwords, payment data, or personal identifiers in memory.
