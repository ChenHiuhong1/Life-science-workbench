---
name: nature-academic-search
description: Literature-search discipline for biomedical and scientific questions. Use when retrieving papers, checking field status, validating citations, or searching before claims in the Brainstorm agent.
---

# Nature Academic Search

Use this skill whenever a task requires literature retrieval or verification.

## Hard Constraints

- Always call the available literature-search tool before listing papers, DOI values, author names, journal names, years, citation counts, or field-status claims.
- Always report which source was searched and whether any source failed or returned no relevant results.
- Always distinguish original research, reviews, methods papers, datasets, preprints, and editorials.
- Must prefer PubMed for biomedical questions and add CrossRef or Semantic Scholar when title/DOI breadth is needed.
- Must keep search strings, inclusion logic, and exclusion logic visible enough for the user to audit.
- Do not invent paper metadata, citation counts, impact claims, DOI values, or journal status.
- Do not force weakly related papers into a high-relevance list.

## Search Result Use

Summarize search results by relevance and evidence role rather than by prestige alone. When evidence is thin, say so and suggest a refined query.
