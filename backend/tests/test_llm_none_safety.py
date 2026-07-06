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
    assert select_triggered_tools(["search_literature"], "TCF7", "chat") == []


def test_literature_agent_is_retired():
    from backend.core.agent_registry import registry

    registry.agents.clear()
    registry._prompts.clear()
    registry.register_all()
    keys = [agent.key for agent in registry.list()]
    assert "literature" not in keys
    assert "brainstorm" in keys


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
    a captured stream is ``None``, and the old code did ``stdout + stderr``
    directly. The fix coerces both to ``""``. Execution now uses ``Popen`` +
    ``communicate()`` so the test patches the modern call site.
    """
    import subprocess
    from unittest.mock import MagicMock, patch

    from backend.core import executor

    fake_proc = MagicMock()
    fake_proc.communicate.return_value = (None, None)
    fake_proc.returncode = 0
    fake_proc.pid = 12345

    tmp = tempfile.mkdtemp(prefix="sw-none-")
    with patch.object(subprocess, "Popen", return_value=fake_proc):
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
    fake_proc.communicate.return_value = ("", "")
    fake_proc.returncode = 0
    fake_proc.pid = 12345

    tmp = tempfile.mkdtemp(prefix="sw-script-")
    code = "import matplotlib.pyplot as plt\nplt.savefig('qc_violin.png')\n"
    with patch.object(subprocess, "Popen", return_value=fake_proc):
        result = executor._run_code(code, "python", "sess-script", project_path=tmp, title="")

    scripts = [name for name in result["files"] if "/Script/" in name]
    assert len(scripts) == 1
    assert scripts[0].endswith("/Script/01_qc_violin.py"), scripts[0]

    with patch.object(subprocess, "Popen", return_value=fake_proc):
        result2 = executor._run_code(code, "python", "sess-script", project_path=tmp, title="02_qc_violin")

    scripts2 = [name for name in result2["files"] if "/Script/" in name]
    assert len(scripts2) == 1
    assert scripts2[0].endswith("/Script/02_qc_violin.py"), scripts2[0]
    assert "/Script/02_02_" not in scripts2[0], scripts2[0]


def test_literature_empty_results_are_not_connection_failures():
    from backend.services.literature import aggregator

    async def empty(_query, _limit):
        return []

    async def failed(_query, _limit):
        return None

    original = aggregator._SOURCES
    aggregator._SOURCES = {
        "empty": empty,
        "failed": failed,
        "crossref": empty,
        "semantic_scholar": empty,
    }
    try:
        no_hits = asyncio.run(aggregator.search_all("unlikely query", sources=["empty"], limit=3))
        mixed = asyncio.run(
            aggregator.search_all(
                "unlikely query",
                sources=["empty", "failed", "crossref", "semantic_scholar"],
                limit=3,
            )
        )
    finally:
        aggregator._SOURCES = original

    assert no_hits["failed"] == []
    assert mixed["failed"] == ["failed"]


def test_tools_short_query_fallback_arms_agent():
    """Keyword gaps must not silently strip a capable agent of all its tools.

    Regression for the silent "agent has tools but keyword gate strips them all"
    bug. Two fixes are covered:
      1. the run_python keyword list now includes common analysis verbs, so a
         chat request like "analyze this dataset" arms run_python directly;
      2. data-task agents (bio / protocol) that match nothing fall back to
         their full tool set rather than going bare.
    """
    from backend.core.tools import select_triggered_tools

    keys = ["run_python", "run_r", "search_literature"]
    # New keywords cover common analysis verbs directly.
    assert select_triggered_tools(keys, "analyze this dataset", "chat") == ["run_python"]
    assert select_triggered_tools(keys, "train a model on this", "chat") == ["run_python"]
    # A bio request with no keyword hit still arms the agent (safety net).
    assert select_triggered_tools(keys, "do something with my experiment", "bio") == keys
    # Conceptual agents stay keyword-gated; greetings stay bare.
    assert select_triggered_tools(keys, "hi", "chat") == []
    assert select_triggered_tools(keys, "简单解释一下这个概念", "chat") == []
    assert select_triggered_tools(keys, "thanks", "chat") == []


def test_table_preview_embedded_in_review():
    """A generated CSV artifact must include a renderable preview in its review."""
    import csv as _csv
    import shutil
    from pathlib import Path

    from backend.core import executor

    tmp = Path(tempfile.mkdtemp(prefix="sw-table-"))
    csv_path = tmp / "counts.csv"
    with csv_path.open("w", encoding="utf-8", newline="") as handle:
        writer = _csv.writer(handle)
        writer.writerow(["gene", "log2fc", "pvalue"])
        writer.writerow(["TCF7", "2.3", "0.001"])
        writer.writerow(["FOXP3", "-1.8", "0.004"])

    review = executor._review_table(csv_path, "Table/counts.csv", csv_path.stat().st_size / 1024)
    assert "rows x 3 columns" in review, review
    assert "```sw-table" in review, review
    assert "TCF7" in review and "FOXP3" in review
    shutil.rmtree(tmp, ignore_errors=True)


def test_artifact_output_capped():
    """A runaway stdout must be truncated before persistence to protect the DB."""
    from backend.core import executor

    # Build a result with ~1MB of stdout; _persist_artifact should cap it.
    big = "x" * 1_000_000
    result = {"stdout": big, "stderr": "", "returncode": 0, "files": [],
              "artifact_review": [], "env_snapshot": "", "workdir": "", "artifact_dir": ""}
    captured = {}

    class _FakeQuery:
        def get(self, _aid):
            return None

    class _FakeDB:
        def add(self, artifact):
            captured["output_len"] = len(artifact.output)
            captured["truncated"] = "truncated" in artifact.output

        def commit(self):
            pass

        def close(self):
            pass

    import backend.db.database as dbmod
    original = dbmod.SessionLocal
    dbmod.SessionLocal = lambda: _FakeDB()
    try:
        executor._persist_artifact("sess", "python", "print('x')", result, "t", "")
    finally:
        dbmod.SessionLocal = original

    assert captured["output_len"] <= executor._ARTIFACT_OUTPUT_MAX_CHARS + 200
    assert captured["truncated"] is True


def test_sandbox_env_scrubs_secrets():
    """Generated-script subprocess env must not contain the user's API key."""
    from backend.core import sandbox

    env = sandbox.scrubbed_env({
        "PATH": "/usr/bin",
        "LLM_API_KEY": "sk-secret",
        "OPENAI_API_KEY": "sk-other",
        "PYTHONPATH": "/x",
    })
    assert "LLM_API_KEY" not in env
    assert "OPENAI_API_KEY" not in env
    assert env["PATH"] == "/usr/bin"
    assert env["PYTHONPATH"] == "/x"


