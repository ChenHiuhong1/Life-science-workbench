# Image Analysis Knowledge Base

## General Principles

- Preserve raw images and analyze copies.
- Use TIFF or raw formats for quantitative work when possible.
- Calibrate scale before measuring distances, areas, or cell sizes.
- Record bit depth, resolution, objective, camera, exposure, and acquisition settings.
- Use scripts, macros, or saved pipelines for batch processing.

## ImageJ And Fiji

- Set scale with a known calibration image or metadata.
- Use thresholding consistently across comparable samples.
- Validate segmentation with overlays.
- For fluorescence intensity, subtract local background and report ROI definition.
- For colocalization, report Pearson or Manders metrics and thresholding method.

## CellProfiler

- Useful for high-throughput and standardized image pipelines.
- Common modules: Images, Metadata, NamesAndTypes, IdentifyPrimaryObjects, IdentifySecondaryObjects, MeasureObjectIntensity, MeasureObjectSizeShape, ExportToSpreadsheet.
- Validate object segmentation with overlay images.

## QuPath

- Useful for WSI, H&E, IHC, and tissue microarrays.
- Record annotation regions, cell detection settings, stain vectors, and positive-cell thresholds.
- Export cell-level and region-level measurements.

## Common Pitfalls

1. Missing scale calibration.
2. JPEG compression in quantitative analysis.
3. Subjective thresholds that vary by sample.
4. Oversegmentation or undersegmentation without overlay checks.
5. Comparing different exposure settings.
6. Not subtracting background.
