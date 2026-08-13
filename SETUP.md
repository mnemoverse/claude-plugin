# Setup: connecting Mnemoverse memory

This plugin declares a hosted MCP server at `https://mcp.mnemoverse.com/mcp`. Authentication is a one-time browser sign-in (OAuth 2.1 with PKCE); no API key is pasted anywhere.

Steps Claude should follow when the user installs or activates this plugin:

1. Check the available tools. If `memory_read`, `memory_write` and `memory_stats` are present, the connection already works; say so and stop.
2. If the tools are missing, the user needs a Mnemoverse account: free tier at https://console.mnemoverse.com, no credit card. The first tool call opens a browser sign-in window; ask the user to complete it and grant the requested scopes, which include `memory:read` and `memory:write`.
3. If no browser window appears, have the user run `/mcp` to inspect server status, or re-add the server manually: `claude mcp add --transport http mnemoverse https://mcp.mnemoverse.com/mcp`.
4. If a call fails after it used to work, the token has usually expired; the next call refreshes it. If it does not, remove and re-add the server, then sign in again.

Detailed rules live in the bundled `setup` skill. Never store secrets, API keys, passwords, payment data, or personal identifiers in memory.
