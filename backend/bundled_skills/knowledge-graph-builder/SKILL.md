---
description: Conditional knowledge graph builder for study-design claims, entities, evidence, and relationships.
---

# Knowledge Graph Builder Skill

Use this skill only when the user explicitly asks for a knowledge graph.

## Hard Constraints

- Always require explicit user intent before generating a knowledge graph.
- Always preserve provenance for each edge when evidence is available.
- Must distinguish evidence-backed edges from hypothesis edges.
- Must use stable node identifiers for genes, proteins, diseases, cell types, datasets, methods, and papers when possible.
- Do not create a graph by default after study design.
- Do not present hypothetical edges as known biology.

## Suggested Schema

```json
{
  "nodes": [
    {"id": "string", "type": "gene|protein|disease|cell_type|method|paper|dataset|hypothesis", "label": "string"}
  ],
  "edges": [
    {"source": "id", "target": "id", "type": "supports|contradicts|regulates|measures|uses|tests", "evidence": "string", "status": "evidence|hypothesis|unknown"}
  ]
}
```
