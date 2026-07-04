# Wet-Lab Protocol Review Checklist

## Scope

Use this checklist to audit generated or user-provided wet-lab protocols for missing controls, unsafe assumptions, incomplete parameters, and reproducibility gaps.

## 1. Controls

- Must include positive control when the assay requires proof that the system can work.
- Must include negative control when background or non-specific signal is possible.
- Flow cytometry panels must include FMO controls for multi-color gating when needed.
- PCR/qPCR must include NTC and no-RT controls when applicable.
- ELISA must include standard curve, blank, and zero-standard wells.

## 2. Concentrations And Units

- Must include units for all concentrations, volumes, temperatures, times, speeds, and cell numbers.
- Must distinguish stock concentration from final concentration.
- Must verify dilution factors against final volumes.
- Antibody dilution or concentration must follow a validated source or be labeled as requiring optimization.

## 3. Temperature And Time

- Must specify temperature for each incubation.
- Must specify duration for each step.
- Must flag implausible enzyme temperatures, fixation times, or incubation lengths.
- PFA fixation is usually kept below 30 minutes unless a validated reason is provided.

## 4. Safety And Ethics

- Radioactive work requires radiation-safety notes.
- Toxic reagents such as concentrated DMSO, PFA, acrylamide, and phenol/chloroform require ventilation or PPE notes.
- Human samples, pathogens, viruses, and primary tissues require biosafety level notes.
- Animal experiments require ethics or IACUC approval language.
- High-speed centrifugation, liquid nitrogen, lasers, and sharps require handling warnings.

## 5. Replicates And Statistics

- Must state biological replicate count and technical replicate count separately.
- Must not treat technical replicates as independent biological replicates.
- Must describe the statistical test and whether assumptions are met.
- Multi-group comparisons require post-hoc or multiple-testing correction when applicable.

## 6. Normalization

- Western blot requires loading control or total-protein normalization.
- qPCR requires validated reference genes.
- Flow cytometry requires clear gating strategy and compensation.
- Protein assays require total-protein quantification when normalizing downstream readouts.

## 7. Reagents And Materials

- Must provide source, clone, catalog number, or validation note for critical antibodies.
- Must state cell line source and authentication status when relevant.
- Must state strain, species, sex, age, and randomization for animal work when relevant.
- Must state key instrument model or acquisition settings for quantitative assays.

## 8. Reproducibility

- Must use relative centrifugal force in x g, not only rpm, unless rotor is specified.
- Must provide buffer recipes or cite commercial buffers.
- Must include troubleshooting for common failure modes.
- Must state data output format and availability when the protocol produces data files.

## 9. Logic And Order

- Must check step order for biological and chemical plausibility.
- Must include washes after fixation, permeabilization, antibody incubation, or staining when required.
- Must not skip quenching, blocking, compensation, or calibration steps when they are required.

## 10. Species And System Match

- Primers must match the target species and transcript model.
- Antibodies must be validated for the species and application.
- Cell culture protocols must match adherent, suspension, primary, or organoid systems.

## Output Format

For each issue:

- Status: verified, needs confirmation, or violation.
- Location: step, parameter, reagent, figure, table, or section.
- Problem: concrete issue.
- Recommendation: exact revision or confirmation needed.

Sort by severity: major blockers first, then moderate issues, then minor polish.
