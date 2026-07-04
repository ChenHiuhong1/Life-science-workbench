---
description: Protein design skill covering ProteinMPNN, LigandMPNN, and SolubleMPNN.
---

# Protein Design Skill

Use this skill for sequence design, inverse folding, ligand-aware design, and solubility-aware sequence optimization.

## Supported Tool Awareness

- ProteinMPNN: inverse folding and sequence design from fixed or partially fixed backbones.
- LigandMPNN: ligand-aware sequence design; verify supported ligand representation and constraints before use.
- SolubleMPNN: solubility-oriented design; verify exact package/version and benchmark scope before use.

## Hard Constraints

- Always search for the official implementation, package, and method paper before proposing a design workflow.
- Always define fixed residues, mutable residues, chain constraints, interface constraints, ligand constraints, and forbidden mutations before design.
- Always separate generation, filtering, structure prediction, and experimental validation.
- Must use established tools for inverse folding, scoring, and structure validation when available.
- Do not claim a design is functional, soluble, or binding without validation.
- Do not invent wet-lab validation results, binding affinities, expression yields, or thermostability.

## Recommended Workflow

1. Define the design objective: stability, binder, enzyme, interface, ligand pocket, solubility, or rescue mutation.
2. Gather structure input: PDB/mmCIF, chain IDs, residue numbering, ligand IDs, and constraints.
3. Select ProteinMPNN, LigandMPNN, SolubleMPNN, or another verified package based on objective.
4. Generate candidate sequences with reproducible seeds.
5. Filter by constraints, sequence identity, liability motifs, charge, hydrophobicity, and predicted structure confidence.
6. Recommend experimental validation rather than presenting computational scores as proof.
