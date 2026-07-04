"""OpenAI-compatible function-calling tool definitions."""
from typing import Dict, List


ALL_TOOLS: Dict[str, List[Dict]] = {
    "run_python": [{
        "type": "function",
        "function": {
            "name": "run_python",
            "description": (
                "Execute Python code for data processing, statistics, and plotting. "
                "Available packages may include numpy, pandas, scipy, scikit-learn, matplotlib, and seaborn. "
                "Generated figures and tables are collected as artifacts."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "code": {"type": "string", "description": "Complete Python code to execute."},
                    "title": {"type": "string", "description": "Short run description used as the artifact title."},
                },
                "required": ["code"],
            },
        },
    }],
    "run_r": [{
        "type": "function",
        "function": {
            "name": "run_r",
            "description": (
                "Execute R code for bioinformatics and plotting. Required R packages must already be installed. "
                "Generated figures and tables are collected as artifacts."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "code": {"type": "string", "description": "Complete R code to execute."},
                    "title": {"type": "string", "description": "Short run description used as the artifact title."},
                },
                "required": ["code"],
            },
        },
    }],
    "search_literature": [{
        "type": "function",
        "function": {
            "name": "search_literature",
            "description": (
                "Search literature across PubMed, arXiv, CrossRef, and Semantic Scholar. "
                "Returns title, authors, journal, year, DOI, abstract, source, and citation count when available."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Search keywords. English terms usually work best."},
                    "sources": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Optional sources: pubmed, arxiv, crossref, semantic_scholar. Defaults to all.",
                    },
                    "limit": {"type": "integer", "description": "Maximum results per source.", "default": 10},
                },
                "required": ["query"],
            },
        },
    }],
}


def tools_for(keys: List[str]) -> List[Dict]:
    out = []
    for key in keys:
        out.extend(ALL_TOOLS.get(key, []))
    return out
