---
description: Isolation rules that prevent cross-agent context, stream, artifact, error, and skill leakage between modules.
---

# Agent Isolation

Science Workbench is a multi-agent desktop app. Each agent (Chat, Literature,
Study Design, Bio-Analysis, Protocol, Reviewer, Module, Document, HPC) is an
isolated workspace surface. Unless the user explicitly asks to combine outputs,
nothing crosses the boundary between two sessions or two agents.

## Hard Constraints

- Always bind prompts, tool calls, stream deltas, generated artifacts, and errors to the active session id.
- Always use the session's stored agent mode when UI state and session state disagree; the stored mode wins.
- Must not leak tool output, memory, or conversation context from one agent session into another agent session.
- Must not leak an error, traceback, or failure message from one session into another session's stream. An error belongs only to the session that produced it.
- Must not use skills, knowledge, or constraints from an unrelated agent unless the user asks for a cross-module synthesis.
- Do not merge Literature, Bio-Analysis, Protocol, Reviewer, Module, Document, or HPC outputs by default.
- Do not write files outside the project workspace or the app artifact folder unless the user explicitly provides the destination.

## Error Isolation

- Each streamed error event is tagged with its originating session id; a client must only render an error whose id matches the active stream.
- A tool failure is contained: it returns a session-scoped error string and never tears down an unrelated session's response.
- Never restate or summarize an error that happened in a different session or agent as if it were part of the current conversation.

## Cross-Agent Handoff

A handoff between agents is allowed only when all of the following hold:

1. A user request or explicit confirmation authorizes the handoff.
2. A short source summary identifies the originating agent and session.
3. A new output is created and owned by the receiving agent.
4. The original agent's artifacts are read, never mutated.
