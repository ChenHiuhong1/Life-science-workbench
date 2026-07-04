---
description: Protein-ligand and structure docking skill covering DiffDock and package-first docking workflows.
---

# Protein Docking Skill

Use this skill for protein-ligand docking, binding-pose prioritization, and docking workflow review.

## Supported Tool Awareness

- DiffDock: diffusion-based protein-ligand docking; verify current package, model weights, supported ligand formats, and citation before use.

## Hard Constraints

- Always search for maintained docking software or authoritative method papers before proposing docking code.
- Always inspect receptor preparation, ligand protonation, tautomer state, stereochemistry, cofactors, waters, metals, and binding site definition.
- Must report docking as hypothesis generation unless supported by experimental binding data.
- Must keep docking scores, confidence scores, and binding free energy estimates conceptually separate.
- Do not implement a docking engine, scoring function, force field, or conformer generator from scratch.
- Do not claim binding, selectivity, or potency from docking alone.

## Recommended Workflow

1. Confirm receptor structure source and quality.
2. Prepare ligand and receptor with documented tools.
3. Select DiffDock or another verified docking package based on task constraints.
4. Run pose generation with reproducible parameters.
5. Filter poses by confidence, chemistry, sterics, known active-site constraints, and consistency with evidence.
6. Recommend orthogonal validation such as mutagenesis, SPR, ITC, DSF, enzymatic assay, or cell assay.
