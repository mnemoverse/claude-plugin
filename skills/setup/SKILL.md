---
name: setup
description: "Connects Mnemoverse memory for this plugin. Use when the user asks to connect or verify memory, when installed memory tools are missing, or when a memory call fails with an authentication error. Uses the current host's OAuth sign-in and verifies read access with memory_stats; no API key is pasted anywhere."
---

# Connecting Mnemoverse memory

This plugin talks to a hosted MCP server at `https://mcp.mnemoverse.com/mcp`. Authentication is a one-time browser sign-in (OAuth 2.1 with PKCE); there is no API key to paste.

## Check first

Identify this plugin's configured Mnemoverse server in the current host. Tool names may have a host prefix; similarly named tools from an unrelated server do not verify this connection. If the server cannot be identified, report that limitation instead of testing another connection.

If that server's `memory_stats` tool is available, call it with `{}` using the existing account context. It is read-only and takes no parameters; do not invent a domain filter. Confirm read access only when the tool returns a successful stats result, with neither `isError: true` nor an error payload. A valid result with `memory_count: 0` and `domains: []` still confirms the connection. An empty response, an error, or listed tools without a successful call does not.

Report only the connection status, without copying domains or memory content. Do not read stored memories, write synthetic memories, or change credentials, account, or access scopes just to test the connection. This check verifies read access, not writes. If setup was the only request, stop after reporting success. If the user already requested a memory task, continue it and report its actual tool result; the stats check does not establish that the task is complete.

## If tools or sign-in are missing

The user needs a Mnemoverse account: free tier at https://console.mnemoverse.com, no credit card. Use the current host's flow below. If the host is unknown, ask which app they are using before giving host-specific steps. Missing tools can mean the host has not enabled or loaded the configured server; inspect that entry before adding another server.

### Claude Code

The plugin declares the server, but installing it does not open a browser, and Claude Code does not start the sign-in by itself. Tell the user to run `/mcp`, select the Mnemoverse server (from this plugin it is listed as `plugin:mnemoverse:mnemoverse`) and choose Authenticate, then complete sign-in in the browser and approve the requested scopes, which include `memory:read` and `memory:write`.

### Claude apps and Cowork

In chat on claude.ai, in the Claude desktop and mobile apps, and in Cowork, the server this plugin declares is listed on the plugin's **Connectors** tab in **Customize > Plugins** (claude.ai or the desktop app); connect it there and complete the sign-in in the browser ([plugin support by surface](https://claude.com/docs/plugins/platform-support)). For other ways to connect those apps, see the [Claude apps guide](https://mnemoverse.com/docs/api/claude-apps). Do not substitute Claude Code commands for another host's sign-in flow.

After tools become available or sign-in completes, repeat the read-only stats check above before reporting success. A host's probe or tool inventory alone does not replace it.

## If verification fails

- An authentication error (such as 401) means verification failed. Use the same host and configured server's authentication flow above. In Claude Code, choose Authenticate or Re-authenticate as offered.
- A 403 means access was denied. Report the permission error; do not assume an expired token or broaden access to make the check pass.
- A timeout, transport failure, or other error leaves the connection unverified. Report the actual error without declaring sign-in successful or credentials invalid. Do not retry in a loop or switch accounts to make a check pass.

After the user completes authentication or the cause is resolved, repeat the read-only check before reporting success.

## What the connection exposes

The memory tools the remote server serves: read, write, newest-first listing, stats, usefulness feedback, shared rooms, and a vault alias listing; the current list is at https://mcp.mnemoverse.com/.well-known/mcp/server-card.json. There is no delete tool on the remote server or in the local package, so a one-click sign-in can never wipe memory; deletion is an administrative REST operation, documented at https://mnemoverse.com/docs/api/remote-mcp-server.

## Privacy

Memory content is stored in the user's Mnemoverse account and follows the privacy policy at https://mnemoverse.com/docs/legal/privacy-policy. Never store passwords, API keys, tokens, payment data, MFA codes, government IDs or health records.
