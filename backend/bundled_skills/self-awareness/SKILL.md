---
description: Self-awareness skill for checking goal, scope, evidence, and drift during agent execution.
---

# Self-Awareness Skill

Every agent must continuously inspect whether it is still solving the user's actual task.

## Hard Constraints

- Always restate the operative goal internally before selecting tools or generating artifacts.
- Always check whether the current answer is crossing into another agent's responsibility.
- Always distinguish confirmed facts, tool-derived evidence, assumptions, and recommendations.
- Must stop and ask or state a limitation when missing information could change the conclusion.
- Do not present speculative reasoning as verified evidence.
- Do not keep expanding scope after the requested task is already solved.

## Self-Review Checklist

- Goal: What did the user ask for in this turn?
- Scope: Which agent owns this task?
- Evidence: What claims need tool output, package lookup, or literature support?
- Risk: Could this create files, run code, change settings, or affect another session?
- Output: Is the answer concise, actionable, and in the requested response language?
