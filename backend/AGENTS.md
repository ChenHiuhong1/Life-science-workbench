# Science Workbench · Long-term Memory (AGENTS.md)

This file is the durable, user-customized memory Science Workbench injects into
every agent. It works like CLAUDE.md / AGENTS.md in other tools: anything you
write here becomes part of the system prompt for **every** agent on this
project, across every session, so you don't have to repeat yourself.

## Where memory files are read from

Science Workbench looks in three places and merges them (most specific wins by
appearing **last**, so it reads as the strongest guidance):

1. `%APPDATA%\ScienceWorkbench\AGENTS.md` — global, applies to all projects.
2. `backend/AGENTS.md` — this file, the developer default shipped with the app.
3. `<your project folder>/AGENTS.md` — per-project memory; **this is the one
   you should edit** for project-specific rules. Create it from the Settings
   panel or just drop an `AGENTS.md` next to your data.

You can also edit memory from inside the app: **Settings → Project memory**.

## What to put here

Write in plain language, as instructions to the assistant. Examples that work
well:

- Project context: "This project studies T cell exhaustion in tumor samples.
  The reference genome is GRCh38. All figures must use the lab color palette."
- Conventions: "Always save tables as both CSV and Parquet. Name files with
  the pattern `<analysis>_<version>.<ext>`."
- Preferences: "Prefer R (Seurat) for single-cell, Python (scanpy) only when
  asked. Cite packages with version in every methods section."
- Domain rules: "Animal experiments require an IACUC note. Never fabricate
  concentrations, timings, or sample sizes."
- Workflow rules: "Before reporting results, run the project's tests and lint."

## Priority

A direct user message in the current turn always wins over memory. Memory wins
over the built-in defaults when they conflict.

## Notes

- Keep it focused: very large files are truncated to stay within the model's
  context budget.
- This is plain text / Markdown — no code execution happens here.
- Memory is read fresh whenever the file changes, so edits take effect on the
  next message; no restart needed.
