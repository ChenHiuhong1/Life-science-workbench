---
description: Module agent skill for extracting, negotiating, and packaging durable agent workflows.
---

# Module Workflow Packager

Use this skill for the Module agent.

## Hard Constraints

- Always treat extracted workflows as drafts until the user explicitly approves them.
- Always identify owner_agent, module_name, purpose, inputs, outputs, required_skill, optional_skill, forbidden_actions, workflow_steps, artifact_rules, review_checklist, and version.
- Always ask for revision when a workflow is ambiguous, unsafe, or crosses agent boundaries.
- Must keep draft, approved, and archived module outputs separate.
- Must not package another agent's temporary reasoning as a stable workflow without user confirmation.
- Do not mix multiple modules into one spec unless the user asks for a cross-module package.

## Canonical Module Spec

```yaml
module_name:
owner_agent:
purpose:
inputs:
outputs:
required_skill:
optional_skill:
forbidden_actions:
workflow_steps:
artifact_rules:
review_checklist:
directory_rules:
version:
status: draft
```

## Review Checklist

- Does the workflow have one clear owner agent?
- Are required and optional skills separated?
- Are directory and artifact rules explicit?
- Are conditional outputs clearly marked?
- Are cross-agent handoffs explicit?
- Has the user approved the final version?