def test_same_module_sessions_get_separate_artifact_dirs():
    """Two sessions of the same module must not share one artifact folder.

    Regression for the "chaotic directory" symptom: with the old single-string
    scope (module name only), every bio-analysis session wrote into the same
    ``artifacts/bio-analysis/`` folder, so files collided, sequence numbers
    crossed sessions, and the panel showed the wrong files. The fix nests a
    per-session subfolder keyed on the session title.
    """
    import os as _os
    import uuid as _uuid

    from backend.core import executor
    from backend.db import database as dbmod
    from backend.db import models as dbmodels

    # Two fake sessions in the SAME module, with distinct titles.
    sid_a = _uuid.uuid4().hex
    sid_b = _uuid.uuid4().hex
    pid = "proj-per-session"
    _os.environ["SCIENCE_WORKBENCH_TEST_DB"] = "1"

    # Use the real SessionLocal but insert ephemeral rows in a transaction.
    db = dbmod.SessionLocal()
    try:
        db.add(dbmodels.Project(id=pid, name="p", local_path=""))
        db.add(dbmodels.Session(id=sid_a, project_id=pid, title="bulk rna-seq day3", mode="bio"))
        db.add(dbmodels.Session(id=sid_b, project_id=pid, title="single-cell qc", mode="bio"))
        db.commit()
    finally:
        db.close()

    try:
        scope_a = executor._session_artifact_scope(sid_a)
        scope_b = executor._session_artifact_scope(sid_b)
        module_a, sub_a = scope_a.split("/", 1)
        module_b, sub_b = scope_b.split("/", 1)

        # Same module prefix (readable grouping), but distinct subfolders so
        # files never collide across sessions of the same module.
        assert module_a == module_b == "bio-analysis", (module_a, module_b)
        assert sub_a != sub_b, (sub_a, sub_b)
        assert sub_a == "bulk-rna-seq-day3", sub_a
        assert sub_b == "single-cell-qc", sub_b
    finally:
        db = dbmod.SessionLocal()
        try:
            db.query(dbmodels.Session).filter(dbmodels.Session.id.in_([sid_a, sid_b])).delete(synchronize_session=False)
            db.query(dbmodels.Project).filter(dbmodels.Project.id == pid).delete(synchronize_session=False)
            db.commit()
        finally:
            db.close()


