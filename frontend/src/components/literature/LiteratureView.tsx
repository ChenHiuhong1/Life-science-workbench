import { useState } from 'react';
import { Search, Loader2, ExternalLink, Star, Quote } from 'lucide-react';
import { useI18n } from '@/i18n';
import { api } from '@/api/client';
import type { Paper } from '@/types';

const SOURCES = [
  { key: 'pubmed', label: 'PubMed' },
  { key: 'arxiv', label: 'arXiv' },
  { key: 'crossref', label: 'CrossRef' },
  { key: 'semantic_scholar', label: 'Semantic Scholar' },
];

export function LiteratureView() {
  const t = useI18n((s) => s.t);
  const [query, setQuery] = useState('');
  const [sources, setSources] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Paper[]>([]);
  const [error, setError] = useState('');

  const toggleSource = (key: string) => {
    setSources((cur) => (cur.includes(key) ? cur.filter((item) => item !== key) : [...cur, key]));
  };

  const search = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError('');
    try {
      const { papers, failed } = await api.searchLiterature(
        query, sources.length ? sources : undefined, 10
      );
      setResults(papers);
      if (papers.length === 0) {
        setError('No relevant papers found. Try different keywords or more sources.');
      } else if (failed.length) {
        const names = failed.map((source) => ({
          pubmed: 'PubMed',
          arxiv: 'arXiv',
          crossref: 'CrossRef',
          semantic_scholar: 'Semantic Scholar',
        }[source] || source)).join(', ');
        setError(`${names} failed to connect. Results were returned from the remaining sources.`);
      }
    } catch (e: any) {
      setError(`Search failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="flex-1 flex flex-col overflow-hidden bg-cream-50">
      <div className="shrink-0 border-b border-cream-300 bg-white px-4 py-3 space-y-2.5">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-300" />
            <input
              className="input pl-9"
              placeholder={t('lit.search.placeholder')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && search()}
            />
          </div>
          <button className="btn-primary" onClick={search} disabled={loading || !query.trim()}>
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            <span>{t('lit.search')}</span>
          </button>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-ink-300">{t('lit.sources')}:</span>
          {SOURCES.map((source) => (
            <button
              key={source.key}
              onClick={() => toggleSource(source.key)}
              className={`px-2 py-0.5 text-[11px] rounded-full border transition-colors ${
                sources.includes(source.key) || sources.length === 0
                  ? 'border-clay-400 bg-clay-50 text-clay-600'
                  : 'border-cream-300 text-ink-500 hover:bg-cream-100'
              }`}
            >
              {source.label}
            </button>
          ))}
          {sources.length === 0 && (
            <span className="text-[10px] text-ink-300 ml-1">(all by default)</span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="max-w-3xl mx-auto space-y-2.5">
          {error && <div className="text-sm text-ink-500 text-center py-8">{error}</div>}
          {!error && results.length === 0 && !loading && (
            <div className="text-center py-16">
              <Search size={32} className="mx-auto text-cream-400 mb-3" strokeWidth={1} />
              <p className="text-sm text-ink-300">{t('lit.empty')}</p>
            </div>
          )}
          {results.map((paper, index) => (
            <PaperCard key={`${paper.doi || paper.title}:${index}`} paper={paper} />
          ))}
        </div>
      </div>
    </section>
  );
}

function PaperCard({ paper }: { paper: Paper }) {
  const [starred, setStarred] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const star = async () => {
    setStarred(true);
    try {
      await api.starLiterature(paper);
    } catch {}
  };

  return (
    <div className="card p-3.5 hover:shadow-card transition-shadow">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-ink-900 leading-snug mb-1">{paper.title}</h3>
          <div className="text-xs text-ink-500 mb-1.5">
            {paper.authors && <span>{paper.authors}</span>}
            {paper.journal && <span className="italic"> - {paper.journal}</span>}
            {paper.year && <span> ({paper.year})</span>}
          </div>
          {paper.abstract && (
            <p className={`text-xs text-ink-500 leading-relaxed ${expanded ? '' : 'line-clamp-2'}`}>
              {paper.abstract}
            </p>
          )}
          {paper.abstract && paper.abstract.length > 120 && (
            <button
              className="text-[11px] text-clay-600 hover:text-clay-500 mt-1"
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? 'Collapse' : 'Expand'}
            </button>
          )}
          <div className="flex items-center gap-3 mt-2">
            {paper.source && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-cream-100 text-ink-500 uppercase tracking-wider">
                {paper.source}
              </span>
            )}
            {paper.citation_count !== undefined && paper.citation_count > 0 && (
              <span className="text-[10px] text-ink-300 flex items-center gap-0.5">
                <Quote size={9} /> {paper.citation_count} {useI18n.getState().t('lit.cite')}
              </span>
            )}
            {paper.doi && (
              <a
                href={`https://doi.org/${paper.doi}`}
                target="_blank"
                className="text-[10px] text-clay-600 hover:text-clay-500 flex items-center gap-0.5"
              >
                DOI <ExternalLink size={9} />
              </a>
            )}
          </div>
        </div>
        <button
          onClick={star}
          className={`shrink-0 p-1 rounded hover:bg-cream-100 ${starred ? 'text-warn' : 'text-ink-300'}`}
          title={useI18n.getState().t('lit.star')}
        >
          <Star size={14} fill={starred ? 'currentColor' : 'none'} />
        </button>
      </div>
    </div>
  );
}
