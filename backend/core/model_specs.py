"""Model capability registry.

Centralises per-model facts so the rest of the backend (and the frontend via the
settings API) can reason about a model's real context window, output cap, and
which optional API parameters it accepts. Keeping this in one place is what
lets the UI show an accurate context meter (no more hard-coded 128K) and lets
``stream_chat`` send the parameters a model actually supports (e.g. GLM-5.2's
``reasoning_effort`` / ``max_tokens=65536``).

Lookup rules
------------
- Match is by *normalised* model name: lowercased, ignoring a trailing
  ``[1m]`` / ``-1m`` tier suffix. The tier is returned alongside the spec so
  callers can pick the long-context variant (``[1m]``) when the user opted in.
- Unknown models fall back to a safe default (128K context, 8K output, no
  optional params) so the app keeps working for any OpenAI-compatible endpoint.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Dict


@dataclass
class ModelSpec:
    """Per-model capability + API-parameter facts."""

    # Human-readable family name for display.
    label: str
    # Standard context window in tokens (without long-context tier).
    context_window: int = 128_000
    # Long-context window in tokens when the ``[1m]``-style tier is requested.
    long_context_window: int | None = None
    # Suffix that activates the long-context tier, e.g. "[1m]".
    long_context_suffix: str | None = None
    # Max output tokens the model accepts in ``max_tokens``.
    max_output_tokens: int = 8_192
    # Whether the model accepts a ``reasoning_effort`` parameter
    # (none/high/max for GLM-5.2 family).
    supports_reasoning_effort: bool = False
    # Whether the model accepts an OpenAI-style ``thinking`` object.
    supports_thinking_param: bool = False
    # Default reasoning_effort value when none is specified.
    default_reasoning_effort: str = "max"
    # Marks specs that ship from this registry (used for debugging).
    note: str = ""


# The default fallback for any model not listed below. Conservative so we never
# over-send parameters an unknown endpoint would reject.
_DEFAULT = ModelSpec(
    label="Generic OpenAI-compatible",
    context_window=128_000,
    max_output_tokens=8_192,
    supports_reasoning_effort=False,
    default_reasoning_effort="max",
)


_SPECS: Dict[str, ModelSpec] = {
    # ---- Zhipu GLM family --------------------------------------------------
    "glm-5.2": ModelSpec(
        label="GLM-5.2",
        # Verified by probe: glm-5.2 accepts 400K-token inputs natively, so the
        # base model id is already the 1M-context variant. (The "[1m]" suffix
        # some docs mention returns "model not found" on the Anthropic endpoint
        # for most Coding Plan tiers, so we don't expose it as a separate id.)
        context_window=1_000_000,
        long_context_window=None,
        long_context_suffix=None,
        max_output_tokens=65_536,
        supports_reasoning_effort=True,
        supports_thinking_param=True,
        default_reasoning_effort="max",
        note="Base glm-5.2 id already provides the full 1M context window.",
    ),
    "glm-5.1": ModelSpec(
        label="GLM-5.1",
        context_window=200_000,
        max_output_tokens=65_536,
        supports_reasoning_effort=True,
        supports_thinking_param=True,
        default_reasoning_effort="max",
    ),
    "glm-4.6": ModelSpec(
        label="GLM-4.6",
        context_window=128_000,
        max_output_tokens=16_384,
        supports_reasoning_effort=True,
        default_reasoning_effort="high",
    ),
    "glm-4.5": ModelSpec(
        label="GLM-4.5",
        context_window=128_000,
        max_output_tokens=16_384,
        supports_reasoning_effort=True,
        default_reasoning_effort="high",
    ),
    "glm-4-plus": ModelSpec(
        label="GLM-4-Plus",
        context_window=128_000,
        max_output_tokens=4_096,
    ),
    "glm-4": ModelSpec(
        label="GLM-4",
        context_window=128_000,
        max_output_tokens=4_096,
    ),
    # ---- Other common providers (best-effort) ------------------------------
    "deepseek-chat": ModelSpec(
        label="DeepSeek Chat",
        context_window=64_000,
        max_output_tokens=8_192,
    ),
    "deepseek-reasoner": ModelSpec(
        label="DeepSeek Reasoner",
        context_window=64_000,
        max_output_tokens=32_768,
    ),
    "gpt-4o": ModelSpec(
        label="GPT-4o",
        context_window=128_000,
        max_output_tokens=16_384,
    ),
    "moonshot-v1-8k": ModelSpec(
        label="Kimi v1 (8K)",
        context_window=8_000,
        max_output_tokens=4_096,
    ),
}

_LONG_CONTEXT_SUFFIX_RE = re.compile(r"\s*\[(?P<tier>[0-9]+[mk])\]\s*$", re.IGNORECASE)


def _normalise(model: str) -> tuple[str, str | None]:
    """Split a model id into (base_key, long_context_tier).

    ``"glm-5.2[1m]"`` -> ``("glm-5.2", "1m")``; ``"glm-5.2"`` -> ``("glm-5.2", None)``.
    """
    if not model:
        return "", None
    match = _LONG_CONTEXT_SUFFIX_RE.search(model)
    if match:
        tier = match.group("tier").lower()
        base = _LONG_CONTEXT_SUFFIX_RE.sub("", model).strip().lower()
        return base, tier
    return model.strip().lower(), None


def get_model_spec(model: str) -> ModelSpec:
    """Return the spec for a model id, applying the long-context tier if present."""
    base, tier = _normalise(model or "")
    spec = _SPECS.get(base)
    if spec is None:
        return _DEFAULT
    if tier and spec.long_context_window and spec.long_context_suffix:
        # Return a copy with the long-context window swapped in.
        return ModelSpec(
            label=f"{spec.label} ({tier.upper()})",
            context_window=spec.long_context_window,
            long_context_window=spec.long_context_window,
            long_context_suffix=spec.long_context_suffix,
            max_output_tokens=spec.max_output_tokens,
            supports_reasoning_effort=spec.supports_reasoning_effort,
            supports_thinking_param=spec.supports_thinking_param,
            default_reasoning_effort=spec.default_reasoning_effort,
            note=spec.note,
        )
    return spec


def context_window_for(model: str) -> int:
    """Convenience: effective context window in tokens for a model id."""
    return get_model_spec(model).context_window


def long_context_model_id(model: str) -> str:
    """Return the model id with the long-context suffix applied if supported.

    Used when the user opts into 1M context: the raw ``model`` is rewritten to
    e.g. ``glm-5.2[1m]`` before the API call. If the model does not support a
    long-context tier, the id is returned unchanged.
    """
    spec = get_model_spec(model)
    base, tier = _normalise(model or "")
    if tier:
        return model  # already has a tier
    if spec.long_context_suffix and base in _SPECS:
        return f"{base}{spec.long_context_suffix}"
    return model


def list_known_models() -> list[dict]:
    """Return known model ids + specs for the settings UI / model picker."""
    out = []
    for key, spec in _SPECS.items():
        item = {
            "id": key,
            "label": spec.label,
            "context_window": spec.context_window,
            "max_output_tokens": spec.max_output_tokens,
            "supports_reasoning_effort": spec.supports_reasoning_effort,
            "supports_long_context": spec.long_context_window is not None,
            "long_context_window": spec.long_context_window,
            "long_context_suffix": spec.long_context_suffix,
        }
        out.append(item)
        # Also surface the long-context variant as its own pickable entry.
        if spec.long_context_suffix:
            out.append({
                "id": f"{key}{spec.long_context_suffix}",
                "label": f"{spec.label} ({spec.long_context_suffix.strip('[]').upper()} context)",
                "context_window": spec.long_context_window,
                "max_output_tokens": spec.max_output_tokens,
                "supports_reasoning_effort": spec.supports_reasoning_effort,
                "supports_long_context": True,
                "long_context_window": spec.long_context_window,
                "long_context_suffix": spec.long_context_suffix,
            })
    return out
