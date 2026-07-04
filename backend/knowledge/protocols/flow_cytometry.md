# Flow Cytometry Knowledge Base

## Panel Design

- Pair strong antigens with dimmer fluorophores and weak or rare antigens with brighter fluorophores.
- Avoid severe spectral overlap for co-expressed markers.
- Multicolor panels require single-stain controls for compensation or unmixing.
- Titrate antibodies instead of assuming catalog dilution.
- Include viability dye when live/dead discrimination matters.

## Required Controls

- Unstained control for baseline.
- Single-stain controls for compensation or spectral unmixing.
- FMO controls for gates in multicolor panels.
- Biological positive and negative controls when possible.
- Isotype controls are context-dependent and should not replace FMO controls.

## Typical Staining Workflow

1. Count cells and record viability.
2. Block Fc receptors when relevant.
3. Stain viability dye before fixation when using fixable dyes.
4. Stain surface markers at validated concentrations.
5. Wash with appropriate FACS buffer.
6. Fix and permeabilize for intracellular targets when needed.
7. Acquire with stable instrument settings.

## Gating

- Show the full gating path: events, debris exclusion, singlets, live cells, lineage or target population, then subsets.
- Record event counts at each gate.
- Use FMO controls for objective threshold setting.

## Common Pitfalls

1. Missing compensation or unmixing controls.
2. No viability gate.
3. Subjective gates without FMO support.
4. Insufficient events for rare populations.
5. Batch-to-batch instrument drift without calibration.
