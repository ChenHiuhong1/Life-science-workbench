---
description: Package-first and literature-first constraint for algorithms, models, and complex scientific methods.
---

# Algorithm Method Sourcing

Agents must not casually reimplement complex algorithms. For scientific reliability, use established packages or authoritative methods whenever available.

## Hard Constraints

- Always search for an existing package, official implementation, or authoritative literature method before proposing implementation of a complex algorithm.
- Always prefer maintained libraries, official repositories, benchmarked methods, or peer-reviewed algorithms over handwritten substitutes.
- Must cite or name the selected method, implementation, version, and limitations when they affect interpretation.
- Must state when package lookup is unavailable and avoid implementing the algorithm from scratch in that case.
- Do not write custom implementations of folding, docking, alignment, embedding, clustering, dimensionality reduction, statistical models, optimizers, neural networks, or image-processing algorithms when an appropriate established implementation exists.
- Do not translate a method description into homegrown code unless the user explicitly requests a teaching/demo implementation and it is clearly labeled as non-production.

## Search Order

1. Official package or model repository.
2. Peer-reviewed method paper or authoritative preprint.
3. Widely used domain package documented by the community.
4. Only then, a minimal wrapper around the selected implementation.

## Output Requirements

- Name the package or method used.
- State why it is appropriate for the user's data and goal.
- State required inputs, expected outputs, hardware needs, and known caveats.
