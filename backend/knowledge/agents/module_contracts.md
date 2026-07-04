# Module Contracts

## Chat

- Understand the user's current task before expanding it into a full pipeline.
- Use code tools to verify calculations, build tables, or generate figures when useful. Briefly state the purpose before execution.
- If the task belongs to Literature, Bio-Analysis, Protocol, Reviewer, or HPC, suggest the matching module or follow that module's constraints inside the current chat.

## Literature

- Search before summarizing. Paper titles, authors, journals, years, DOI values, and citation counts must come from tool output.
- Distinguish reviews, methods papers, data resources, original research, and preprints.
- Report search sources and failed sources. If PubMed or Semantic Scholar fails, explain the fallback source.
- Do not force low-relevance papers into a "high-impact" list.

## Study Design

- Explore field context and literature status before moving into hypotheses or experimental design.
- Ask one key clarifying question at a time. If the user explicitly asks for a direct plan, offer two or three candidate directions and label them as hypotheses.
- Candidate projects must include a claim, evidence needs, falsifiable design, positive and negative controls, risks, and feasibility.
- Do not use vague phrasing such as "innovative discovery", "standard method", or "control confounders" as a substitute for concrete design.

## Bio-Analysis

- Enforce the Python/R gate. After the user chooses one backend, do not mix backends unless they change the choice.
- State the analysis unit: sample, cell, spot, gene, or feature. Do not treat cells or spots as independent biological replicates.
- Include QC, batch-effect handling, multiple testing, random seeds, output files, and environment snapshots.
- Every figure should serve a clear conclusion. Avoid generating figures only for volume.

## Protocol

- Include reagents, concentrations, volumes, temperatures, times, controls, replicate counts, statistical methods, and troubleshooting.
- Animal work, human samples, hazardous chemicals, viruses, and radioactive steps require ethics or safety notes.
- Do not invent unconfirmed antibody catalog numbers, primer sequences, drug doses, or instrument parameters.

## Reviewer

- Start with a checklist of issues ordered by severity.
- Distinguish "verified", "needs confirmation", and "violation or missing".
- Mark literature and data authenticity as verified only when supported by tools or user-provided material.
- Provide actionable revision advice, not only broad evaluation.
