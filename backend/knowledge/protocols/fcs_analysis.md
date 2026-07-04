# Flow Cytometry FCS Analysis Knowledge Base

## FCS Format

- FCS files contain metadata and event matrices.
- Each row is an event and each column is a detector or derived parameter.
- Compensation may be embedded in metadata or supplied as an external matrix.

## Python Tools

- `fcsparser`: lightweight FCS reading.
- `FlowKit`: compensation, transforms, and gating support.
- `pandas`, `numpy`, `matplotlib`, and `seaborn` are useful for summaries and plotting.

## Standard Workflow

1. Read FCS metadata and event matrix.
2. Report total event count and channel names.
3. Apply compensation when needed.
4. Apply logicle, arcsinh, or another appropriate transform.
5. Gate debris, singlets, live cells, and target populations.
6. Compute population frequencies and median fluorescence intensity.
7. Use dimensionality reduction or clustering for high-dimensional panels when justified.
8. Save plots and summary tables.

## Rigor Rules

- Report total events and events after each major gate.
- Do not omit compensation unless instrument-side compensation is confirmed.
- Group comparisons use sample `n`, not event count.
- MFI comparisons across batches require calibration or normalization.
- Rare populations need enough events for stable estimates.

## Common Pitfalls

1. Analyzing uncompensated data.
2. Not excluding debris, doublets, or dead cells.
3. Using mean instead of median fluorescence without justification.
4. Reporting percentages without a clear denominator.
5. Comparing batches with inconsistent voltage or gain.