def test_agents_md_memory_injected_into_prompt():
    """AGENTS.md content must reach the system prompt, per-project.

    The memory loader reads project-bound + global + default AGENTS.md files,
    caches by mtime, and re-reads when the file changes. The repo ships a
    backend/AGENTS.md default, so a fresh project folder still resolves to that
    default — this test focuses on the project-bound file (the user-facing
    path) and the cache-invalidation behaviour.
    """
    import tempfile
    from pathlib import Path

    from backend.core import memory

    tmp = Path(tempfile.mkdtemp(prefix="sw-mem-"))

    # Write a project AGENTS.md → it appears in the block.
    (tmp / "AGENTS.md").write_text("# Project rule\nAlways cite package versions.", encoding="utf-8")
    memory.invalidate_cache()
    block = memory.memory_block_for_prompt(str(tmp))
    assert "Project Memory" in block
    assert "Always cite package versions." in block

    # Edit the file → cache invalidates, new content reflected.
    (tmp / "AGENTS.md").write_text("# Updated\nUse GRCh38.", encoding="utf-8")
    block2 = memory.memory_block_for_prompt(str(tmp))
    assert "Use GRCh38." in block2
    assert "Always cite package versions." not in block2

    # Truncation guard: a huge file is capped, not blown through.
    (tmp / "AGENTS.md").write_text("x" * (memory._MAX_MEMORY_CHARS + 5000), encoding="utf-8")
    memory.invalidate_cache()
    block3 = memory.memory_block_for_prompt(str(tmp))
    assert len(block3) < memory._MAX_MEMORY_CHARS + 2000  # cap + wrapper text

    # remove the file → its content no longer appears.
    (tmp / "AGENTS.md").unlink()
    memory.invalidate_cache()
    block4 = memory.memory_block_for_prompt(str(tmp))
    assert "Use GRCh38." not in block4

    import shutil
    shutil.rmtree(tmp, ignore_errors=True)


