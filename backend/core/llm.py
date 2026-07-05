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
from typing import Any, AsyncIterator, Dict, List

from loguru import logger

from ..config import reload_settings, settings

MAX_TOOL_ROUNDS = 6
CHAT_MAX_TOKENS = 4096
FINAL_SUMMARY_MAX_TOKENS = 2048
MODEL_TOOL_RESULT_CHAR_LIMIT = 6000
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
    reload_settings()
    base_url = (settings.llm_base_url or "").lower()
    return "/anthropic" in base_url or "anthropic.com" in base_url


async def stream_chat(
    messages: List[Dict[str, Any]],
    tools: List[Dict] | None = None,
    system_prompt: str = "",
    model: str | None = None,
    session_id: str = "default",
    project_path: str = "",
) -> AsyncIterator[str]:
    if _is_anthropic():
        async for event in _stream_anthropic(messages, tools, system_prompt, model, session_id, project_path):
            yield event
    else:
        async for event in _stream_openai(messages, tools, system_prompt, model, session_id, project_path):
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


def _with_reasoning_instruction(system_prompt: str) -> str:
    base = _as_text(system_prompt)
    effort = _as_text(getattr(settings, "reasoning_effort", "") or "auto").lower()
    instructions = {
        "low": "Reasoning effort: low. Prefer fast, direct answers and expand reasoning only when necessary.",
        "medium": "Reasoning effort: medium. Check the key assumptions, then give a clear answer with evidence.",
        "high": (
            "Reasoning effort: high. For complex tasks, decompose the problem, check boundaries, and self-review "
            "before answering. Do not expose long hidden reasoning; summarize the useful rationale."
        ),
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


async def _stream_openai(
    messages: List[Dict[str, Any]],
    tools: List[Dict] | None,
    system_prompt: str,
    model: str | None,
    session_id: str = "default",
    project_path: str = "",
) -> AsyncIterator[str]:
    from openai import AsyncOpenAI

    if not settings.llm_api_key:
        yield _error_event("API key is not configured. Add it in Settings.", session_id)
        return

    client = AsyncOpenAI(base_url=settings.llm_base_url, api_key=settings.llm_api_key)

    full_messages: List[Dict[str, Any]] = []
    system_prompt = _with_reasoning_instruction(system_prompt)
    if system_prompt:
        full_messages.append({"role": "system", "content": system_prompt})
    full_messages.extend(_sanitize_messages(messages))

    model = model or settings.llm_model

    force_final_summary = False
    for round_idx in range(MAX_TOOL_ROUNDS):
        content_buf = ""
        tool_calls_buf: Dict[int, dict] = {}

        # The create call AND the token iteration are both guarded: some
        # compatible endpoints raise or emit None mid-stream, and either must
        # become a clean session-bound error rather than a dropped connection.
        try:
            stream = await client.chat.completions.create(
                model=model,
                messages=full_messages,
                tools=tools or None,
                tool_choice="auto" if tools else None,
                max_tokens=CHAT_MAX_TOKENS,
                stream=True,
            )

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
                yield _sse({"type": "tool_result", "name": item["name"], "result": result})
                full_messages.append({
                    "role": "tool",
                    "tool_call_id": call["id"],
                    "content": _compact_tool_result_for_model(result),
                })
            if round_idx == MAX_TOOL_ROUNDS - 1:
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
    system_prompt = _with_reasoning_instruction(system_prompt)
    api_messages = [message for message in _sanitize_messages(messages) if message["role"] != "system"]
    anthropic_tools = _convert_tools_to_anthropic(tools) if tools else None

    force_final_summary = False
    for round_idx in range(MAX_TOOL_ROUNDS):
        try:
            kwargs: Dict[str, Any] = {
                "model": model,
                "messages": api_messages,
                "max_tokens": CHAT_MAX_TOKENS,
            }
            if system_prompt:
                kwargs["system"] = system_prompt[:50000]
            if anthropic_tools:
                kwargs["tools"] = anthropic_tools

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
                    yield _sse({"type": "tool_result", "name": tool_call["name"], "result": result})
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": tool_call["id"],
                        "content": _compact_tool_result_for_model(result),
                    })
                api_messages.append({"role": "user", "content": tool_results})
                if round_idx == MAX_TOOL_ROUNDS - 1:
                    force_final_summary = True
                    break
                continue

            break

        except anthropic.APIStatusError as exc:
            logger.exception("Anthropic API error")
            yield _error_event(f"Anthropic API error {exc.status_code}: {exc.message}", session_id)
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
