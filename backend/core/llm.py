"""LLM streaming engine for OpenAI-compatible and Anthropic-compatible APIs.

Robustness note
---------------
Several OpenAI/Anthropic *compatible* endpoints (GLM/Zhipu, local proxies,
some gateways) occasionally send ``None`` where the official SDKs would send a
string: ``delta.content``, ``function.arguments``, ``partial_json`` or a text
delta's ``text``. Concatenating those directly raises

    LLM call failed: unsupported operand type(s) for +: 'NoneType' and 'str'

and tears down the whole stream. Every fragment that ever reaches a ``+``/``+=``
in this module is therefore funneled through :func:`_as_text`, and both stream
loops are wrapped so a mid-stream failure is reported as a clean, *session
bound* SSE error instead of leaking a raw traceback across the connection.
"""
import json
import re
from typing import Any, AsyncIterator, Dict, List

from loguru import logger

from ..config import reload_settings, settings

# How many tool-call rounds a single chat turn may use. The previous value (6)
# was too small for realistic multi-step analyses (a single-cell workflow alone
# is QC→HVG→PCA→neighbors→leiden→UMAP→DEG→markers→annotation→figures = 10+
# steps), so a single mid-pipeline error would exhaust the budget and force a
# final summary, truncating every later step. 14 fits a full analysis with room
# for one or two retries; analysis agents (bio/protocol) get even more via
# :func:`max_tool_rounds_for`.
MAX_TOOL_ROUNDS = 14
# Higher budget for agents whose job is long multi-step analysis pipelines.
HEAVY_AGENT_TOOL_ROUNDS = 24
HEAVY_AGENT_KEYS = {"bio", "protocol", "brainstorm", "module"}


def max_tool_rounds_for(agent_key: str = "") -> int:
    """Per-agent tool-round budget. Heavy analysis agents get more headroom."""
    return HEAVY_AGENT_TOOL_ROUNDS if (agent_key or "") in HEAVY_AGENT_KEYS else MAX_TOOL_ROUNDS
# Soft output caps. The per-model real max (e.g. GLM-5.2 = 65536) is resolved
# via model_specs at call time; these are only the fallback for unknown models.
CHAT_MAX_TOKENS = 4096
FINAL_SUMMARY_MAX_TOKENS = 2048
MODEL_TOOL_RESULT_CHAR_LIMIT = 6000
# Cap on tool results shipped to the UI over SSE and persisted as part of an
# artifact. The model gets a smaller (compacted) copy via the function below;
# this cap protects the wire + DB from a runaway 500MB-print run.
SSE_TOOL_RESULT_CHAR_LIMIT = 30_000
COMPACT_RESPONSE_INSTRUCTION = (
    "Token budget: concise. Prefer the shortest complete answer, do not echo full tool logs, "
    "and summarize tool evidence by outcome, key numbers, failures, and artifact paths."
)
FINAL_TOOL_SUMMARY_PROMPT = (
    "Tool execution budget reached. Do not call any more tools. Summarize what was completed, "
    "what failed or remains unchecked, and the final user-visible outputs. List artifact paths by "
    "Figure/Table/Script/Data when present, include any artifact review or visual sanity notes from "
    "tool results, and give the next concrete step if work is incomplete."
)


def _as_text(value: Any) -> str:
    """Coerce any streaming fragment to a safe string.

    ``None`` becomes ``""`` so no ``+``/``+=`` can raise a ``NoneType`` error.
    Non-string values are stringified defensively rather than crashing.
    """
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    try:
        return str(value)
    except Exception:  # pragma: no cover - stringification is total in practice
        return ""


def _is_anthropic() -> bool:
    """Return whether the configured endpoint speaks the Anthropic protocol.

    The result is memoised keyed on the *current* base URL string, so a normal
    chat request no longer re-parses ``.env`` from disk on every call. The cache
    is invalidated implicitly whenever the base URL changes (settings save),
    because the key differs.
    """
    base_url = (settings.llm_base_url or "").lower()
    cached = _ANTHROPIC_CACHE.get(base_url)
    if cached is not None:
        return cached
    reload_settings()
    base_url = (settings.llm_base_url or "").lower()
    result = "/anthropic" in base_url or "anthropic.com" in base_url
    _ANTHROPIC_CACHE.clear()
    _ANTHROPIC_CACHE[base_url] = result
    return result


