# Immunology Experiment Knowledge Base

## ELISA

### Standard Workflow

1. Coat capture antibody at 1 to 5 ug/mL, 100 uL per well, 4 C overnight.
2. Block with 1% to 5% BSA or 5% non-fat milk for 1 to 2 hours at 37 C.
3. Add standards and samples, usually 100 uL per well, for 1 to 2 hours at 37 C.
4. Add detection antibody according to the validated kit or antibody protocol.
5. Add HRP-streptavidin when using biotinylated detection antibody.
6. Develop with TMB for 15 to 30 minutes protected from light.
7. Stop with acid stop solution and read at 450 nm.

### Required Controls

- Blank wells with buffer only.
- Zero-standard wells.
- Positive control with known analyte concentration.
- Negative control or irrelevant sample.
- Technical duplicates or triplicates for each standard and sample.

### Key Parameters

- Wash with PBST containing 0.05% Tween-20, 3 to 5 times.
- Use a 7-point or broader standard curve when possible.
- Avoid saturated OD values at the top of the standard curve.
- Verify sample dilution to avoid hook effect.

## ELISPOT

### Standard Workflow

1. Coat PVDF membrane plate with capture antibody at 4 C overnight.
2. Block before adding cells.
3. Add viable cells and stimulant. Incubate without shaking.
4. Remove cells and add detection antibody.
5. Develop spots with validated substrate.
6. Count spots with an automated reader when available.

### Key Requirements

- Cell viability should usually exceed 90%.
- Include positive stimulation control such as PHA, ConA, or PMA/ionomycin when appropriate.
- Include medium-only negative control.
- Report spot-forming cells per defined cell count.

## Flow Cytometry Immunophenotyping

See `flow_cytometry.md` for gating, compensation, FMO controls, and panel design.

### Common Mouse Immune Panels

- T cells: CD45, CD3, CD4, CD8.
- T-cell subsets: FoxP3, IFN-gamma, IL-4, IL-17.
- B cells: CD45, B220 or CD45R, CD19, IgD.
- Myeloid cells: CD45, CD11b, F4/80, CD11c, Ly6G, Ly6C.
- Activation and memory: CD44, CD62L, CD69, CD25.

### Intracellular Cytokine Staining

1. Stimulate with PMA/ionomycin plus Brefeldin A or another secretion inhibitor.
2. Stain surface markers.
3. Fix and permeabilize with a validated intracellular staining buffer.
4. Stain intracellular cytokines or transcription factors.

## Proliferation Assays

### CFSE Or CellTrace

- Optimize dye concentration to minimize toxicity.
- Quench labeling with serum-containing medium.
- Allow recovery before stimulation when needed.
- Each cell division approximately halves dye intensity.

### EdU

- Use click chemistry detection.
- Confirm compatibility with antibody staining.
- Select pulse duration based on the biological question.

## Cytotoxicity Assays

### LDH Release

- Test multiple effector-to-target ratios.
- Include target-only spontaneous release and maximum lysis controls.
- Calculate specific lysis as `(experimental - spontaneous) / (maximum - spontaneous) * 100`.

### Flow-Based Killing

- Label target cells with CFSE or CellTrace Violet.
- Use viability dye such as PI or 7-AAD after co-culture.
- Report gating strategy and compensation controls.

## Cytokine Profiling

- Luminex or CBA can measure multiple cytokines in parallel.
- Validate dilution to avoid hook effect and high background.
- Include standard curves and quality controls.
- For cytokine storm monitoring, common serum markers include IL-6, TNF-alpha, IFN-gamma, IL-1beta, IL-10, and MCP-1.

## Mixed Lymphocyte Reaction

- Define responder cells and stimulator cells.
- Stimulator cells are usually irradiated or mitomycin C-treated.
- Co-culture for the validated duration.
- Readout may be thymidine incorporation, CFSE dilution, or metabolic viability assay.

## Antigen Presentation

- MHC tetramer staining can measure antigen-specific T-cell frequency.
- Cross-presentation assays require defined antigen, antigen-presenting cells, and responder T cells.

## Common Pitfalls

- Missing positive or negative controls makes immune readouts hard to interpret.
- Poor cell viability can mimic immune suppression.
- Batch effects across ELISA plates or flow runs require bridging controls.
- Cytokine assays are sensitive to freeze-thaw cycles and dilution errors.
- Do not infer antigen specificity without antigen-specific controls.
