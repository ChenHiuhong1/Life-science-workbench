# PCR And qPCR Knowledge Base

## Primer Design

### General PCR And qPCR Primers

- Primer length should usually be 18 to 25 bp.
- GC content should usually be 40% to 60%.
- Tm should usually be 58 to 62 C, with less than 2 C difference between primer pairs.
- qPCR amplicons should usually be 80 to 200 bp.
- Prefer exon-exon junction primers when measuring cDNA to reduce genomic DNA amplification.
- Use Primer3, NCBI Primer-BLAST, or another established primer-design tool.
- Validate specificity with BLAST and melting-curve analysis.

## qPCR Reaction Example

For a 20 uL SYBR Green reaction:

| Component | Volume | Final concentration |
|---|---:|---:|
| 2x SYBR master mix | 10 uL | 1x |
| Forward primer, 10 uM | 0.5 uL | 250 nM |
| Reverse primer, 10 uM | 0.5 uL | 250 nM |
| cDNA template | 2 uL | about 10 to 50 ng |
| Nuclease-free water | 7 uL | - |

## SYBR Cycling Example

```text
1. Initial denaturation: 95 C for 3 min
2. Denaturation: 95 C for 10 s
3. Annealing/extension: 60 C for 30 s, acquire fluorescence
4. Repeat steps 2 to 3 for 40 cycles
5. Melting curve: 65 C to 95 C with small temperature increments
```

## Required Controls

| Control | Purpose |
|---|---|
| NTC, no-template control | Detect primer dimers or contamination |
| NRC, no-RT control | Detect genomic DNA contamination |
| Positive control | Confirm assay works |
| Reference gene | Normalize expression |

## Reference Genes

- Common candidates include GAPDH, ACTB, 18S, HPRT1, TBP, and RPLP0.
- Validate reference-gene stability under the experimental condition using tools such as geNorm or NormFinder.
- Do not blindly use GAPDH across tissues, treatments, or disease states.

## Delta Delta Ct Analysis

```text
Delta Ct = Ct(target) - Ct(reference)
Delta Delta Ct = Delta Ct(treated) - Delta Ct(control)
Fold change = 2^(-Delta Delta Ct)
```

### Assumptions

- Amplification efficiency should usually be 90% to 110%.
- Standard-curve slope should usually be around -3.1 to -3.6.
- Target and reference efficiencies should be similar.
- Use Pfaffl-style efficiency correction when efficiencies differ materially.

## Reporting Requirements

- Use technical duplicates or triplicates when possible.
- Biological replicates must be analyzed independently.
- Perform statistics on Delta Ct or Delta Delta Ct values, not on averaged fold changes.
- Report primer sequences, amplicon size, efficiency, reference gene validation, and exclusion rules.

## Melting Curve Interpretation

- Single peak usually supports specific amplification.
- Multiple peaks suggest primer dimers or non-specific amplification.
- Very late Ct values, such as Ct above 35, require cautious interpretation and validation.

## Reverse Transcription

- Check RNA quality, such as A260/280 around 1.8 to 2.0 and A260/230 above 1.8.
- DNase treatment is recommended for RNA intended for RT-qPCR.
- Use oligo(dT), random hexamers, or a validated mixture depending on RNA type.
- Record RNA input amount and reverse-transcription kit.

## Digital PCR

- Digital PCR provides absolute quantification without a standard curve.
- It is useful for low-abundance targets, rare mutations, and copy-number variation.
- Report partition count, thresholding method, and units such as copies/uL.

## Common Pitfalls

- Genomic DNA contamination appears as a positive no-RT control.
- Primer dimers often appear in NTC wells and melting curves.
- Unstable reference genes distort fold changes.
- Poor amplification efficiency invalidates Delta Delta Ct assumptions.
- Treating technical replicates as biological replicates inflates significance.