def test_executor_recovers_missing_data_file_from_session_dir():
    """A run that reads a bare filename saved by a prior step should self-heal.

    Reproduces the reported footgun: step 1 saved pbmc3k_processed.h5ad into
    the session's Data folder, step 2 ran from the project root and read the
    bare filename → FileNotFoundError. The executor now detects missing-file
    errors, links the prior-step file into the cwd, and retries once.
    """
    import os as _os
    import tempfile
    from pathlib import Path

    from backend.core import executor

    tmp = Path(tempfile.mkdtemp(prefix="sw-recover-"))
    # Build a fake session artifacts dir with a Data file, as a prior step would.
    artifacts_dir = tmp / "artifacts" / "bio-analysis" / "test-scope"
    (artifacts_dir / "Data").mkdir(parents=True, exist_ok=True)
    (artifacts_dir / "Data" / "pbmc3k_processed.h5ad").write_bytes(b"fake-data")

    # Patch _resolve_dirs so the run uses our temp cwd + artifacts_dir, and
    # _session_artifact_scope to avoid touching the DB.
    original_resolve = executor._resolve_dirs
    executor._resolve_dirs = lambda sid, project_path="": (tmp, artifacts_dir)
    try:
        # Code reads a bare filename that does not exist at cwd but does exist
        # in the session Data folder. After recovery the file is linked in and
        # the (real) python open succeeds.
        code = (
            "with open('pbmc3k_processed.h5ad','rb') as f:\n"
            "    data = f.read()\n"
            "print('read', len(data), 'bytes')\n"
        )
        result = executor._run_code(code, "python", "recover-sess", project_path=str(tmp))
    finally:
        executor._resolve_dirs = original_resolve

    assert result["returncode"] == 0, result.get("stderr")
    assert "read 9 bytes" in result["stdout"], result["stdout"]
    # The recovery note is appended so the agent learns the right path.
    assert "auto-recovering missing files" in result["stderr"], result["stderr"]
    # cleanup the symlink/copy we created in cwd
    target = tmp / "pbmc3k_processed.h5ad"
    if target.exists():
        target.unlink()

    import shutil
    shutil.rmtree(tmp, ignore_errors=True)


def test_model_specs_context_window_adapts_to_model_and_tier():
    """The context meter must reflect the real model context window.

    Regression for the hard-coded 128K bug. Verified by live API probe: the
    base ``glm-5.2`` id already provides the full 1M context window (it
    accepts 400K-token inputs natively), so the spec must report 1M for the
    plain id — NOT 128K. Unknown models fall back safely.
    """
    from backend.core import model_specs

    # glm-5.2 base id is the 1M variant (verified by live probe, not docs).
    assert model_specs.context_window_for("glm-5.2") == 1_000_000
    # A redundant [1m] suffix on it normalises back to the same 1M (not 128K).
    assert model_specs.context_window_for("glm-5.2[1m]") == 1_000_000
    # Unknown model -> safe default, no crash, no spurious params.
    spec = model_specs.get_model_spec("some-unknown-model")
    assert spec.context_window == 128_000
    assert spec.supports_reasoning_effort is False
    # GLM-5.2 reasoning params are exposed.
    spec52 = model_specs.get_model_spec("glm-5.2")
    assert spec52.supports_reasoning_effort is True
    assert spec52.max_output_tokens == 65_536
    assert spec52.context_window == 1_000_000


def test_llm_extra_kwargs_protocol_aware():
    """reasoning kwargs must match the wire protocol (openai vs anthropic)."""
    from backend.core import llm

    # OpenAI protocol: reasoning_effort value.
    oai = llm._extra_model_kwargs("glm-5.2", "max", protocol="openai")
    assert oai == {"reasoning_effort": "max"}, oai
    oai_none = llm._extra_model_kwargs("glm-5.2", "none", protocol="openai")
    assert oai_none == {"reasoning_effort": "none"}
    # Anthropic protocol: thinking object.
    ant = llm._extra_model_kwargs("glm-5.2", "max", protocol="anthropic")
    assert ant == {"thinking": {"type": "enabled"}}, ant
    ant_off = llm._extra_model_kwargs("glm-5.2", "none", protocol="anthropic")
    assert ant_off == {"thinking": {"type": "disabled"}}
    # Legacy/unknown effort normalised.
    assert llm._extra_model_kwargs("glm-5.2", "auto", protocol="openai") == {"reasoning_effort": "max"}
    # Unknown model -> no params (don't 400 the endpoint).
    assert llm._extra_model_kwargs("mystery-model", "max", protocol="openai") == {}


