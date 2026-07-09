import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import { api } from '@/api/client';

interface AtomCoord {
  x: number;
  y: number;
  z: number;
  element: string;
  name: string;
  chain: string;
  residue: string;
  resSeq: string;
  hetero: boolean;
  order: number;
}

interface ParsedStructure {
  atoms: AtomCoord[];
  format: string;
}

interface PreparedStructure {
  center: { x: number; y: number; z: number };
  radius: number;
  sampled: AtomCoord[];
  backbone: AtomCoord[];
  sampledCount: number;
}

type RenderMode = 'cartoon' | 'atoms';

interface ProjectedAtom {
  atom: AtomCoord;
  x: number;
  y: number;
  z: number;
}

const ELEMENT_COLORS: Record<string, string> = {
  C: '#6B7280',
  N: '#2563EB',
  O: '#DC2626',
  S: '#D97706',
  P: '#7C3AED',
  H: '#F8FAFC',
  CL: '#16A34A',
  F: '#22C55E',
  BR: '#92400E',
  I: '#7E22CE',
  FE: '#B45309',
  ZN: '#64748B',
  MG: '#059669',
  CA: '#475569',
};

const CHAIN_COLORS = ['#9FE6B8', '#8AC7FF', '#F7C948', '#F59E9E', '#C4B5FD', '#67E8F9', '#FDBA74'];
const MAX_DRAW_ATOMS = 7000;

