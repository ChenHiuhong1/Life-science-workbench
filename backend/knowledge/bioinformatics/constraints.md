# Bioinformatics Rigor Constraints

## Data And Design

- Always identify the biological unit: sample, cell, spot, gene, feature, or region.
- Do not treat cells, spots, reads, or genes as independent biological replicates.
- State the comparison design before analysis.
- Preserve raw data and record preprocessing steps.
- State genome, annotation, package, and database versions when relevant.

## Statistics

- Use multiple-testing correction for high-dimensional tests.
- Report effect sizes alongside adjusted p values.
- State whether tests are paired, unpaired, parametric, or non-parametric.
- Use random seeds for stochastic steps.
- Do not overclaim causality from association or exploratory analysis.

## Batch Effects

- Check batch structure before correction.
- Do not correct away the biological variable of interest.
- State the method used for batch handling.
- Show diagnostic plots before and after correction when possible.

## Figures

- Each figure must support a clear conclusion.
- Prefer editable vector outputs: SVG and PDF.
- Export a raster copy when needed: PNG or TIFF at 300 dpi or higher.
- State error bar type and sample size.
- Use consistent color meaning across figures.

## Data Availability

- Do not invent accession numbers.
- Use placeholders only when the user explicitly says data will be deposited later.
- Save output tables and code so results can be reproduced.
