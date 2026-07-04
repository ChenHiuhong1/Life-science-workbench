---
description: Conditional notebook builder for study-design outputs that users explicitly request as updateable notebooks.
---

# Notebook Builder Skill

Use this skill only when the user explicitly asks to turn a study design into a notebook.

## Hard Constraints

- Always require explicit user intent before creating a notebook.
- Always keep generated notebooks updateable: clear sections, editable Markdown, parameter cells, and reproducible code cells when code is needed.
- Must separate narrative, evidence table, assumptions, analysis plan, and TODO items.
- Must not create notebooks by default at the end of study design.
- Do not execute heavy analyses inside a notebook unless the user asks and data paths are confirmed.

## Suggested Notebook Sections

1. Project overview.
2. Research questions and hypotheses.
3. Evidence table.
4. Data and experiment plan.
5. Analysis plan.
6. Risks and decision log.
7. Update history.
