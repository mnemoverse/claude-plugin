---
name: memory-save
description: "Saves a durable decision, preference, correction or lesson to long-term Mnemoverse memory as one self-contained fact, so later sessions and other connected tools can recall it. Use when the user says \"save this to memory\", \"note that we decided\", \"save a checkpoint for a new chat\", or \"that was wrong, it is actually\", or when a session settles something worth keeping. Never stores secrets."
---

# Save to memory

## A project checkpoint for a new chat

When the user explicitly requests a checkpoint or handoff for a later chat, use this path instead of the general fact-saving steps below. This is a compact, dated snapshot of one project, not permission to archive the conversation or change the general durable-memory policy.

1. **Choose the project and scope.** Reuse the exact `domain` supplied by the user or established by an earlier successful project memory result. If it is unknown, `memory_stats({})` can help identify an existing domain; show only relevant candidates and ask when the project mapping is ambiguous. Do not fabricate a mapping from a similar name. For a new domain, propose a name and let the user choose it before writing. Do not switch accounts or choose a shared room implicitly.
2. **Keep only the handoff.** Keep it short, usually no more than 150 words: name the project, its stated goal, agreed decisions and constraints, and only the open questions or next step the user asked to carry forward. Mark next-step/status information as temporary and dated, using a known current date or saying the date is unavailable. Keep undecided facts explicitly unknown. Include a source such as “user-approved checkpoint in this chat”; do not claim approval of details the user has not agreed to. Exclude secrets, personal identifiers, unrelated projects and bulk chat/file contents.
3. **Use the connected plugin's actual schema.** Use this plugin's configured Mnemoverse server instance, not another connected memory account. The raw tool is `memory_write` with `content` and `domain`; a UI label such as “Store Memory” is not an argument name. Check the exposed schema before calling it. If needed tools are absent or authentication fails, say the checkpoint is not saved and offer the text here for the user to carry forward. Use the host's normal connection flow; never ask for an API key in chat or invent a Desktop `/mcp` command.
4. **Write only the requested snapshot.** The user's explicit save request authorizes the agreed content and scope; do not ask again when both are already clear. A read-only request to continue a project does not authorize a new checkpoint. If an equivalent checkpoint is already visible from a successful scoped read, report it as existing rather than writing a duplicate. Do not automatically read all memory to check.
5. **Report the actual outcome.** Confirm a new save only after a non-error tool result explicitly reports `stored: true`. `stored: false`, `isError`, an error payload, missing confirmation or a timeout is not success. Quote a returned refusal reason without inventing one; do not infer “already saved” from refusal alone or rephrase/retry to force storage. After a timeout, the outcome may be unknown. Keep a copy of the proposed checkpoint in the answer, clearly labeled unsaved or unconfirmed as appropriate.

After a confirmed save, give the exact project/domain and a fresh-chat prompt: “Continue [project] in domain [exact domain]. Use its checkpoint to [next task]. Keep unknown or conflicting facts explicit.” The user should be able to resume the work without pasting the old conversation. A later chat uses the `memory-catch-up` skill's project-continuation path.

## Check first

Look for the tools `memory_write` and `memory_stats`. If they are missing, memory is not connected: say so in one sentence and use the bundled `setup` skill if it is installed, otherwise https://mnemoverse.com/docs/api/install-by-host. Do not pretend the fact was saved.

## What belongs in memory

Durable things: a stated preference, a decision and its reason, a correction, a fact about people, roles or project setup, a lesson from a failure. Chatter that only matters this turn does not belong.

Never store passwords, API keys, tokens, payment data, MFA codes, government IDs or health records. If the input contains any of these, refuse that part in one sentence and save the rest if anything is left.

## How to write it

1. **One fact per memory.** If the user gave several independent facts, save them separately and say how many were saved.
2. **Self-contained.** Write `content` so it still makes sense when recalled months later in another tool: what was decided or observed, why, and where it came from (a file, a meeting, a test run) when that is known. Prefer the user's own words.
3. **The right place.** Personal memory needs no `domain`. To keep a project's facts together, use a domain such as `project:<repository-name>`, and before writing to a named domain call `memory_stats` to reuse its exact spelling: a different case or a stray space opens a separate store. A shared room (beta) is written to only when the user means the room, with its address as `domain`.
4. **Corrections are new memories.** When something saved earlier turned out wrong, save the corrected statement and say in it what it replaces. Nothing is edited in place.

## After writing

The result says whether the memory was stored or refused. A write can be refused when memory already holds a statement too close to this one in the same domain. If the point really is the same, tell the user it is already known and do not reword it to force a duplicate in. If it is a correction or adds something new, write only what is different and lead with it, for example "Correction: staging deploys run on Thursday, not Friday"; if that is refused too, tell the user the correction was not saved.

After a confirmed save, show the stored text word for word so the user can verify what was stored. This confirms storage only; do not promise that a later session will retrieve the entry or reproduce it verbatim.
