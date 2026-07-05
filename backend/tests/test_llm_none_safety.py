"""Regression tests for the ``NoneType + str`` streaming crash.

Reproduces the reported failure::

    LLM call failed: unsupported operand type(s) for +: 'NoneType' and 'str'

which happened when an OpenAI/Anthropic-compatible endpoint sent ``None`` for
``delta.content``, ``function.arguments`` or ``partial_json``. These tests feed
exactly those ``None`` fragments through the real streaming engine and assert
the stream completes cleanly.

Self-contained: it stubs ``loguru`` and ``openai`` so it runs without the
backend's optional dependencies. Run from the repo root::

    python -m backend.tests.test_llm_none_safety
"""
from __future__ import annotations

import asyncio
import os
import sys
import tempfile
import types
from pathlib import Path

# --- Make the test hermetic ------------------------------------------------
REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

# Keep the app from writing into the real user profile during import.
os.environ.setdefault("SCIENCE_WORKBENCH_HOME", tempfile.mkdtemp(prefix="sw-test-"))

# Stub loguru (optional dependency) so importing the module never fails.
if "loguru" not in sys.modules:
    _loguru = types.ModuleType("loguru")

    class _Logger:
        def __getattr__(self, _name):
            return lambda *a, **k: None

    _loguru.logger = _Logger()
    sys.modules["loguru"] = _loguru


# --- Fakes that emit the problematic None fragments ------------------------
class _FakeFn:
    def __init__(self, name=None, arguments=None):
        self.name = name
        self.arguments = arguments


class _FakeToolCall:
    def __init__(self, index=0, id=None, name=None, arguments=None):
        self.index = index
        self.id = id
        self.function = _FakeFn(name=name, arguments=arguments)


class _FakeDelta:
    def __init__(self, content=None, tool_calls=None):
        self.content = content
        self.tool_calls = tool_calls


class _FakeChoice:
    def __init__(self, delta):
        self.delta = delta


class _FakeChunk:
    def __init__(self, delta=None, empty=False):
        self.choices = [] if empty else [_FakeChoice(delta)]


class _FakeStream:
    def __init__(self, chunks):
        self._chunks = list(chunks)

    def __aiter__(self):
        return self

    async def __anext__(self):
        if not self._chunks:
            raise StopAsyncIteration
        return self._chunks.pop(0)


def _install_fake_openai(rounds):
    """Register a fake ``openai`` module whose create() returns the given
    per-round chunk lists in sequence."""
    mod = types.ModuleType("openai")
    state = {"round": 0}

    class _Completions:
        async def create(self, **kwargs):
            idx = min(state["round"], len(rounds) - 1)
            state["round"] += 1
            return _FakeStream(rounds[idx])

    class _Chat:
        def __init__(self):
            self.completions = _Completions()

    class AsyncOpenAI:
        def __init__(self, **kwargs):
            self.chat = _Chat()

    mod.AsyncOpenAI = AsyncOpenAI
    sys.modules["openai"] = mod


async def _collect(agen):
    events = []
    async for event in agen:
        events.append(event)
    return events


def _parse(events):
    import json
    out = []
    for ev in events:
        assert ev.startswith("data: "), ev
        out.append(json.loads(ev[len("data: "):].strip()))
    return out


# --- Tests -----------------------------------------------------------------
def test_pure_helpers():
    from backend.core import llm

    assert llm._as_text(None) == ""
    assert llm._as_text("x") == "x"
    assert llm._as_text(7) == "7"
    # The exact operation that used to crash:
    assert "" + llm._as_text(None) == ""
    # None system prompt must not raise.
    assert isinstance(llm._with_reasoning_instruction(None), str)
    cleaned = llm._sanitize_messages([{"role": "user", "content": None}])
    assert cleaned == [{"role": "user", "content": ""}]
    err = llm._error_event("boom", "sess-42")
    assert '"session_id": "sess-42"' in err and '"boom"' in err


def test_keyword_triggered_tools():
    from backend.core.tools import select_triggered_tools

    keys = ["run_python", "run_r", "search_literature"]
    assert select_triggered_tools(keys, "请画图并分析这个 csv", "bio") == ["run_python"]
    assert select_triggered_tools(keys, "用 R 画图", "bio") == ["run_r"]
    assert select_triggered_tools(keys, "找一下 TCF7 相关文献", "brainstorm") == ["search_literature"]
    assert select_triggered_tools(keys, "简单解释一下这个概念", "chat") == []
    assert select_triggered_tools(["search_literature"], "TCF7", "literature") == ["search_literature"]


def test_stream_openai_none_text_fragments():
    _install_fake_openai([[
        _FakeChunk(_FakeDelta(content=None)),        # <-- would crash pre-fix
        _FakeChunk(_FakeDelta(content="Hello")),
        _FakeChunk(empty=True),                       # empty choices
        _FakeChunk(_FakeDelta(content=None)),
        _FakeChunk(_FakeDelta(content=" world")),
    ]])
    from backend.core import llm
    llm.settings.llm_api_key = "test"
    llm.settings.llm_base_url = "https://example.com/v1"

    events = _parse(asyncio.run(_collect(
        llm._stream_openai([{"role": "user", "content": "hi"}], None, "", None, "s1", "")
    )))
    text = "".join(e["content"] for e in events if e["type"] == "delta")
    assert text == "Hello world", text
    assert events[-1]["type"] == "done"
    assert not any(e["type"] == "error" for e in events)