def test_auto_compact_history_triggers_near_limit():
    """History past 70% of the window should be compacted, short history left alone."""
    import asyncio
    from backend.core import llm

    # Short history -> unchanged.
    short = [{"role": "user", "content": "hi"}, {"role": "assistant", "content": "hello"}]
    out, did = asyncio.run(llm._maybe_compact_history(short, "glm-5.2", system_prompt=""))
    assert did is False and out == short

    # Long history that exceeds 70% of a *tiny* window triggers the mechanical
    # fallback (summary call is stubbed by monkeypatching the summariser).
    big = [{"role": "user" if i % 2 == 0 else "assistant", "content": "x" * 2000} for i in range(40)]
    async def fake_summarise(msgs, model):
        return "SUMMARY"
    orig = llm._summarise_for_compact
    llm._summarise_for_compact = fake_summarise
    try:
        # Force a small window by using an unknown model (128K) but huge history
        # would not trigger — so use the estimate directly with a forced window.
        # Patch context_window_for to a small value.
        from backend.core import model_specs
        orig_cw = model_specs.context_window_for
        model_specs.context_window_for = lambda m: 4_000
        try:
            out2, did2 = asyncio.run(llm._maybe_compact_history(big, "glm-5.2", system_prompt=""))
        finally:
            model_specs.context_window_for = orig_cw
    finally:
        llm._summarise_for_compact = orig
    assert did2 is True
    assert len(out2) < len(big)
    assert "SUMMARY" in out2[0]["content"]
    # Recent turns kept verbatim.
    assert out2[-1]["content"] == big[-1]["content"]


def test_pubmed_falls_back_to_europepmc_on_connection_error():
    """When NCBI eutils is unreachable, search_pubmed must fall back to Europe PMC.

    Reproduces the reported "PubMed always fails" symptom: in networks where
    eutils.ncbi.nlm.nih.gov's TLS handshake is severed, the primary path raises
    an SSL/EOF error. The fallback to Europe PMC (mirrors the full PubMed
    corpus) must kick in and still return results tagged source="pubmed".
    """
    import asyncio
    from backend.services.literature import aggregator

    async def fake_eutils_failure(query, limit):
        # Simulate the SSL EOF that GFW-style blocking produces.
        raise ConnectionError("SSL: UNEXPECTED_EOF_WHILE_READING")

    async def fake_europepmc(query, limit):
        return [
            {"title": "Test article", "authors": "Smith J", "journal": "Nature",
             "year": 2026, "doi": "10.1/x", "abstract": "ab", "source": "pubmed",
             "url": "https://pubmed.ncbi.nlm.nih.gov/123/"}
        ]

    original_eutils = aggregator._search_pubmed_eutils
    original_epmc = aggregator.search_europepmc
    aggregator._search_pubmed_eutils = fake_eutils_failure
    aggregator.search_europepmc = fake_europepmc
    try:
        result = asyncio.run(aggregator.search_pubmed("covid", limit=5))
    finally:
        aggregator._search_pubmed_eutils = original_eutils
        aggregator.search_europepmc = original_epmc

    assert result is not None, "fallback should have produced results, not None"
    assert len(result) == 1
    assert result[0]["source"] == "pubmed"
    assert result[0]["title"] == "Test article"


def test_pubmed_no_fallback_on_empty_success():
    """A successful eutils search returning [] must NOT trigger the fallback.

    Empty results is a valid answer (the query matched nothing); only
    connection failures should switch to Europe PMC.
    """
    import asyncio
    from backend.services.literature import aggregator

    async def fake_eutils_empty(query, limit):
        return []  # genuinely no results, no error

    fallback_called = {"v": False}
    async def spy_europepmc(query, limit):
        fallback_called["v"] = True
        return [{"title": "should not happen", "source": "pubmed"}]

    original_eutils = aggregator._search_pubmed_eutils
    original_epmc = aggregator.search_europepmc
    aggregator._search_pubmed_eutils = fake_eutils_empty
    aggregator.search_europepmc = spy_europepmc
    try:
        result = asyncio.run(aggregator.search_pubmed("zzznomatch", limit=5))
    finally:
        aggregator._search_pubmed_eutils = original_eutils
        aggregator.search_europepmc = original_epmc

    assert result == [], result
    assert fallback_called["v"] is False, "fallback must not run on empty success"


