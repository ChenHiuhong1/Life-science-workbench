# Confocal Immunofluorescence Knowledge Base

## Sample Preparation

### Fixation

- Use 4% paraformaldehyde at room temperature for 10 to 15 minutes for most adherent cells.
- Avoid over-fixation. Fixation longer than 30 minutes can increase autofluorescence and reduce antibody accessibility.
- Methanol fixation at -20 C for 5 minutes can work for some cytoskeletal targets but may disrupt membranes.
- Wash with PBS three times for 5 minutes after fixation.

### Permeabilization

- Use 0.1% to 0.3% Triton X-100 for 10 minutes at room temperature for intracellular targets.
- Use 0.05% Triton X-100 or saponin for membrane-sensitive antigens.
- Wash with PBS three times for 5 minutes after permeabilization.

### Blocking

- Use 5% normal serum from the secondary-antibody host species plus 1% BSA for 30 to 60 minutes at room temperature.
- Commercial blocking buffer or 3% BSA is acceptable when validated.

### Antibody Staining

- Primary antibody: 4 C overnight is preferred, or room temperature for 2 hours when validated.
- Dilute antibodies in blocking buffer.
- Wash with PBS-T containing 0.05% to 0.1% Tween-20 three times for 5 minutes.
- Secondary antibody: room temperature for 1 hour, protected from light.
- Wash with PBS-T three times for 5 minutes.

### Nuclear Counterstain And Mounting

- Use DAPI or Hoechst for 5 minutes at room temperature.
- Mount with antifade medium such as ProLong Gold or Vectashield.
- Seal coverslip edges when long-term storage is required.

## Multiplex Panel Design

- Choose fluorophores with minimal spectral overlap.
- Typical two-channel panel: DAPI, Alexa Fluor 488, Alexa Fluor 594.
- Typical three-channel panel: DAPI, AF488, AF555, AF647.
- Secondary-antibody host species must be compatible with primary antibodies.
- Include single-stain controls for spectral bleed-through.
- Consider autofluorescence quenching such as TrueBlack or CuSO4 for autofluorescent tissues.

## Acquisition Parameters

### Objective Selection

- 20x: overview and tissue architecture.
- 40x oil, NA around 1.3: routine cellular imaging.
- 63x oil, NA around 1.4: fine structures.
- 100x oil: ultrastructural detail when justified.
- Higher NA improves resolution.

### Laser And Detection

- Use sequential scanning to reduce bleed-through.
- Set detector windows to avoid emission overlap.
- Set pixel size according to Nyquist sampling when quantitative morphology is needed.
- Avoid saturation. Histogram peaks should stay below the detector maximum.

### Z-Stack

- Use a z-step around half the optical section thickness.
- Cover the full cell or tissue depth of interest.
- Report total z-depth and number of steps.

## Colocalization

- Pearson correlation measures linear association.
- Manders M1/M2 measures overlap fraction and is often more interpretable for colocalization.
- Use ImageJ/Fiji Coloc2, JACoP, CellProfiler, or another established tool rather than custom colocalization code.
- Include single-stain and negative controls.

## 3D Quantification

- Use z-stacks for 3D rendering and segmentation.
- Report voxel size, segmentation method, thresholding method, and validation strategy.
- Use established tools such as Imaris, Fiji 3D Viewer, CellProfiler, or scikit-image workflows.

## Super-Resolution

- STED can reach below conventional confocal resolution for fixed-sample fine structure.
- SIM is suitable for many live-cell and fixed-cell applications.
- STORM/PALM can reach very high localization precision but requires compatible fluorophores and careful controls.

## Common Pitfalls

- Overexposure invalidates quantitative intensity comparisons.
- Different laser power, detector gain, or offset between groups invalidates direct comparison.
- Unsubtracted background can inflate colocalization.
- Z drift affects live-cell and long-duration imaging.
- Autofluorescence is common in PFA-fixed and aged tissues.
- Photobleaching requires light protection and acquisition-time control.
- Undersampling violates resolution assumptions and distorts morphology.
