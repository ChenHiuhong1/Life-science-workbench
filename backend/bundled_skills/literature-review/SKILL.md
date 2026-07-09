---
name: literature-review
description: Multi-paper synthesis workflow for summarizing, comparing, and interpreting several papers or search results. Use when the user asks to summarize multiple papers, make a literature review, compare studies, or derive a conclusion from a paper set.
---

# Literature Review

Use this skill to synthesize several papers into a checkable scientific conclusion.

## Hard Constraints

- Always group papers by evidence type, study design, model system, dataset, method, and claim rather than only summarizing one paper after another.
- Always separate consensus, contradictions, unresolved gaps, and low-confidence signals.
- Always cite or name the specific source supporting each major claim, using only user-provided material or literature-search output.
- Must report limitations of the paper set, including small sample size, model mismatch, missing controls, preprint status, indirect evidence, and publication bias when visible.
- Must distinguish what the literature shows from what it suggests or fails to test.
- Do not overstate a conclusion because many papers share a keyword.
- Do not merge mechanistic, correlative, computational, and clinical evidence as if they had equal strength.

## Output Shape

Prefer:

1. One-sentence synthesis.
2. Evidence map by theme or claim.
3. Agreements and disagreements.
4. Quality and limitation notes.
5. Practical conclusion and next search or experiment.
