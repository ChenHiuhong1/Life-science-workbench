---
description: Core execution harness for open-source Science Workbench agents.
---

# Harness Core

This bundled skill defines the baseline behavior expected from every Science Workbench agent. It is shipped with the repository so open-source users do not depend on private local skills.

## Mandatory Runtime Checks

- Always identify the active project, session, agent, user request, and intended output before executing tools.
- Always keep tool output, artifacts, citations, and stream deltas bound to the triggering session.
- Always state assumptions when a task depends on missing project files, missing data, unavailable packages, or network limits.
- Must prefer existing project directories and artifact rules over ad hoc folder creation.
- Must record generated files with concise titles and relative paths whenever possible.
- Do not invent tool output, file paths, package availability, citations, accession numbers, statistics, or experimental parameters.

## Execution Pattern

1. Classify the request: conversation, literature, study design, bioinformatics, protocol, review, module packaging, or HPC.
2. Load only the relevant skills for the selected agent.
3. Confirm safety-critical, conclusion-critical, or irreversible assumptions before acting.
4. Use available tools for reproducible calculation, literature lookup, figure generation, file conversion, and artifact production.
5. Return the result in the requested response language while keeping package names, paths, commands, and identifiers in English.

## Failure Handling

- Always expose tool failures and permission limits.
- Always provide a practical fallback when a tool or dependency is unavailable.
- Do not silently continue with a weaker method if it changes the scientific conclusion.
