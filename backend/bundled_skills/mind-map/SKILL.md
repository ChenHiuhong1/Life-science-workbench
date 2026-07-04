---
description: Conditional mind-map skill for study-design structure and research-route visualization.
---

# Mind Map Skill

Use this skill only when the user asks for a mind map, route map, concept map, Mermaid diagram, or similar structured visual plan.

## Hard Constraints

- Always make mind-map generation conditional on an explicit user request.
- Always keep nodes short enough to remain readable.
- Must preserve hierarchy: objective, hypotheses, evidence, methods, validation, risks, and outputs.
- Do not replace the main study design with a diagram-only answer unless the user asks.
- Do not include unsupported claims as confirmed nodes.

## Output Options

- Markdown outline for quick editing.
- Mermaid mindmap or flowchart when supported.
- JSON node-edge structure for later graph conversion.
