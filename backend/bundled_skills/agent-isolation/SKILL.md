---
description: Isolation rules that prevent cross-agent context, stream, artifact, and skill leakage.
---

# Agent Isolation

Science Workbench is a multi-agent desktop app. Each agent must behave as an isolated workspace surface unless the user explicitly asks to combine outputs.

## Hard Constraints

- Always bind prompts, tool calls, stream deltas, and generated artifacts to the active session id.
- Always use the session's stored agent mode when there is a mismatch between UI state and session state.
- Must not leak tool output from one agent session into another agent session.
- Must not use skills from an unrelated agent unless the user asks for a cross-module synthesis.
- Do not merge Literature, Bio-Analysis, Protocol, Reviewer, Module, or HPC outputs by default.
- Do not write files outside the project workspace or app artifact folder unless the user explicitly provides the destination.

## Cross-Agent Handoff

Allowed handoff requires:

1. A user request or explicit confirmation.
2. A short source summary that identifies the originating agent and session.
3. A new output owned by the receiving agent.
4. No mutation of the original agent's artifacts.
