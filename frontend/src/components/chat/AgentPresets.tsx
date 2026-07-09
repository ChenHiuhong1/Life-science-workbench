import { useStore } from '@/store';
import type { AgentKey } from '@/types';

const PRESETS: Partial<Record<AgentKey, { label: string; inject: string }[]>> = {
  chat: [],
  brainstorm: [
    {
      label: 'Design from scratch',
      inject: 'I want to design a new research project in [field]. Please guide me through the 9-step study-design workflow. Start with literature-grounded field context, then scope assessment. My initial interest is:',
    },
    {
      label: 'Evaluate hypothesis',
      inject: 'I have a preliminary hypothesis: [hypothesis]. Please evaluate falsifiability and design positive and negative controls.',
    },
    {
      label: 'Find gaps',
      inject: 'Search recent highly cited papers in [field] and help me identify unresolved research gaps.',
    },
  ],
  bio: [
    {
      label: 'bulk RNA-seq',
      inject: 'I need to run a bulk RNA-seq differential expression workflow. Before choosing Python or R, ask me about data format, comparison design, and analysis goals.\n\nMy data:',
    },
    {
      label: 'Single-cell multiomics',
      inject: 'I need to analyze single-cell RNA-seq data, possibly with ATAC/CITE-seq integration. First ask whether I prefer Python (Scanpy) or R (Seurat), then ask about QC thresholds and data sources.\n\nMy data:',
    },
    {
      label: 'Spatial omics',
      inject: 'I need to analyze spatial transcriptomics data (Visium/Stereo-seq/CosMx/Xenium). First ask whether I prefer Python or R, and whether I have a single-cell reference for deconvolution.\n\nPlatform and data:',
    },
  ],
  structure: [
    {
      label: 'Visualize structure',
      inject: '/protein-structure I have a protein or ligand structure file and want to inspect it in 3D. First identify the file type (PDB/mmCIF/SDF/MOL2), validate that atom coordinates are present, then save or copy a structure artifact with a relative path so the Artifacts panel can render it in 3D. Also report chains, residue or atom counts, hetero atoms/ligands, and any limitations of the preview.\n\nStructure file:',
    },
    {
      label: 'Protein structure',
      inject: '/protein-structure I need a protein structure prediction or interpretation workflow. First verify the appropriate package or method (AlphaFold2, OpenFold3, Boltz, Chai-1, ESMFold2, or another maintained tool), then ask for FASTA/PDB/mmCIF input, chain stoichiometry, ligands/cofactors, template/MSA availability, GPU or memory limits, confidence metrics, and expected outputs.\n\nInput I have:',
    },
    {
      label: 'Protein design',
      inject: '/protein-design I need a protein design workflow. First define whether the objective is stability, binder, enzyme, interface, ligand pocket, solubility, or rescue mutation. Then ask for PDB/mmCIF or sequence input, chain IDs, residue numbering, fixed and mutable residues, interface constraints, ligand constraints, forbidden mutations, candidate filtering rules, and validation plan. Do not run code until the constraints and package choice are clear.\n\nStarting structure or sequence:',
    },
    {
      label: 'Docking',
      inject: '/protein-docking I need a protein-ligand or protein-structure docking workflow. First verify maintained docking software or method papers, then ask for receptor structure source, ligand format, protonation/tautomer/stereochemistry, cofactors, waters, metals, binding-site definition, constraints, and validation strategy. Keep docking scores separate from binding evidence.\n\nReceptor and ligand:',
    },
    {
      label: 'Embeddings',
      inject: '/protein-embedding I need protein sequence embeddings for similarity search, clustering, retrieval, or downstream prediction. First verify the current fair-esm2 or other maintained implementation, then ask for FASTA input, sequence IDs, model size, layer, pooling strategy, token handling, GPU or memory limits, output format, and interpretation caveats.\n\nSequences or FASTA path:',
    },
  ],
  protocol: [
    {
      label: 'Build protocol',
      inject: 'Help me build a complete experimental protocol. Goal: [fill in]. Include reagents, consumables, step-by-step workflow with time/temperature/concentration/volume, required positive/negative/blank controls, expected results, and troubleshooting.',
    },
    {
      label: 'Troubleshoot',
      inject: 'I have a question about an existing protocol: [question]. Please search the knowledge base when needed, then give evidence-based advice and risk notes.',
    },
    {
      label: 'Process data',
      inject: 'I have wet-lab data to process:\n- Data type: [qPCR Excel / confocal TIFF / flow FCS / pathology WSI / ELISA OD]\n- Analysis goal: [fill in]\nPlease generate a reproducible processing script and result figures.',
    },
  ],
  reviewer: [
    {
      label: 'Review conversation',
      inject: 'Review the conversation above with a strict multi-domain checklist: citation validity, claim-evidence support, data availability, statistical rigor, control design, and reproducibility. Output a checkable list.',
    },
    {
      label: 'Review protocol',
      inject: 'Use the review rules checklist to audit the following protocol for rigor and safety:\n\n[paste protocol]',
    },
    {
      label: 'Review proposal',
      inject: 'Review the following study design or hypothesis for rigor: falsifiability, placeholder wording, control design, overclaiming, and feasibility.\n\n[paste study design]',
    },
  ],
  module: [
    {
      label: 'Extract workflow',
      inject: 'Extract the correct workflow from this module output. Identify owner_agent, inputs, outputs, required_skill, optional_skill, forbidden_actions, artifact_rules, and review_checklist:\n\n[paste module output]',
    },
    {
      label: 'Package module',
      inject: 'Help me turn this confirmed workflow into a formal module spec. Keep it as draft until I explicitly approve it:\n\n[paste workflow]',
    },
    {
      label: 'Audit boundaries',
      inject: 'Audit this workflow for agent isolation, directory governance, artifact rules, and cross-module leakage risk:\n\n[paste workflow]',
    },
  ],
};

export function AgentPresets({ onInject }: { onInject: (text: string) => void }) {
  const agent = useStore((s) => s.agent);
  const items = PRESETS[agent];
  if (!items || !items.length) return null;

  return (
    <div className="flex flex-wrap gap-1 mb-2">
      {items.map((p) => (
        <button
          key={p.label}
          onClick={() => onInject(p.inject)}
          className="rounded-full bg-cream-100 px-2.5 py-1 text-[11px] font-medium text-ink-600
                     transition-colors hover:bg-clay-50 hover:text-clay-600"
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