_ANTHROPIC_CACHE: Dict[str, bool] = {}


async def stream_chat(
    messages: List[Dict[str, Any]],
    tools: List[Dict] | None = None,
    system_prompt: str = "",
    model: str | None = None,
    session_id: str = "default",
    project_path: str = "",
    effort_override: str = "",
    agent_key: str = "",
) -> AsyncIterator[str]:
    max_rounds = max_tool_rounds_for(agent_key)
    if _is_anthropic():
        async for event in _stream_anthropic(messages, tools, system_prompt, model, session_id, project_path, effort_override, max_rounds):
            yield event
    else:
        async for event in _stream_openai(messages, tools, system_prompt, model, session_id, project_path, effort_override, max_rounds):
            yield event


def _sse(obj: dict) -> str:
    return f"data: {json.dumps(obj, ensure_ascii=False)}\n\n"


def _error_event(message: str, session_id: str) -> str:
    """Build a session-bound error event.

    Tagging the event with ``session_id`` keeps a failure isolated to the
    session/agent that produced it; the frontend can drop any error whose id
    does not match the active stream, so one module's failure never surfaces
    inside another module's conversation.
    """
    return _sse({"type": "error", "message": message, "session_id": session_id})


def _with_reasoning_instruction(system_prompt: str, effort_override: str = "") -> str:
    base = _as_text(system_prompt)
    effort = _as_text(effort_override or getattr(settings, "reasoning_effort", "") or "max").lower()
    # Zhipu GLM exposes three thinking tiers: none / high / max. We mirror them
    # here as system-prompt guidance. "auto" and the legacy "low"/"medium"
    # values are normalised to a sensible tier so old saved settings still work.
    instructions = {
        "none": "Reasoning effort: none. Do not use extended thinking. Answer directly and quickly.",
        "high": (
            "Reasoning effort: high. For non-trivial tasks, check the key assumptions and self-review "
            "the answer before sending. Do not expose long hidden reasoning; summarize the useful rationale."
        ),
        "max": (
            "Reasoning effort: max (highest). For any task that is not a trivial factual reply, fully "
            "decompose the problem, check boundaries and edge cases, verify each tool result, and "
            "self-review the final answer for correctness and completeness before sending. Do not expose "
            "long hidden reasoning; summarize the useful rationale."
        ),
        # Legacy normalisation (kept so old .env values don't break):
        "auto": "Reasoning effort: max (highest). Fully decompose, verify, and self-review before answering.",
        "low": "Reasoning effort: none. Do not use extended thinking. Answer directly and quickly.",
        "medium": "Reasoning effort: high. Check key assumptions, then give a clear answer with evidence.",
    }
    extras = [COMPACT_RESPONSE_INSTRUCTION]
    if instructions.get(effort):
        extras.append(instructions[effort])
    return (base + "\n\n" + "\n".join(extras)).strip()


def _compact_tool_result_for_model(result: str) -> str:
    text = _as_text(result)
    if len(text) <= MODEL_TOOL_RESULT_CHAR_LIMIT:
        return text
    head = text[:3600]
    tail = text[-1800:]
    omitted = len(text) - len(head) - len(tail)
    return (
        f"{head}\n\n"
        f"[tool output compacted for model context: {omitted} characters omitted; "
        "the full result was streamed to the UI tool card and persisted with artifacts when applicable.]\n\n"
        f"{tail}"
    )


# --- Auto context compaction ----------------------------------------------
# When the conversation approaches the model's context window, summarise the
# oldest turns into one assistant message so the chat keeps working without a
# hard truncation that would silently drop the user's earlier requests.

_COMPACT_CHARS_PER_TOKEN = 4
_COMPACT_TRIGGER_RATIO = 0.70  # compact when used >= 70% of the window
_COMPACT_KEEP_RECENT_TURNS = 8  # always keep the most recent N messages verbatim


