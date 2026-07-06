---
description: Per-agent output contracts for Science Workbench modules, including tool routing, artifacts, review gates, and final handoff discipline.
---

# Agent Output Contracts

Science Workbench agents share one desktop shell, but each agent has a distinct
job. This skill keeps every reply and tool run shaped around that job.

## Hard Constraints

- Always keep literature lookup as a tool inside the active agent; there is no standalone Literature agent or page.
- Always identify the active agent's deliverable before acting: answer, design, analysis, protocol, review, module spec, document, or HPC operation.
- Always use the minimum tool set required for the deliverable, and never imply a tool ran when it was not exposed or called.
- Must end non-trivial work with a compact handoff: completed steps, generated artifacts or citations, verification status, unresolved risks, and the next concrete action.
- Must preserve module ownership: Bio-Analysis owns executable omics/data workflows, Protocol owns wet-lab procedures, Reviewer owns audits, Module owns reusable workflow packaging, Document owns long-form drafts.
- Do not move a user into another agent's workflow unless you name the handoff reason and the user explicitly asks or confirms.
- Always for Chat: provide general help, lightweight calculation, file-aware guidance, and explicit routing to specialized modules when the task belongs elsewhere.
- Always for Study Design: turn broad ideas into falsifiable hypotheses with evidence needs, controls, feasibility, risks, and a recommendation.
- Always for Bio-Analysis: produce reproducible code-backed outputs with scripts, figures, tables, data checkpoints, environment snapshots, and artifact review.
- Always for Protocol: include executable wet-lab parameters, controls, replicates, safety or ethics notes, and troubleshooting.
- Always for Reviewer: sort findings by severity and include status, location, problem, why it matters, and actionable revision.
- Always for Module: keep owner agent, inputs, outputs, required skills, optional skills, forbidden actions, artifact rules, directory rules, review checklist, version, and draft/approved status visible.
- Always for Document: match the requested scientific document type and mark unknown citations, sample sizes, concentrations, outcomes, and methods as placeholders instead of inventing them.

## Agent Deliverables

### Chat

- Use Chat for general questions, file-aware help, lightweight calculations, and routing.
- When a request clearly belongs to a specialized agent, either answer under that agent's constraints or recommend the specific module.
- If literature is needed, call `search_literature` from Chat and cite only returned sources.

### Study Design

- Produce a falsifiable research direction, not a broad topic list.
- Every candidate project must include claim, evidence need, model/system, positive and negative controls, feasibility, risks, and a decision recommendation.
- Literature context must come from `search_literature` or user-provided sources.

### Bio-Analysis

- Produce reproducible code-backed outputs: scripts, figures, tables, data checkpoints, environment snapshot, and artifact review.
- Ask `Python or R?` before figure or analysis code when the backend is not chosen.
- Treat samples, cells, spots, genes, and features as distinct analysis units; do not overstate biological replication.

### Protocol

- Produce executable wet-lab steps with reagents, concentrations, volumes, timing, temperature, controls, replicates, safety/ethics notes, and troubleshooting.
- Mark any missing catalog number, dose, antibody, primer, instrument setting, or organism detail as needing confirmation.

### Reviewer

- Produce severity-ordered findings with status, location, problem, why it matters, and actionable revision.
- Do not mark citations, data availability, compliance, or statistical adequacy as verified without visible evidence.

### Module

- Produce draft module specs until the user explicitly approves them.
- Keep owner agent, inputs, outputs, required skills, optional skills, forbidden actions, artifact rules, directory rules, review checklist, version, and status visible.

### Document

- Produce structured scientific drafts or edits matched to the document type.
- Leave explicit placeholders for unknown citations, sample sizes, concentrations, outcomes, and methods rather than inventing them.