export function StructurePreview({ path, projectPath, large = false }: { path: string; projectPath?: string; large?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<{ active: boolean; x: number; y: number }>({ active: false, x: 0, y: 0 });
  const [parsed, setParsed] = useState<ParsedStructure | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [rotation, setRotation] = useState({ x: -0.65, y: 0.8 });
  const [zoom, setZoom] = useState(1);
  const [renderMode, setRenderMode] = useState<RenderMode>('cartoon');
  const [sizeTick, setSizeTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setParsed(null);
    (async () => {
      try {
        const resp = await fetch(api.artifactFileUrl(path, projectPath));
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const text = await resp.text();
        const next = parseStructure(text, path);
        if (!next.atoms.length) throw new Error('No atom coordinates detected.');
        if (!cancelled) setParsed(next);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load structure');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [path, projectPath]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => setSizeTick((v) => v + 1));
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  const stats = useMemo(() => {
    const atoms = parsed?.atoms || [];
    const chains = new Set(atoms.map((a) => a.chain).filter(Boolean));
    const residues = new Set(atoms.map((a) => `${a.chain}:${a.resSeq}:${a.residue}`).filter((v) => !v.endsWith('::')));
    const hetero = atoms.filter((a) => a.hetero).length;
    return { chains: chains.size, residues: residues.size, hetero };
  }, [parsed]);

  const prepared = useMemo(() => {
    const atoms = parsed?.atoms || [];
    if (!atoms.length) return null;
    const center = atoms.reduce(
      (acc, atom) => ({ x: acc.x + atom.x, y: acc.y + atom.y, z: acc.z + atom.z }),
      { x: 0, y: 0, z: 0 },
    );
    center.x /= atoms.length;
    center.y /= atoms.length;
    center.z /= atoms.length;
    let radius = 1;
    for (const atom of atoms) {
      const dx = atom.x - center.x;
      const dy = atom.y - center.y;
      const dz = atom.z - center.z;
      radius = Math.max(radius, Math.sqrt(dx * dx + dy * dy + dz * dz));
    }
    const step = Math.max(1, Math.ceil(atoms.length / MAX_DRAW_ATOMS));
    const sampled = atoms.filter((_, index) => index % step === 0);
    const backbone = atoms.filter((atom) => atom.name.toUpperCase() === 'CA' || atom.name.toUpperCase() === 'P');
    return { center, radius, sampled, backbone, sampledCount: sampled.length };
  }, [parsed]);

  useEffect(() => {
    if (!parsed || !prepared || !canvasRef.current) return;
    drawStructure(canvasRef.current, prepared, rotation, zoom, renderMode);
  }, [parsed, prepared, rotation, zoom, renderMode, sizeTick]);

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { active: true, x: event.clientX, y: event.clientY };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragRef.current.active) return;
    const dx = event.clientX - dragRef.current.x;
    const dy = event.clientY - dragRef.current.y;
    dragRef.current = { active: true, x: event.clientX, y: event.clientY };
    setRotation((cur) => ({ x: cur.x + dy * 0.01, y: cur.y + dx * 0.01 }));
  };

  const stopDrag = () => {
    dragRef.current.active = false;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-ink-400">
        <Loader2 size={14} className="mr-1.5 animate-spin" />
        <span className="text-xs">Loading structure...</span>
      </div>
    );
  }

  if (error || !parsed || !prepared) {
    return (
      <div className="rounded-lg bg-cream-100 p-3 text-center">
        <p className="text-xs font-medium text-ink-600">3D preview unavailable</p>
        <p className="mt-1 text-[11px] text-ink-500">{error || 'No structure loaded.'}</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg bg-[#111A16] shadow-card">
      <div className="flex items-center justify-between gap-2 border-b border-white/10 bg-[#16231D] px-2.5 py-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-cream-50">{parsed.format} 3D preview</p>
          <p className="text-[10px] text-cream-300">
            {parsed.atoms.length.toLocaleString()} atoms
            {prepared.sampledCount < parsed.atoms.length ? `, ${prepared.sampledCount.toLocaleString()} rendered` : ''}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <div className="mr-1 flex overflow-hidden rounded-[8px] border border-white/10 bg-black/15">
            {(['cartoon', 'atoms'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                className={`px-2 py-1 text-[10px] font-medium transition-colors ${
                  renderMode === mode ? 'bg-white/15 text-white' : 'text-cream-300 hover:bg-white/10 hover:text-white'
                }`}
                onClick={() => setRenderMode(mode)}
              >
                {mode === 'cartoon' ? 'Cartoon' : 'Atoms'}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="rounded-[8px] p-1 text-cream-200 hover:bg-white/10 hover:text-white"
            onClick={() => setZoom((v) => Math.max(0.45, v * 0.82))}
            title="Zoom out"
          >
            <ZoomOut size={13} />
          </button>
          <button
            type="button"
            className="rounded-[8px] p-1 text-cream-200 hover:bg-white/10 hover:text-white"
            onClick={() => setZoom((v) => Math.min(2.8, v * 1.18))}
            title="Zoom in"
          >
            <ZoomIn size={13} />
          </button>
          <button
            type="button"
            className="rounded-[8px] p-1 text-cream-200 hover:bg-white/10 hover:text-white"
            onClick={() => { setRotation({ x: -0.65, y: 0.8 }); setZoom(1); }}
            title="Reset view"
          >
            <RotateCcw size={13} />
          </button>
        </div>
      </div>
      <canvas
        ref={canvasRef}
        className={`block ${large ? 'h-[30rem]' : 'h-72'} w-full cursor-grab touch-none active:cursor-grabbing`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
        aria-label="Interactive 3D molecular structure preview"
      />
      <div className="grid grid-cols-3 border-t border-white/10 bg-[#16231D] text-center text-[10px] text-cream-200">
        <div className="border-r border-white/10 px-2 py-1.5">
          <span className="block text-cream-400">Chains</span>
          <span className="font-semibold text-cream-50">{stats.chains || '-'}</span>
        </div>
        <div className="border-r border-white/10 px-2 py-1.5">
          <span className="block text-cream-400">Residues</span>
          <span className="font-semibold text-cream-50">{stats.residues || '-'}</span>
        </div>
        <div className="px-2 py-1.5">
          <span className="block text-cream-400">HET atoms</span>
          <span className="font-semibold text-cream-50">{stats.hetero || '-'}</span>
        </div>
      </div>
    </div>
  );
}

function drawStructure(
  canvas: HTMLCanvasElement,
  prepared: PreparedStructure,
  rotation: { x: number; y: number },
  zoom: number,
  renderMode: RenderMode,
) {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(240, rect.width || 320);
  const height = Math.max(240, rect.height || 288);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const gradient = ctx.createRadialGradient(width * 0.5, height * 0.35, 20, width * 0.5, height * 0.55, Math.max(width, height) * 0.65);
  gradient.addColorStop(0, '#1F3328');
  gradient.addColorStop(1, '#0F1714');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  const scale = (Math.min(width, height) * 0.42 * zoom) / prepared.radius;
  const projected = prepared.sampled.map((atom) => projectAtom(atom, prepared.center, rotation, scale, width, height));
  const backbone = prepared.backbone.map((atom) => projectAtom(atom, prepared.center, rotation, scale, width, height));

  if (renderMode === 'cartoon' && backbone.length >= 2) {
    drawCartoonBackbone(ctx, backbone, width, height);
    const hetero = projected.filter((point) => point.atom.hetero);
    drawAtomCloud(ctx, hetero, prepared.radius, true);
    return;
  }

  drawBackboneTrace(ctx, backbone);
  drawAtomCloud(ctx, projected, prepared.radius, false);
}

function drawBackboneTrace(ctx: CanvasRenderingContext2D, backbone: ProjectedAtom[]) {
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(236, 244, 236, 0.18)';
  ctx.beginPath();
  for (let i = 1; i < backbone.length; i += 1) {
    const a = backbone[i - 1];
    const b = backbone[i];
    if (a.atom.chain !== b.atom.chain || distance(a.atom, b.atom) > 7.5) continue;
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();
}

function drawCartoonBackbone(ctx: CanvasRenderingContext2D, backbone: ProjectedAtom[], width: number, height: number) {
  const flush = (points: ProjectedAtom[], color: string) => {
    if (points.length < 2) return;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const ribbonWidth = Math.max(5.5, Math.min(13, Math.min(width, height) * 0.02));
    drawSmoothPath(ctx, points);
    ctx.lineWidth = ribbonWidth;
    ctx.strokeStyle = withAlpha(color, 0.24);
    ctx.stroke();

    drawSmoothPath(ctx, points);
    ctx.lineWidth = ribbonWidth * 0.58;
    ctx.strokeStyle = withAlpha(color, 0.86);
    ctx.stroke();

    drawSmoothPath(ctx, points);
    ctx.lineWidth = Math.max(1, ribbonWidth * 0.14);
    ctx.strokeStyle = 'rgba(250, 255, 247, 0.55)';
    ctx.stroke();
  };

  let segment: ProjectedAtom[] = [];
  let chainIndex = -1;
  let currentChain = '';
  for (const point of backbone) {
    const chain = point.atom.chain || '_';
    const previous = segment[segment.length - 1];
    const discontinuity = previous && (previous.atom.chain !== point.atom.chain || distance(previous.atom, point.atom) > 7.5);
    if (!segment.length || chain !== currentChain || discontinuity) {
      if (segment.length) flush(segment, CHAIN_COLORS[Math.max(0, chainIndex) % CHAIN_COLORS.length]);
      segment = [];
      if (chain !== currentChain) chainIndex += 1;
      currentChain = chain;
    }
    segment.push(point);
  }
  if (segment.length) flush(segment, CHAIN_COLORS[Math.max(0, chainIndex) % CHAIN_COLORS.length]);
}

function drawSmoothPath(ctx: CanvasRenderingContext2D, points: ProjectedAtom[]) {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  if (points.length === 2) {
    ctx.lineTo(points[1].x, points[1].y);
    return;
  }
  for (let i = 1; i < points.length - 1; i += 1) {
    const cur = points[i];
    const next = points[i + 1];
    const mx = (cur.x + next.x) / 2;
    const my = (cur.y + next.y) / 2;
    ctx.quadraticCurveTo(cur.x, cur.y, mx, my);
  }
  const last = points[points.length - 1];
  ctx.lineTo(last.x, last.y);
}

function drawAtomCloud(
  ctx: CanvasRenderingContext2D,
  projected: ProjectedAtom[],
  structureRadius: number,
  emphasize: boolean,
) {
  projected.sort((a, b) => a.z - b.z);
  for (const point of projected) {
    const depth = (point.z + structureRadius) / (structureRadius * 2);
    const base = emphasize ? 2.2 : 1.6;
    const radius = Math.max(1.2, Math.min(emphasize ? 5.4 : 4.2, base + depth * (emphasize ? 3.1 : 2.3)));
    ctx.globalAlpha = point.atom.hetero || emphasize ? 0.98 : 0.76 + depth * 0.2;
    ctx.fillStyle = ELEMENT_COLORS[point.atom.element] || '#CBD5E1';
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function withAlpha(hex: string, alpha: number): string {
  const raw = hex.replace('#', '');
  const r = Number.parseInt(raw.slice(0, 2), 16);
  const g = Number.parseInt(raw.slice(2, 4), 16);
  const b = Number.parseInt(raw.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function projectAtom(
  atom: AtomCoord,
  center: { x: number; y: number; z: number },
  rotation: { x: number; y: number },
  scale: number,
  width: number,
  height: number,
) {
  const x0 = atom.x - center.x;
  const y0 = atom.y - center.y;
  const z0 = atom.z - center.z;
  const cosX = Math.cos(rotation.x);
  const sinX = Math.sin(rotation.x);
  const cosY = Math.cos(rotation.y);
  const sinY = Math.sin(rotation.y);
  const y1 = y0 * cosX - z0 * sinX;
  const z1 = y0 * sinX + z0 * cosX;
  const x2 = x0 * cosY + z1 * sinY;
  const z2 = -x0 * sinY + z1 * cosY;
  return {
    atom,
    x: width / 2 + x2 * scale,
    y: height / 2 + y1 * scale,
    z: z2,
  };
}

function distance(a: AtomCoord, b: AtomCoord): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function parseStructure(text: string, name: string): ParsedStructure {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (['pdb', 'ent', 'pdbqt'].includes(ext)) return { atoms: parsePdb(text), format: 'PDB' };
  if (['cif', 'mmcif'].includes(ext)) return { atoms: parseCif(text), format: 'mmCIF' };
  if (ext === 'mol2') return { atoms: parseMol2(text), format: 'MOL2' };
  if (['mol', 'sdf'].includes(ext)) return { atoms: parseSdf(text), format: ext.toUpperCase() };
  const pdbAtoms = parsePdb(text);
  if (pdbAtoms.length) return { atoms: pdbAtoms, format: 'PDB' };
  return { atoms: parseCif(text), format: 'Structure' };
}

function parsePdb(text: string): AtomCoord[] {
  const atoms: AtomCoord[] = [];
  let order = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith('ATOM') && !line.startsWith('HETATM')) continue;
    const x = Number.parseFloat(line.slice(30, 38));
    const y = Number.parseFloat(line.slice(38, 46));
    const z = Number.parseFloat(line.slice(46, 54));
    if (![x, y, z].every(Number.isFinite)) continue;
    const name = line.slice(12, 16).trim();
    atoms.push({
      x,
      y,
      z,
      name,
      element: normalizeElement(line.slice(76, 78).trim() || name),
      chain: line.slice(21, 22).trim(),
      residue: line.slice(17, 20).trim(),
      resSeq: line.slice(22, 27).trim(),
      hetero: line.startsWith('HETATM'),
      order: order++,
    });
  }
  return atoms;
}

function parseCif(text: string): AtomCoord[] {
  const lines = text.split(/\r?\n/);
  const atoms: AtomCoord[] = [];
  let order = 0;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].trim() !== 'loop_') continue;
    const headers: string[] = [];
    let j = i + 1;
    while (j < lines.length && lines[j].trim().startsWith('_atom_site.')) {
      headers.push(lines[j].trim());
      j += 1;
    }
    if (!headers.length) continue;
    const xIdx = findHeader(headers, ['_atom_site.Cartn_x']);
    const yIdx = findHeader(headers, ['_atom_site.Cartn_y']);
    const zIdx = findHeader(headers, ['_atom_site.Cartn_z']);
    if (xIdx < 0 || yIdx < 0 || zIdx < 0) continue;
    const elemIdx = findHeader(headers, ['_atom_site.type_symbol', '_atom_site.label_atom_id', '_atom_site.auth_atom_id']);
    const nameIdx = findHeader(headers, ['_atom_site.label_atom_id', '_atom_site.auth_atom_id']);
    const chainIdx = findHeader(headers, ['_atom_site.auth_asym_id', '_atom_site.label_asym_id']);
    const resIdx = findHeader(headers, ['_atom_site.auth_comp_id', '_atom_site.label_comp_id']);
    const seqIdx = findHeader(headers, ['_atom_site.auth_seq_id', '_atom_site.label_seq_id']);
    const groupIdx = findHeader(headers, ['_atom_site.group_PDB']);
    while (j < lines.length) {
      const raw = lines[j].trim();
      if (!raw || raw === '#' || raw === 'loop_' || raw.startsWith('_')) break;
      const parts = tokenizeCif(raw);
      if (parts.length >= headers.length) {
        const x = Number.parseFloat(parts[xIdx]);
        const y = Number.parseFloat(parts[yIdx]);
        const z = Number.parseFloat(parts[zIdx]);
        if ([x, y, z].every(Number.isFinite)) {
          const name = valueAt(parts, nameIdx);
          atoms.push({
            x,
            y,
            z,
            name,
            element: normalizeElement(valueAt(parts, elemIdx) || name),
            chain: valueAt(parts, chainIdx),
            residue: valueAt(parts, resIdx),
            resSeq: valueAt(parts, seqIdx),
            hetero: valueAt(parts, groupIdx).toUpperCase() === 'HETATM',
            order: order++,
          });
        }
      }
      j += 1;
    }
  }
  return atoms;
}

function parseMol2(text: string): AtomCoord[] {
  const atoms: AtomCoord[] = [];
  let inAtoms = false;
  let order = 0;
  for (const line of text.split(/\r?\n/)) {
    const stripped = line.trim();
    if (stripped.toUpperCase().startsWith('@<TRIPOS>ATOM')) {
      inAtoms = true;
      continue;
    }
    if (stripped.toUpperCase().startsWith('@<TRIPOS>') && inAtoms) break;
    if (!inAtoms || !stripped) continue;
    const parts = stripped.split(/\s+/);
    if (parts.length < 6) continue;
    const x = Number.parseFloat(parts[2]);
    const y = Number.parseFloat(parts[3]);
    const z = Number.parseFloat(parts[4]);
    if (![x, y, z].every(Number.isFinite)) continue;
    atoms.push({
      x,
      y,
      z,
      name: parts[1] || '',
      element: normalizeElement(parts[5] || parts[1]),
      chain: '',
      residue: parts[7] || '',
      resSeq: parts[6] || '',
      hetero: true,
      order: order++,
    });
  }
  return atoms;
}

function parseSdf(text: string): AtomCoord[] {
  const lines = text.split(/\r?\n/);
  if (lines.length < 4) return [];
  const atoms: AtomCoord[] = [];
  const count = Number.parseInt(lines[3].slice(0, 3), 10);
  if (!Number.isFinite(count) || count <= 0) return [];
  for (let i = 4; i < Math.min(lines.length, 4 + count); i += 1) {
    const line = lines[i];
    const x = Number.parseFloat(line.slice(0, 10));
    const y = Number.parseFloat(line.slice(10, 20));
    const z = Number.parseFloat(line.slice(20, 30));
    const element = line.slice(31, 34).trim();
    if (![x, y, z].every(Number.isFinite)) continue;
    atoms.push({
      x,
      y,
      z,
      name: element,
      element: normalizeElement(element),
      chain: '',
      residue: '',
      resSeq: '',
      hetero: true,
      order: atoms.length,
    });
  }
  return atoms;
}

function findHeader(headers: string[], names: string[]): number {
  return headers.findIndex((header) => names.some((name) => header.toLowerCase() === name.toLowerCase()));
}

function valueAt(parts: string[], index: number): string {
  if (index < 0 || index >= parts.length) return '';
  const value = parts[index];
  return value === '.' || value === '?' ? '' : value;
}

function tokenizeCif(line: string): string[] {
  const tokens: string[] = [];
  const regex = /'(?:[^']*)'|"(?:[^"]*)"|\S+/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(line))) {
    const token = match[0];
    tokens.push(token.replace(/^['"]|['"]$/g, ''));
  }
  return tokens;
}

function normalizeElement(value: string): string {
  const raw = (value || '').replace(/[^A-Za-z]/g, '').toUpperCase();
  if (!raw) return 'C';
  if (raw.length >= 2 && ELEMENT_COLORS[raw.slice(0, 2)]) return raw.slice(0, 2);
  return raw[0];
}
