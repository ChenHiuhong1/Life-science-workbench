"""OpenAI-compatible function-calling tool definitions."""
import re
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
                    "title": {
                        "type": "string",
                        "description": "Short, specific run purpose; also used to name the saved script.",
                    },
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
                    "title": {
                        "type": "string",
                        "description": "Short, specific run purpose; also used to name the saved script.",
                    },
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


_TOOL_KEYWORDS = {
    "run_python": [
        "python", "py", "pandas", "numpy", "scipy", "sklearn", "matplotlib", "seaborn",
        "scanpy", "scvi", "umap", "tsne", "plot", "figure", "chart", "graph",
        "visualize", "csv", "tsv", "xlsx", "h5ad", "parquet", "statistics", "calculate",
        "compute", "script", "code", "run", "execute", "analysis", "analyze", "analyse",
        "dataset", "data", "process", "clean", "model", "train", "fit", "predict",
        "average", "mean", "summarize", "summarise", "summarization", "table",
        "pdb", "mmcif", "cif", "mol2", "sdf", "protein", "structure", "dock",
        "docking", "embedding", "alphafold", "boltz", "chai", "esmfold", "proteinmpnn",
        "分析", "统计", "计算", "运行", "执行", "代码", "脚本", "画图", "绘图",
        "图表", "可视化", "数据", "数据集", "差异", "聚类", "降维", "热图",
        "建模", "训练", "清洗", "处理", "平均值", "蛋白", "结构", "对接", "嵌入",
    ],
    "run_r": [
        "rscript", "r language", "seurat", "ggplot", "ggplot2", "bioconductor", "deseq2",
        "edger", "limma", "用r", "r语言", "R语言",
    ],
    "search_literature": [
        "literature", "pubmed", "paper", "citation", "cite", "doi", "reference", "review",
        "search", "arxiv", "crossref", "semantic scholar", "evidence", "source",
        "alphafold", "openfold", "boltz", "chai-1", "esmfold", "diffdock", "proteinmpnn",
        "ligandmpnn", "solublempnn", "fair-esm", "esm-2", "论文", "文献", "引用",
        "参考文献", "检索", "综述", "证据", "来源", "期刊", "作者",
    ],
}

# Matches a standalone "R" token so "用 R 画图" / "R language" arms run_r without
# matching the letter inside other words.
_R_TOKEN_RE = re.compile(r"(^|[^A-Za-z0-9])R([^A-Za-z0-9]|$)")


def select_triggered_tools(keys: List[str], latest_user_text: str, agent_key: str = "chat") -> List[str]:
    """Return only the tools that the latest user request actually triggers.

    Falls back to the agent's full tool set when nothing matched but the request
    clearly asks for an actionable data/code task (contains a marker like
    "analyze"/"dataset"/"data"), so a keyword gap can never silently strip a
    capable agent of all its tools.
    """
    if not keys:
        return []

    text = latest_user_text or ""
    lowered = text.lower()
    selected: list[str] = []

    for key in keys:
        if _tool_triggered(key, text, lowered):
            selected.append(key)

    if "run_r" in selected and "run_python" in selected and "python" not in lowered:
        selected.remove("run_python")

    chosen = [key for key in keys if key in selected]

    # Safety net: a *data-task* agent (bio / protocol) that triggered nothing
    # still gets its code tools, because those agents are essentially useless
    # without them and a keyword gap should not silently disable them. Chat and
    # other conceptual agents stay keyword-gated so greetings and explanation
    # prompts stay bare.
    if not chosen and agent_key in {"bio", "protocol", "structure"} and keys:
        return list(keys)

    return chosen


def _tool_triggered(key: str, text: str, lowered: str) -> bool:
    if key == "run_r" and _R_TOKEN_RE.search(text):
        return True
    return any(keyword.lower() in lowered for keyword in _TOOL_KEYWORDS.get(key, []))