def test_error_summary_extracts_python_exception_and_line():
    """Failed runs must surface a short, actionable error summary up front.

    The classic bio failure: a KeyError buried in a 100-line scanpy traceback.
    The model needs to see ``KeyError: 'RPL41' (at run_03.py:42)`` immediately,
    not have to read the whole traceback.
    """
    from backend.core import executor

    stderr = (
        "Traceback (most recent call last):\n"
        '  File "D:\\proj\\artifacts\\bio-analysis\\s1\\Script\\run_03.py", line 42, in <module>\n'
        "    sc.pl.rank_genes_groups_heatmap(adata, n_genes=5)\n"
        '  File "C:\\venv\\lib\\site\\scanpy\\plotting\\_tools.py", line 88, in fn\n'
        "    return plot_func(adata, **kwargs)\n"
        "  File \"...scanpy...\", line 220, in rank_genes_groups_heatmap\n"
        "    var_names = adata.var_names[genes]\n"
        "  File \"...pandas...\", line 154, in __getitem__\n"
        "    return self.get(key)\n"
        "KeyError: 'the label [RPL41] is not in the [index]'\n"
    )
    summary = executor._extract_error_summary("", stderr)
    assert "KeyError" in summary, summary
    assert "RPL41" in summary, summary
    assert "run_03.py:42" in summary, summary
    # Should include the helpful hint for var_names KeyErrors.
    assert "variable space" in summary.lower() or "var_names" in summary.lower(), summary

    # A successful run (no exception) returns an empty summary.
    assert executor._extract_error_summary("ok\n", "") == ""


def test_heavy_agents_get_more_tool_rounds():
    """Multi-step analysis agents (bio/protocol) need a larger tool-round budget."""
    from backend.core import llm

    assert llm.MAX_TOOL_ROUNDS >= 14, llm.MAX_TOOL_ROUNDS
    assert llm.max_tool_rounds_for("bio") >= llm.MAX_TOOL_ROUNDS
    assert llm.max_tool_rounds_for("protocol") >= llm.MAX_TOOL_ROUNDS
    assert llm.max_tool_rounds_for("chat") == llm.MAX_TOOL_ROUNDS
    assert llm.max_tool_rounds_for("bio") > llm.max_tool_rounds_for("chat")


def _run_all():
    tests = [
        test_pure_helpers,
        test_keyword_triggered_tools,
        test_literature_agent_is_retired,
        test_stream_openai_none_text_fragments,
        test_stream_openai_none_tool_arguments,
        test_stream_openai_tool_limit_forces_final_summary,
        test_execute_tool_call_never_raises,
        test_run_code_survives_none_stdout_stderr,
        test_script_filename_uses_sequence_and_content_slug,
        test_literature_empty_results_are_not_connection_failures,
        test_tools_short_query_fallback_arms_agent,
        test_table_preview_embedded_in_review,
        test_artifact_output_capped,
        test_sandbox_env_scrubs_secrets,
        test_same_module_sessions_get_separate_artifact_dirs,
        test_agents_md_memory_injected_into_prompt,
        test_executor_recovers_missing_data_file_from_session_dir,
        test_model_specs_context_window_adapts_to_model_and_tier,
        test_llm_extra_kwargs_protocol_aware,
        test_auto_compact_history_triggers_near_limit,
        test_pubmed_falls_back_to_europepmc_on_connection_error,
        test_pubmed_no_fallback_on_empty_success,
        test_error_summary_extracts_python_exception_and_line,
        test_heavy_agents_get_more_tool_rounds,
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
