# Single-cell And Multiomics Knowledge Base

## Standard scRNA-seq Workflow

1. Raw data processing with Cell Ranger, STARsolo, or salmon-alevin.
2. Cell-level QC with gene count, UMI count, mitochondrial fraction, and ribosomal fraction when useful.
3. Doublet detection with Scrublet, DoubletFinder, or equivalent.
4. Normalization and highly variable gene selection.
5. Dimensionality reduction with PCA.
6. Batch assessment and integration when needed.
7. Graph construction and clustering with Leiden or Louvain.
8. UMAP or t-SNE visualization.
9. Marker analysis and cell-type annotation.
10. Downstream analyses such as trajectory, communication, regulons, or perturbation analysis.

## QC Starting Points

- Typical human scRNA-seq cell filters start around 200 to 6000 detected genes, but thresholds must be data-specific.
- Mitochondrial fraction often uses 10 to 20 percent as a starting point, with tissue-specific adjustment.
- Remove likely doublets and report the removed fraction.
- Small clusters below about 30 cells should be treated cautiously.

## Multiomics Notes

- CITE-seq: use protein and RNA jointly when annotation is ambiguous.
- scATAC-seq: include TSS enrichment, fragment count, nucleosome signal, peak calling, and motif or gene activity analysis.
- Integration should report reference dataset, alignment method, and whether biological signal may be overcorrected.

## Rigor Rules

- Use donors or samples, not cells, as biological replicates for group comparisons.
- Prefer pseudobulk differential analysis for replicated scRNA-seq comparisons.
- State marker test method and correction.
- Validate automated annotation with marker expression.
- Report resolution choice and sensitivity when cluster count affects conclusions.

## Common Pitfalls

1. Treating cells as independent replicates.
2. Overcorrecting real biological differences.
3. Annotating clusters only from one marker.
4. Ignoring doublets or ambient RNA.
5. Comparing cell fractions without donor-level statistics.
