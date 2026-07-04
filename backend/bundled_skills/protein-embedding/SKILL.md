---
description: Protein sequence embedding skill covering fair-esm2 and embedding-based downstream analysis.
---

# Protein Embedding Skill

Use this skill for protein language-model embeddings, sequence representation, similarity search, clustering, and downstream prediction features.

## Supported Tool Awareness

- fair-esm2: ESM-2 protein language model implementation and embeddings. Verify package name, model size, hardware needs, token limits, and license before use.

## Hard Constraints

- Always search for the current package documentation or authoritative method paper before giving commands.
- Always state which layer, pooling strategy, token handling, and model size are used for embeddings.
- Must preserve sequence IDs and report skipped, truncated, or invalid sequences.
- Must avoid training custom protein language models unless the user explicitly requests model development and has adequate data.
- Do not treat embedding similarity as proof of functional equivalence.
- Do not leak sequences across sessions or agents.

## Recommended Workflow

1. Validate FASTA input and sequence identifiers.
2. Select model size based on sequence length, GPU memory, and throughput.
3. Generate per-residue or per-sequence embeddings with documented pooling.
4. Save embeddings, metadata, package versions, and sequence filters.
5. Use established libraries for clustering, visualization, retrieval, or classifiers.
6. Interpret embedding results with domain evidence and uncertainty.