def _estimate_history_tokens(messages: List[Dict[str, Any]]) -> int:
    """Rough token estimate for a message list (~4 chars/token, min 4/msg)."""
    total = 0
    for message in messages or []:
        content = message.get("content")
        if isinstance(content, str):
            total += max(4, len(content) // _COMPACT_CHARS_PER_TOKEN)
        elif isinstance(content, list):
            # anthropic-style content blocks
            for block in content:
                if isinstance(block, dict):
                    total += max(4, len(_as_text(block.get("text") or block.get("content"))) // _COMPACT_CHARS_PER_TOKEN)
        total += 4  # role/structural overhead per message
    return total


async def _summarise_for_compact(messages: List[Dict[str, Any]], model: str) -> str:
    """Ask the model for a tight summary of the given older messages.

    Returns the summary text, or "" if the call fails (we then fall back to a
    mechanical truncation rather than block the conversation).
    """
    if not messages:
        return ""
    # Build a compact transcript to summarise.
    lines = []
    for m in messages:
        role = m.get("role", "user")
        content = m.get("content")
        if isinstance(content, list):
            content = " ".join(
                _as_text(b.get("text") if isinstance(b, dict) else b) for b in content
            )
        text = _as_text(content).strip()
        if not text:
            continue
        lines.append(f"[{role}] {text[:1500]}")
    transcript = "\n".join(lines)[:12000]
    if not transcript:
        return ""

    summary_prompt = (
        "Summarise the earlier part of this conversation as a compact brief the model can keep in mind. "
        "Capture: the user's goal and key constraints, decisions made, what was tried and the outcome, "
        "any artifact paths produced, and the next step. Keep it under 400 words. Do not add commentary.\n\n"
        f"=== EARLIER CONVERSATION ===\n{transcript}\n=== END ==="
    )

    try:
        if _is_anthropic():
            import anthropic
            client = anthropic.AsyncAnthropic(base_url=settings.llm_base_url, api_key=settings.llm_api_key)
            resp = await client.messages.create(
                model=model,
                max_tokens=1200,
                messages=[{"role": "user", "content": summary_prompt}],
            )
            parts = getattr(resp, "content", []) or []
            return " ".join(_as_text(getattr(p, "text", None)) for p in parts if getattr(p, "type", "") == "text")
        else:
            from openai import AsyncOpenAI
            client = AsyncOpenAI(base_url=settings.llm_base_url, api_key=settings.llm_api_key)
            resp = await client.chat.completions.create(
                model=model,
                max_tokens=1200,
                messages=[{"role": "user", "content": summary_prompt}],
            )
            return _as_text(resp.choices[0].message.content)
    except Exception as exc:
        logger.warning(f"[compact] summary call failed ({exc}); falling back to truncation")
        return ""


async def _maybe_compact_history(
    messages: List[Dict[str, Any]],
    model: str,
    system_prompt: str = "",
) -> tuple[List[Dict[str, Any]], bool]:
    """Auto-compact a message list when it nears the model's context window.

    Returns ``(maybe_compacted_messages, did_compact)``. The most recent
    ``_COMPACT_KEEP_RECENT_TURNS`` messages are always kept verbatim; the older
    prefix is replaced by a single summary message. When there is nothing to
    compact (short history, tiny window, or summary failure) the input is
    returned unchanged.
    """
    from .model_specs import context_window_for

    window = context_window_for(model)
    # Reserve room for the system prompt + the upcoming response.
    reserved = (len(system_prompt) // _COMPACT_CHARS_PER_TOKEN) + 2048
    budget = max(2048, window - reserved)
    used = _estimate_history_tokens(messages)
    if used < budget * _COMPACT_TRIGGER_RATIO:
        return messages, False
    if len(messages) <= _COMPACT_KEEP_RECENT_TURNS + 2:
        return messages, False

    older = messages[: -_COMPACT_KEEP_RECENT_TURNS]
    recent = messages[-_COMPACT_KEEP_RECENT_TURNS:]

    summary = await _summarise_for_compact(older, model)
    if not summary:
        # Mechanical fallback: keep the first user message (the task) + recent.
        first_user = next((m for m in older if m.get("role") == "user"), None)
        kept_head = [first_user] if first_user else []
        return kept_head + recent, bool(first_user)

    summary_message = {
        "role": "assistant",
        "content": (
            "[Auto-compacted summary of earlier turns — treat as context, not as your own prior answer.]\n"
            f"{summary}"
        ),
    }
    logger.info(f"[compact] compressed {len(older)} older messages into a summary ({used} -> ~{budget} token budget)")
    return [summary_message] + recent, True


def _truncate_for_ui(result: str) -> tuple[str, bool]:
    """Cap a tool result before it is shipped to the UI / persisted to DB.

    Returns ``(text, truncated)``. The head is preserved (it carries the
    success/failure line and the first rows of output); the tail is appended so
    a reviewer can still see the final error or summary line.
    """
    text = _as_text(result)
    if len(text) <= SSE_TOOL_RESULT_CHAR_LIMIT:
        return text, False
    head = text[: SSE_TOOL_RESULT_CHAR_LIMIT // 2]
    tail = text[-SSE_TOOL_RESULT_CHAR_LIMIT // 2 :]
    omitted = len(text) - SSE_TOOL_RESULT_CHAR_LIMIT
    return (
        f"{head}\n\n[... output truncated for display: {omitted} characters omitted; "
        f"full output is in the saved script's working directory ...]\n\n{tail}",
        True,
    )


def _extra_model_kwargs(model: str, effort_override: str = "", protocol: str = "openai") -> dict:
    """Build model-specific request kwargs (reasoning_effort / thinking).

    Returns only the parameters the target model actually accepts, so unknown
    OpenAI/Anthropic-compatible endpoints never receive a field they would
    reject. The per-message ``effort_override`` wins over the global default.

    ``protocol`` selects the right field name for the wire:
    - ``"openai"`` -> ``reasoning_effort`` (GLM-5.2 on the v4 endpoint).
    - ``"anthropic"`` -> ``thinking={"type": "enabled"|"disabled"}`` (the form
      both Claude and Zhipu's Anthropic-compatible endpoint accept).
    """
    from .model_specs import get_model_spec

    spec = get_model_spec(model)
    kwargs: Dict[str, Any] = {}
    if not spec.supports_reasoning_effort:
        return kwargs

    effort = (effort_override or spec.default_reasoning_effort or "max").lower()
    # Normalise legacy values into the GLM tiers so old .env keeps working.
    if effort in {"auto", "max"}:
        effort = "max"
    elif effort in {"low", "medium", "none"}:
        effort = "none" if effort in {"low", "none"} else "high"
    # else: keep "high"

    if protocol == "anthropic":
        # Anthropic/GLM anthropic endpoint: extended thinking on/off. "none"
        # disables it; any other tier enables it.
        if effort == "none":
            kwargs["thinking"] = {"type": "disabled"}
        else:
            kwargs["thinking"] = {"type": "enabled"}
    else:
        kwargs["reasoning_effort"] = effort
    return kwargs


def _max_tokens_for(model: str) -> int:
    """Per-model output cap, falling back to CHAT_MAX_TOKENS for unknown models."""
    from .model_specs import get_model_spec

    spec = get_model_spec(model)
    # Use the model's real cap but keep a sane ceiling for chat turns so one
    # answer can't monopolise the whole output budget.
    return min(spec.max_output_tokens, 16_384) or CHAT_MAX_TOKENS


async def _stream_openai(
    messages: List[Dict[str, Any]],
    tools: List[Dict] | None,
    system_prompt: str,
    model: str | None,
    session_id: str = "default",
    project_path: str = "",
    effort_override: str = "",
    max_rounds: int = MAX_TOOL_ROUNDS,
) -> AsyncIterator[str]:
    from openai import AsyncOpenAI

    if not settings.llm_api_key:
        yield _error_event("API key is not configured. Add it in Settings.", session_id)
        return

    client = AsyncOpenAI(base_url=settings.llm_base_url, api_key=settings.llm_api_key)

    full_messages: List[Dict[str, Any]] = []
    system_prompt = _with_reasoning_instruction(system_prompt, effort_override)
    if system_prompt:
        full_messages.append({"role": "system", "content": system_prompt})

    model = model or settings.llm_model

    # Auto-compact long histories before they blow the model's context window.
    sanitized = _sanitize_messages(messages)
    sanitized, _ = await _maybe_compact_history(sanitized, model, system_prompt=system_prompt)
    full_messages.extend(sanitized)

    force_final_summary = False
    for round_idx in range(max_rounds):
        content_buf = ""
        tool_calls_buf: Dict[int, dict] = {}

        # The create call AND the token iteration are both guarded: some
        # compatible endpoints raise or emit None mid-stream, and either must
        # become a clean session-bound error rather than a dropped connection.
        try:
            create_kwargs = dict(
                model=model,
                messages=full_messages,
                tools=tools or None,
                tool_choice="auto" if tools else None,
                max_tokens=_max_tokens_for(model),
                stream=True,
            )
            create_kwargs.update(_extra_model_kwargs(model, effort_override))
            stream = await client.chat.completions.create(**create_kwargs)

            async for chunk in stream:
                if not getattr(chunk, "choices", None):
                    continue
                delta = chunk.choices[0].delta
                text = _as_text(getattr(delta, "content", None))
                if text:
                    content_buf += text
                    yield _sse({"type": "delta", "content": text})
                if getattr(delta, "tool_calls", None):
                    for tool_call in delta.tool_calls:
                        idx = tool_call.index if tool_call.index is not None else 0
                        slot = tool_calls_buf.setdefault(idx, {"id": "", "name": "", "args": ""})
                        if tool_call.id:
                            slot["id"] = tool_call.id
                        fn = getattr(tool_call, "function", None)
                        if fn and getattr(fn, "name", None):
                            slot["name"] = fn.name
                        if fn and getattr(fn, "arguments", None) is not None:
                            slot["args"] += _as_text(fn.arguments)
        except Exception as exc:
            # Auto-fallback when a long-context tier (e.g. glm-5.2[1m]) is not
            # available on the user's plan: retry once with the base model id.
            msg = str(exc)
            base_model = re.sub(r"\s*\[[0-9]+[mk]\]\s*$", "", model or "", flags=re.IGNORECASE)
            is_model_missing = (
                ("1211" in msg or "model" in msg.lower() and "not exist" in msg.lower() or "模型不存在" in msg)
                and base_model and base_model != model and round_idx == 0
            )
            if is_model_missing:
                logger.warning(f"[openai] model '{model}' unavailable; retrying with base '{base_model}'")
                yield _sse({
                    "type": "delta",
                    "content": f"\n\n_Model `{model}` is not available on your plan; retrying with `{base_model}`._\n\n",
                })
                model = base_model
                continue
            logger.exception("OpenAI-compatible call failed")
            yield _error_event(f"LLM call failed: {exc}", session_id)
            return

        if tool_calls_buf:
            from .executor import execute_tool_call

            assistant_tool_calls = [
                {
                    "id": item["id"] or f"call_{idx}",
                    "type": "function",
                    "function": {"name": item["name"], "arguments": item["args"] or "{}"},
                }
                for idx, item in tool_calls_buf.items()
            ]
            full_messages.append({"role": "assistant", "content": content_buf, "tool_calls": assistant_tool_calls})
            for call, item in zip(assistant_tool_calls, tool_calls_buf.values()):
                yield _sse({"type": "tool_call", "name": item["name"], "args": _safe_json(item["args"])})
                result = await execute_tool_call(item["name"], item["args"], session_id=session_id, project_path=project_path)
                result = _as_text(result)
                ui_result, truncated = _truncate_for_ui(result)
                yield _sse({"type": "tool_result", "name": item["name"], "result": ui_result, "truncated": truncated})
                full_messages.append({
                    "role": "tool",
                    "tool_call_id": call["id"],
                    "content": _compact_tool_result_for_model(result),
                })
            if round_idx == max_rounds - 1:
                force_final_summary = True
                break
            continue
        break

    if force_final_summary:
        async for event in _stream_openai_text_only(client, model, full_messages):
            yield event

    yield _sse({"type": "done"})


async def _stream_openai_text_only(client: Any, model: str, messages: List[Dict[str, Any]]) -> AsyncIterator[str]:
    """Force a final text response after tool rounds are exhausted."""
    try:
        stream = await client.chat.completions.create(
            model=model,
            messages=messages + [{"role": "user", "content": FINAL_TOOL_SUMMARY_PROMPT}],
            max_tokens=FINAL_SUMMARY_MAX_TOKENS,
            stream=True,
        )
        emitted = False
        async for chunk in stream:
            if not getattr(chunk, "choices", None):
                continue
            delta = chunk.choices[0].delta
            text = _as_text(getattr(delta, "content", None))
            if text:
                emitted = True
                yield _sse({"type": "delta", "content": text})
        if not emitted:
            yield _sse({"type": "delta", "content": "\n\nTool execution reached the limit before the model produced a final summary. Review the tool cards and artifact panel for the latest outputs."})
    except Exception as exc:
        logger.exception("OpenAI-compatible final summary failed")
        yield _sse({"type": "delta", "content": f"\n\nTool execution reached the limit, and the forced final summary failed: {exc}"})


def _sanitize_messages(messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Coerce message content to strings so history from the DB never carries
    a ``None`` into the request body (which would fail server-side)."""
    clean: List[Dict[str, Any]] = []
    for message in messages or []:
        role = message.get("role", "user")
        content = message.get("content")
        if isinstance(content, list):
            clean.append({"role": role, "content": content})
        else:
            clean.append({"role": role, "content": _as_text(content)})
    return clean


def _convert_tools_to_anthropic(tools: List[Dict]) -> List[Dict]:
    out = []
    for tool in tools:
        fn = tool.get("function", tool)
        out.append({
            "name": fn["name"],
            "description": fn.get("description", ""),
            "input_schema": fn.get("parameters", {"type": "object", "properties": {}}),
        })
    return out


async def _stream_anthropic(
    messages: List[Dict[str, Any]],
    tools: List[Dict] | None,
    system_prompt: str,
    model: str | None,
    session_id: str = "default",
    project_path: str = "",
    effort_override: str = "",
    max_rounds: int = MAX_TOOL_ROUNDS,
) -> AsyncIterator[str]:
    import anthropic

    if not settings.llm_api_key:
        yield _error_event("API key is not configured. Add it in Settings.", session_id)
        return

    client = anthropic.AsyncAnthropic(
        base_url=settings.llm_base_url,
        api_key=settings.llm_api_key,
    )
    model = model or settings.llm_model
    system_prompt = _with_reasoning_instruction(system_prompt, effort_override)
    raw_messages = [message for message in _sanitize_messages(messages) if message["role"] != "system"]
    # Auto-compact long histories before they blow the model's context window.
    raw_messages, _ = await _maybe_compact_history(raw_messages, model, system_prompt=system_prompt)
    api_messages = raw_messages
    anthropic_tools = _convert_tools_to_anthropic(tools) if tools else None

    force_final_summary = False
    for round_idx in range(max_rounds):
        try:
            kwargs: Dict[str, Any] = {
                "model": model,
                "messages": api_messages,
                "max_tokens": _max_tokens_for(model),
            }
            if system_prompt:
                kwargs["system"] = system_prompt[:50000]
            if anthropic_tools:
                kwargs["tools"] = anthropic_tools
            # GLM-5.2 (and Claude-compatible) accepts reasoning_effort +
            # thinking params; only send them when the model supports it so
            # other Anthropic-compatible endpoints don't 400.
            kwargs.update(_extra_model_kwargs(model, effort_override, protocol="anthropic"))

            async with client.messages.stream(**kwargs) as stream:
                content_buf = ""
                tool_calls = []

                async for event in stream:
                    event_type = getattr(event, "type", "")
                    if event_type == "content_block_delta":
                        delta = event.delta
                        delta_type = getattr(delta, "type", "")
                        if delta_type == "text_delta":
                            text = _as_text(getattr(delta, "text", None))
                            if text:
                                content_buf += text
                                yield _sse({"type": "delta", "content": text})
                        elif delta_type == "input_json_delta":
                            if tool_calls:
                                # partial_json can arrive as None on some
                                # anthropic-compatible endpoints (e.g. GLM);
                                # _as_text guards the NoneType + str concat.
                                tool_calls[-1]["_raw"] += _as_text(getattr(delta, "partial_json", None))
                    elif event_type == "content_block_start":
                        block = event.content_block
                        if getattr(block, "type", "") == "tool_use":
                            tool_calls.append({
                                "id": getattr(block, "id", ""),
                                "name": getattr(block, "name", ""),
                                "_raw": "",
                            })

                parsed_tool_calls = []
                for tool_call in tool_calls:
                    raw = _as_text(tool_call.get("_raw"))
                    try:
                        tool_call["input"] = json.loads(raw) if raw.strip() else {}
                    except Exception:
                        tool_call["input"] = {}
                    parsed_tool_calls.append(tool_call)

            if parsed_tool_calls:
                assistant_content = [{"type": "text", "text": content_buf}] if content_buf else []
                for tool_call in parsed_tool_calls:
                    assistant_content.append({
                        "type": "tool_use",
                        "id": tool_call["id"],
                        "name": tool_call["name"],
                        "input": tool_call["input"],
                    })
                api_messages.append({"role": "assistant", "content": assistant_content})

                from .executor import execute_tool_call

                tool_results = []
                for tool_call in parsed_tool_calls:
                    yield _sse({"type": "tool_call", "name": tool_call["name"], "args": tool_call["input"]})
                    result = _as_text(await execute_tool_call(
                        tool_call["name"], tool_call["input"], session_id=session_id, project_path=project_path
                    ))
                    ui_result, truncated = _truncate_for_ui(result)
                    yield _sse({"type": "tool_result", "name": tool_call["name"], "result": ui_result, "truncated": truncated})
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": tool_call["id"],
                        "content": _compact_tool_result_for_model(result),
                    })
                api_messages.append({"role": "user", "content": tool_results})
                if round_idx == max_rounds - 1:
                    force_final_summary = True
                    break
                continue

            break

        except anthropic.APIStatusError as exc:
            # Auto-fallback when a long-context tier (e.g. glm-5.2[1m]) is not
            # available on the user's plan: retry once with the base model id.
            # Error code 1211 = Zhipu "model does not exist".
            status = getattr(exc, "status_code", 0)
            body = getattr(exc, "body", None) or {}
            err_msg = ""
            if isinstance(body, dict):
                inner = body.get("error") or {}
                err_msg = _as_text(inner.get("message") if isinstance(inner, dict) else inner)
            err_code = ""
            if isinstance(body, dict) and isinstance(body.get("error"), dict):
                err_code = _as_text(body["error"].get("code"))
            is_model_missing = status == 400 and ("1211" in err_code or "model" in err_msg.lower() or "模型不存在" in err_msg)
            base_model = re.sub(r"\s*\[[0-9]+[mk]\]\s*$", "", model or "", flags=re.IGNORECASE)
            if is_model_missing and base_model and base_model != model and round_idx == 0:
                logger.warning(
                    f"[anthropic] model '{model}' unavailable (code {err_code}); retrying with base '{base_model}'"
                )
                yield _sse({
                    "type": "delta",
                    "content": f"\n\n_Model `{model}` is not available on your plan; retrying with `{base_model}`._\n\n",
                })
                model = base_model
                continue
            logger.exception("Anthropic API error")
            yield _error_event(f"Anthropic API error {status}: {exc.message}", session_id)
            return
        except Exception as exc:
            logger.exception("Anthropic call failed")
            yield _error_event(f"LLM call failed: {exc}", session_id)
            return

    if force_final_summary:
        async for event in _stream_anthropic_text_only(client, model, api_messages, system_prompt):
            yield event

    yield _sse({"type": "done"})


async def _stream_anthropic_text_only(
    client: Any,
    model: str,
    messages: List[Dict[str, Any]],
    system_prompt: str,
) -> AsyncIterator[str]:
    """Force a no-tools final response after Anthropic tool rounds are exhausted."""
    try:
        kwargs: Dict[str, Any] = {
            "model": model,
            "messages": messages + [{"role": "user", "content": FINAL_TOOL_SUMMARY_PROMPT}],
            "max_tokens": FINAL_SUMMARY_MAX_TOKENS,
        }
        if system_prompt:
            kwargs["system"] = system_prompt[:50000]
        async with client.messages.stream(**kwargs) as stream:
            emitted = False
            async for event in stream:
                event_type = getattr(event, "type", "")
                if event_type != "content_block_delta":
                    continue
                delta = event.delta
                if getattr(delta, "type", "") != "text_delta":
                    continue
                text = _as_text(getattr(delta, "text", None))
                if text:
                    emitted = True
                    yield _sse({"type": "delta", "content": text})
            if not emitted:
                yield _sse({"type": "delta", "content": "\n\nTool execution reached the limit before the model produced a final summary. Review the tool cards and artifact panel for the latest outputs."})
    except Exception as exc:
        logger.exception("Anthropic final summary failed")
        yield _sse({"type": "delta", "content": f"\n\nTool execution reached the limit, and the forced final summary failed: {exc}"})


def _safe_json(value: str):
    try:
        return json.loads(value)
    except Exception:
        return value
