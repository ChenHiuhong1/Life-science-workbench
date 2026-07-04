# Spatial Multiomics Knowledge Base

## Platforms

- 10x Visium: spot-level transcriptomics, usually multiple cells per spot.
- Slide-seq and Stereo-seq: higher spatial resolution bead or array platforms.
- MERFISH and seqFISH: imaging-based molecule detection.
- CosMx and Xenium: commercial in situ platforms with subcellular localization.
- Spatial proteomics platforms may require separate image analysis and registration.

## Standard Workflow

1. Load expression matrix, coordinates, and image metadata.
2. Perform QC on spots, cells, or fields of view depending on platform.
3. Normalize and detect spatially variable features.
4. Cluster or segment spatial domains.
5. Integrate histology or morphology when available.
6. Deconvolve or map cell types using a matched single-cell reference when relevant.
7. Analyze neighborhoods, spatial colocalization, and ligand-receptor relationships with distance awareness.
8. Visualize results on tissue coordinates.

## Rigor Rules

- For Visium, do not claim single-cell resolution.
- Use sample, slice, donor, or region as the statistical unit when comparing conditions.
- Report reference single-cell dataset source and coverage for deconvolution.
- Include sensitivity analysis for bin size, segmentation, or domain number when conclusions depend on them.
- Account for spatial autocorrelation when testing spatial patterns.

## Common Pitfalls

1. Treating spots or cells as independent samples across conditions.
2. Ignoring tissue regions and histology.
3. Using an unmatched reference for deconvolution.
4. Overinterpreting ligand-receptor predictions as causal signaling.
5. Comparing images acquired with inconsistent settings.
