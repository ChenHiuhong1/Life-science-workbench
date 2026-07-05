"""LLM streaming engine for OpenAI-compatible and Anthropic-compatible APIs."""
import json
from typing import Any, AsyncIterator, Dict, List

from loguru import logger

from ..config import reload_settings, settings


def _is_anthropic() -> bool:
    reload_settings()
    base_url = settings.llm_base_url.lower()
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


def _with_reasoning_instruction(system_prompt: str) -> str:
    effort = (settings.reasoning_effort or "auto").lower()
    instructions = {
        "low": "Reasoning effort: low. Prefer fast, direct answers and expand reasoning only when necessary.",
        "medium": "Reasoning effort: medium. Check the key assumptions, then give a clear answer with evidence.",
        "high": (
            "Reasoning effort: high. For complex tasks, decompose the problem, check boundaries, and self-review "
            "before answering. Do not expose long hidden reasoning; summarize the useful rationale."
        ),
    }
    extra = instructions.get(effort)
    if not extra:
        return system_prompt
    return (system_prompt + "\n\n" + extra).strip()


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
        yield _sse({"type": "error", "message": "API key is not configured. Add it in Settings."})
        return

    client = AsyncOpenAI(base_url=settings.llm_base_url, api_key=settings.llm_api_key)

    full_messages: List[Dict[str, Any]] = []
    system_prompt = _with_reasoning_instruction(system_prompt)
    if system_prompt:
        full_messages.append({"role": "system", "content": system_prompt})
    full_messages.extend(messages)

    model = model or settings.llm_model

    for _ in range(8):
        try:
            stream = await client.chat.completions.create(
                model=model,
                messages=full_messages,
                tools=tools or None,
                tool_choice="auto" if tools else None,
                stream=True,
            )
        except Exception as exc:
            logger.exception("OpenAI-compatible call failed")
            yield _sse({"type": "error", "message": f"LLM call failed: {exc}"})
            return

        content_buf = ""
        tool_calls_buf: Dict[int, dict] = {}

        async for chunk in stream:
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta
            if delta.content:
                content_buf += delta.content
                yield _sse({"type": "delta", "content": delta.content})
            if delta.tool_calls:
                for tool_call in delta.tool_calls:
                    idx = tool_call.index
                    if idx not in tool_calls_buf:
                        tool_calls_buf[idx] = {"id": "", "name": "", "args": ""}
                    if tool_call.id:
                        tool_calls_buf[idx]["id"] = tool_call.id
                    if tool_call.function and tool_call.function.name:
                        tool_calls_buf[idx]["name"] = tool_call.function.name
                    if tool_call.function and tool_call.function.arguments:
                        tool_calls_buf[idx]["args"] += tool_call.function.arguments

        if tool_calls_buf:
            from .executor import execute_tool_call

            assistant_tool_calls = [
                {
                    "id": item["id"],
                    "type": "function",
                    "function": {"name": item["name"], "arguments": item["args"]},
                }
                for item in tool_calls_buf.values()
            ]
            full_messages.append({"role": "assistant", "content": content_buf, "tool_calls": assistant_tool_calls})
            for item in tool_calls_buf.values():
                yield _sse({"type": "tool_call", "name": item["name"], "args": _safe_json(item["args"])})
                result = await execute_tool_call(item["name"], item["args"], session_id=session_id, project_path=project_path)
                yield _sse({"type": "tool_result", "name": item["name"], "result": result[:8000]})
                full_messages.append({"role": "tool", "tool_call_id": item["id"], "content": result})
            continue
        break

    yield _sse({"type": "done"})


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
        yield _sse({"type": "error", "message": "API key is not configured. Add it in Settings."})
        return

    client = anthropic.AsyncAnthropic(
        base_url=settings.llm_base_url,
        api_key=settings.llm_api_key,
    )
    model = model or settings.llm_model
    system_prompt = _with_reasoning_instruction(system_prompt)
    api_messages = [message for message in messages if message["role"] != "system"]
    anthropic_tools = _convert_tools_to_anthropic(tools) if tools else None

    for _ in range(8):
        try:
            kwargs: Dict[str, Any] = {
                "model": model,
                "messages": api_messages,
                "max_tokens": 8192,
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
                        if getattr(delta, "type", "") == "text_delta":
                            text = getattr(delta, "text", "") or ""
                            if text:
                                content_buf += text
                                yield _sse({"type": "delta", "content": text})
                        elif getattr(delta, "type", "") == "input_json_delta":
                            if tool_calls:
                                # partial_json can come through as None on some
                                # anthropic-compatible endpoints (e.g. GLM); guard
                                # against NoneType + str concatenation.
                                tool_calls[-1]["_raw"] += getattr(delta, "partial_json", "") or ""
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
                    try:
                        tool_call["input"] = json.loads(tool_call["_raw"]) if tool_call["_raw"] else {}
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
                    result = await execute_tool_call(tool_call["name"], tool_call["input"], session_id=session_id, project_path=project_path)
                    yield _sse({"type": "tool_result", "name": tool_call["name"], "result": result[:8000]})
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": tool_call["id"],
                        "content": result,
                    })
                api_messages.append({"role": "user", "content": tool_results})
                continue

            break

        except anthropic.APIStatusError as exc:
            logger.exception("Anthropic API error")
            yield _sse({"type": "error", "message": f"Anthropic API error {exc.status_code}: {exc.message}"})
            return
        except Exception as exc:
            logger.exception("Anthropic call failed")
            yield _sse({"type": "error", "message": f"LLM call failed: {exc}"})
            return

    yield _sse({"type": "done"})


def _safe_json(value: str):
    try:
        return json.loads(value)
    except Exception:
        return value
