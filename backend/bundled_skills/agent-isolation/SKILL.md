---
description: Isolation rules that prevent cross-agent context, stream, artifact, error, and skill leakage between modules.
---

# Agent Isolation

Science Workbench is a multi-agent desktop app. Each agent (Chat, Study Design,
Bio-Analysis, Structure-Bio, Protocol, Reviewer, Module, Document, HPC) is an
isolated workspace surface. Unless the user explicitly asks to combine outputs,
nothing crosses the boundary between two sessions or two agents.

Literature search is intentionally a shared tool, not a standalone agent. Its
results belong to the agent session that requested them.

## Hard Constraints

- Always bind prompts, tool calls, stream deltas, generated artifacts, and errors to the active session id.
- Always use the session's stored agent mode when UI state and session state disagree; the stored mode wins.
- Must not leak tool output, memory, or conversation context from one agent session into another agent session.
- Must not leak an error, traceback, or failure message from one session into another session's stream. An error belongs only to the session that produced it.
- Must not use skills, knowledge, or constraints from an unrelated agent unless the user asks for a cross-module synthesis.
- Do not merge Bio-Analysis, Structure-Bio, Protocol, Reviewer, Module, Document, or HPC outputs by default.
- Do not write files outside the project workspace or the app artifact folder unless the user explicitly provides the destination.

## Non-Interference Between Concurrent Sessions

A long-running operation in one session must never freeze or stall another
session, agent, or the UI. This is a hard isolation requirement, not a
performance nicety.

- Code execution (run_python / run_r) runs off the event loop so a slow or
  120s script in session A cannot block the stream, the heartbeat, or the
  responsiveness of session B.
- A background stream keeps writing to its own session's store slice only; it
  must never re-render, hijack the scroll position, or steal input focus from
  the session the user is currently viewing.
- When the user switches agents, the previous agent's view stays mounted but
  hidden so an in-flight stream is preserved, not torn down. Switching tabs is
  instant and never aborts a background generation.
- Streaming deltas are coalesced before they reach the store so per-token
  re-rendering of one session does not compete with typing in another.

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