def test_stream_openai_none_tool_arguments():
    # Round 1: a tool call whose streamed arguments arrive as None.
    # Round 2: a plain text answer so the tool loop terminates.
    _install_fake_openai([
        [_FakeChunk(_FakeDelta(tool_calls=[
            _FakeToolCall(index=0, id="c1", name="search_literature", arguments=None)
        ]))],
        [_FakeChunk(_FakeDelta(content="done"))],
    ])
    from backend.core import llm, executor

    async def _fake_exec(name, args, session_id="default", project_path=""):
        # Prove args survived None-arguments without crashing.
        assert isinstance(args, str)
        return "RESULT"

    original = executor.execute_tool_call
    executor.execute_tool_call = _fake_exec
    try:
        llm.settings.llm_api_key = "test"
        llm.settings.llm_base_url = "https://example.com/v1"
        events = _parse(asyncio.run(_collect(
            llm._stream_openai(
                [{"role": "user", "content": "hi"}],
                [{"type": "function", "function": {"name": "search_literature", "parameters": {}}}],
                "", None, "s2", "",
            )
        )))
    finally:
        executor.execute_tool_call = original

    types_seen = [e["type"] for e in events]
    assert "tool_call" in types_seen
    assert "tool_result" in types_seen
    assert types_seen[-1] == "done"
    assert "error" not in types_seen


def test_stream_openai_tool_limit_forces_final_summary():
    from backend.core import llm, executor

    _install_fake_openai(
        [[_FakeChunk(_FakeDelta(tool_calls=[
            _FakeToolCall(index=0, id=f"c{i}", name="search_literature", arguments="{}")
        ]))] for i in range(llm.MAX_TOOL_ROUNDS)]
        + [[_FakeChunk(_FakeDelta(content="final summary"))]]
    )

    async def _fake_exec(name, args, session_id="default", project_path=""):
        return "RESULT"

    original = executor.execute_tool_call
    executor.execute_tool_call = _fake_exec
    try:
        llm.settings.llm_api_key = "test"
        llm.settings.llm_base_url = "https://example.com/v1"
        events = _parse(asyncio.run(_collect(
            llm._stream_openai(
                [{"role": "user", "content": "run many steps"}],
                [{"type": "function", "function": {"name": "search_literature", "parameters": {}}}],
                "", None, "s-limit", "",
            )
        )))
    finally:
        executor.execute_tool_call = original

    text = "".join(e.get("content", "") for e in events if e["type"] == "delta")
    assert "final summary" in text
    assert events[-1]["type"] == "done"
    assert not any(e["type"] == "error" for e in events)


def test_execute_tool_call_never_raises():
    from backend.core import executor

    # Unknown tool + malformed args must return a string, not raise.
    out = asyncio.run(executor.execute_tool_call("no_such_tool", "not-json", "s3", ""))
    assert isinstance(out, str)
    out2 = asyncio.run(executor.execute_tool_call("run_python", {"code": "   "}, "s3", ""))
    assert out2 == "Error: code argument is empty"


def test_run_code_survives_none_stdout_stderr():
    """A subprocess that yields None for stdout/stderr must not crash.

    Reproduces the user-facing ``[tool error] run_python failed: unsupported
    operand type(s) for +: 'NoneType' and 'str'``: on some Windows code paths
    ``subprocess.run`` returns ``None`` for captured streams, and the old code
    did ``stdout + stderr`` directly. The fix coerces both to ``""``.
    """
    import subprocess
    from unittest.mock import MagicMock, patch

    from backend.core import executor

    fake_proc = MagicMock()
    fake_proc.stdout = None
    fake_proc.stderr = None
    fake_proc.returncode = 0

    tmp = tempfile.mkdtemp(prefix="sw-none-")
    with patch.object(subprocess, "run", return_value=fake_proc):
        result = executor._run_code("print(1)", "python", "sess-none", project_path=tmp)
    assert result["stdout"] == ""
    assert result["stderr"] == ""
    assert result["returncode"] == 0

    formatted = executor._format_run_result(result)
    assert "[tool error]" not in formatted
    assert isinstance(formatted, str)

    out = asyncio.run(
        executor.execute_tool_call("run_python", {"code": "print(1)"}, "sess-none", project_path=tmp)
    )
    assert "[tool error]" not in out


def test_script_filename_uses_sequence_and_content_slug():
    import subprocess
    from unittest.mock import MagicMock, patch

    from backend.core import executor

    fake_proc = MagicMock()
    fake_proc.stdout = ""
    fake_proc.stderr = ""
    fake_proc.returncode = 0

    tmp = tempfile.mkdtemp(prefix="sw-script-")
    code = "import matplotlib.pyplot as plt\nplt.savefig('qc_violin.png')\n"
    with patch.object(subprocess, "run", return_value=fake_proc):
        result = executor._run_code(code, "python", "sess-script", project_path=tmp, title="")

    scripts = [name for name in result["files"] if "/Script/" in name]
    assert len(scripts) == 1
    assert scripts[0].endswith("/Script/01_qc_violin.py"), scripts[0]


def _run_all():
    tests = [
        test_pure_helpers,
        test_keyword_triggered_tools,
        test_stream_openai_none_text_fragments,
        test_stream_openai_none_tool_arguments,
        test_stream_openai_tool_limit_forces_final_summary,
        test_execute_tool_call_never_raises,
        test_run_code_survives_none_stdout_stderr,
        test_script_filename_uses_sequence_and_content_slug,
    ]
    failures = 0
    for test in tests:
        try:
            test()
            print(f"PASS  {test.__name__}")
        except Exception as exc:  # noqa: BLE001
            failures += 1
            import traceback
            print(f"FAIL  {test.__name__}: {exc}")
            traceback.print_exc()
    print(f"\n{len(tests) - failures}/{len(tests)} passed")
    return failures


if __name__ == "__main__":
    sys.exit(1 if _run_all() else 0)
