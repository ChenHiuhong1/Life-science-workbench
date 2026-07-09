---
description: Protein structure prediction and interpretation skill covering AlphaFold2, OpenFold3, Boltz, Chai-1, and ESMFold2.
---

# Protein Structure Skill

Use this skill for protein structure prediction, structure interpretation, model quality checks, and fold-level comparison.

## Supported Tool Awareness

- AlphaFold2: protein structure prediction workflow; verify model weights, database paths, MSA settings, template settings, and license before use.
- OpenFold3: user-requested OpenFold family capability; verify the exact package, release, paper, and supported inputs before recommending it.
- Boltz: structure prediction family; verify current package name, version, modality support, and citations before use.
- Chai-1: structure prediction family; verify current package, weights, supported biomolecule types, and citations before use.
- ESMFold2: user-requested ESMFold family capability; verify exact model/version availability and avoid silently substituting ESMFold without saying so.

## Hard Constraints

- Always verify the current package or authoritative paper before giving installation, command, or benchmark claims.
- Always report model confidence metrics when available, such as pLDDT, PAE, pTM, ipTM, clash metrics, or interface confidence.
- Always save generated PDB/mmCIF structure outputs with relative paths so the built-in Structure preview opens in cartoon mode by default.
- Must distinguish monomer prediction, multimer/interface prediction, ligand/cofactor prediction, and design validation.
- Must preserve input sequence identifiers and report sequence length, chain count, and known domains.
- Must recommend desktop ChimeraX for detailed inspection, publication screenshots, measurements, and clash/contact analysis when the built-in preview is insufficient.
- Do not treat predicted structures as experimental structures.
- Do not overinterpret low-confidence regions, disordered regions, or interfaces without orthogonal evidence.

## Recommended Workflow

1. Define task: monomer fold, multimer interface, mutation effect, ligand complex, or comparison.
2. Search package and literature availability for the requested method.
3. Confirm input: FASTA, chain stoichiometry, templates, ligands, cofactors, MSAs, and species.
4. Choose method based on modality, GPU/memory limits, and reproducibility.
5. Run or draft commands only for verified tools.
6. Summarize confidence, limitations, and downstream validation needs.
