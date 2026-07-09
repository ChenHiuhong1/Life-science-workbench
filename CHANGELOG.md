# Changelog

All notable changes to Science Workbench are documented here.
本项目的重要变更记录于此。

## [Unreleased] — branch `feat/workbench-overhaul`

Focus: fix the conversation crash, tighten module isolation, refresh the visual
identity, and bring streaming + workspace behavior in line with Claude Code /
Codex desktop clients.
本次聚焦：修复对话崩溃、强化模块隔离、刷新视觉标识，并让流式输出与工作区逻辑对标 Claude Code / Codex 桌面端。

### Fixed — 缺陷修复
- **LLM streaming crash `unsupported operand type(s) for +: 'NoneType' and 'str'`.**
  OpenAI/Anthropic-compatible endpoints (e.g. GLM) can send `None` for
  `delta.content`, `function.arguments`, or `partial_json`. Every streamed
  fragment now flows through a single `_as_text()` coercion, and **both** stream
  loops are wrapped so a mid-stream failure becomes a clean, session-bound SSE
  error instead of tearing down the connection.
  所有流式片段统一经 `_as_text()` 归一化，OpenAI 与 Anthropic 两条路径的迭代都被 `try/except` 包裹，杜绝 `NoneType + str` 崩溃。
  - `backend/core/llm.py`, `backend/routers/chat.py`
  - Regression test: `backend/tests/test_llm_none_safety.py` (4/4 passing).

### Changed — 隔离与架构
- **Retired the standalone Literature agent.** Literature search remains available
  as the `search_literature` tool inside Chat, Study Design, Bio-Analysis,
  Protocol, Reviewer, and Document sessions, so evidence stays attached to the
  agent that requested it. Legacy `literature` sessions are safely normalized to
  Chat in the UI.
  - `backend/core/agent_registry.py`, `frontend/src/store/index.ts`,
    `frontend/src/components/Workspace.tsx`, `frontend/src/components/layout/Sidebar.tsx`
- **Agent output contracts.** Added a repository-shipped `agent-output-contracts`
  skill and loaded it globally, with per-agent deliverables, tool routing,
  final handoff, and no-hidden-handoff rules.
  - `backend/bundled_skills/agent-output-contracts/SKILL.md`,
    `backend/core/agent_registry.py`, `backend/knowledge/agents/module_contracts.md`
- **Strict module-level isolation.** `execute_tool_call` never raises: any tool
  failure is caught and returned as a *session-scoped* error string, and a tool
  call can no longer redirect its artifacts to another session (`session_id` is
  now authoritative). Error SSE events carry a `session_id` tag, **and the chat
  UI now keeps errors per session** so a background stream's failure can never
  surface inside whatever session the user is currently viewing.
  工具调用永不外抛异常、产物强制绑定当前会话；错误事件携带 `session_id`，且前端按会话隔离错误展示，确保错误信息不跨模块串流。
  - `backend/core/executor.py`, `backend/core/llm.py`, `frontend/src/components/chat/ChatView.tsx`
- **Harness & skill hardening.** The bundled `harness-core` and `agent-isolation`
  skills were rewritten with an explicit perceive→plan→act→verify loop, tool
  discipline, and error-isolation rules that load into every agent's system prompt.
  - `backend/bundled_skills/harness-core/SKILL.md`, `backend/bundled_skills/agent-isolation/SKILL.md`
- **Workspace.** Confirmed and hardened the Claude Code / Codex layout: the agent
  runs with `cwd = project root` and generated files are gathered into
  `<project>/artifacts/<session>/`, keeping the project root tidy and sessions isolated.
  - `backend/core/executor.py`

### Streaming — 流式输出
- Stick-to-bottom scrolling (never yanks the view down while you read earlier
  output); scroll state is reset per session on switch.
- A soft blinking caret trails the streaming message; a three-dot "thinking"
  indicator shows before the first token; the assistant avatar pulses while streaming.
  The caret is tracked per assistant message id, so concurrent streams in one
  session each keep their own indicator.
  - `frontend/src/components/chat/ChatView.tsx`, `frontend/src/components/document/ReviewResultPanel.tsx`, `frontend/src/styles/globals.css`

### Branding & UI — 视觉与界面
- New **DNA double-helix brand mark** replacing the generic flask icon, used
  consistently across the app logo, chat avatars, empty states, the favicon,
  the Windows app icon, and the NSIS/MSI installer artwork.
  全新 **DNA 双螺旋** 品牌标识，统一应用 Logo、头像、空态、favicon、Windows 图标与安装器图。
  - New `frontend/src/components/BrandMark.tsx`; `frontend/index.html`
  - `src-tauri/icons/gen_brand_bitmaps.py` (regenerated `icon.png`, `icon.ico`,
    `nsis-sidebar.bmp`, `msi-dialog.bmp`).

### Notes — 构建说明
- Frontend builds clean (`npm run build`, `tsc -b` — 0 type errors).
- Building the Windows installer requires the Rust toolchain (`cargo`) plus
  `npm` and the bundled Python backend; see `PACKAGING_WINDOWS.md` and
  `build_windows.bat`.
