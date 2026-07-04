# Bulk RNA-seq Knowledge Base

## Standard Workflow

1. Raw FASTQ quality control with FastQC or fastp.
2. Adapter and low-quality trimming when needed.
3. Alignment or pseudoalignment with STAR, HISAT2, Salmon, or kallisto.
4. Gene-level quantification.
5. Sample-level QC with mapping rate, library size, PCA, and correlation heatmaps.
6. Differential expression with DESeq2, edgeR, or limma-voom.
7. Multiple-testing correction with BH/FDR.
8. Functional enrichment with GO, KEGG, Reactome, GSEA, or fgsea.
9. Publication figures and reproducible outputs.

## Required Inputs

- Count matrix or quantification files.
- Sample metadata with condition, batch, replicate, sex, time point, and other covariates.
- Comparison design and biological question.
- Genome or annotation version.

## Rigor Rules

- Use biological replicates as `n`; do not treat genes as replicates.
- Report sample exclusions and outlier handling.
- Include batch assessment and correction strategy when batches exist.
- Use FDR-adjusted p values for discovery claims.
- Report log2 fold change shrinkage when using DESeq2 shrinkage.
- Save normalized counts, differential-expression tables, enrichment tables, and figures.

## Common Pitfalls

1. Missing or ambiguous sample metadata.
2. Confounding condition with batch.
3. Claiming significance from nominal p values.
4. Running enrichment on unfiltered noisy gene lists.
5. Mixing genome annotation versions.
6. Ignoring low library size or low mapping rate samples.
