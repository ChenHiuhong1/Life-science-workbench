"""Aggregated literature search across PubMed, arXiv, CrossRef, and Semantic Scholar."""
import asyncio
import os
import sys
from typing import Awaitable, Callable, Dict, List, Optional

import httpx
import xmltodict
from loguru import logger


HEADERS = {"User-Agent": "ScienceWorkbench/0.1 (mailto:user@example.com)"}
_detected_proxy: str | None = None
_proxy_detection_done = False
# Whether the last detection concluded "no proxy in use". Cached so the slow
# socket/port scan only runs once per process even when 4 search_* coroutines
# fire concurrently (the previous gate re-scanned 4x on the first search).
_proxy_detection_negative = False
# Serialises the detection so concurrent first-search calls share one scan.
_proxy_lock = asyncio.Lock()


def _normalise_proxy_url(value: str) -> list[str]:
    value = (value or "").strip()
    if not value:
        return []

    # Windows can store "http=host:port;https=host:port" in ProxyServer.
    if ";" in value or "=" in value:
        out: list[str] = []
        for part in value.split(";"):
            scheme, sep, target = part.partition("=")
            raw = target if sep else part
            if sep and scheme.strip().lower().startswith("socks") and "://" not in raw:
                out.append(f"socks5://{raw.strip()}")
            else:
                out.extend(_normalise_proxy_url(raw))
        return out

    if "://" not in value:
        value = f"http://{value}"
    return [value]


def _proxy_kwargs() -> dict:
    global _detected_proxy, _proxy_detection_done, _proxy_detection_negative

    proxy = (
        os.environ.get("HTTPS_PROXY")
        or os.environ.get("https_proxy")
        or os.environ.get("HTTP_PROXY")
        or os.environ.get("http_proxy")
        or os.environ.get("ALL_PROXY")
        or os.environ.get("all_proxy")
    )

    if proxy:
        logger.debug(f"[literature] using proxy: {proxy}")
        return {"proxy": proxy}

    # Cached positive detection.
    if _detected_proxy:
        return {"proxy": _detected_proxy}

    # Cached negative detection: a previous scan already concluded no local
    # proxy is reachable, so don't re-scan on every request.
    if _proxy_detection_negative:
        return {}

    # First-time synchronous scan. This branch is only entered before
    # ``ensure_proxy_detected`` has run (e.g. a search_* called directly). The
    # async ``search_all`` entrypoint warms the cache under a lock first, so in
    # normal use this is a no-op.
    _scan_for_proxy_once()
    if _detected_proxy:
        return {"proxy": _detected_proxy}
    return {}


def _scan_for_proxy_once() -> None:
    """Run the slow socket/HTTP probe exactly once per process.

    Sets ``_detected_proxy`` on success or ``_proxy_detection_negative`` on
    failure so neither this process nor concurrent callers repeat the work.
    """
    global _detected_proxy, _proxy_detection_done, _proxy_detection_negative
    if _proxy_detection_done:
        return
    if sys.platform != "win32":
        _proxy_detection_done = True
        _proxy_detection_negative = True
        return

    candidates: list[str] = []
    try:
        import winreg

        with winreg.OpenKey(
            winreg.HKEY_CURRENT_USER,
            r"Software\Microsoft\Windows\CurrentVersion\Internet Settings",
        ) as key:
            enable, _ = winreg.QueryValueEx(key, "ProxyEnable")
            if enable:
                server, _ = winreg.QueryValueEx(key, "ProxyServer")
                candidates.extend(_normalise_proxy_url(str(server)))
    except Exception:
        pass

    for port in (7897, 7890, 10809, 10814, 2080):
        candidates.append(f"http://127.0.0.1:{port}")

    import socket

    detected = None
    for candidate in candidates:
        host_port = (
            candidate.replace("http://", "")
            .replace("https://", "")
            .replace("socks5h://", "")
            .replace("socks5://", "")
        )
        host, _, port_s = host_port.partition(":")
        try:
            port = int(port_s)
            with socket.create_connection((host, port), timeout=1):
                pass
            try:
                with httpx.Client(timeout=6, proxy=candidate, verify=_ssl_ctx()) as client:
                    response = client.get("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/einfo.fcgi?db=pubmed&retmode=json")
                    if response.status_code == 200:
                        detected = candidate
                        logger.info(f"[literature] detected proxy {candidate}")
                        break
            except Exception:
                continue
        except Exception:
            continue

    if detected:
        _detected_proxy = detected
    else:
        _proxy_detection_negative = True
    _proxy_detection_done = True


async def ensure_proxy_detected() -> None:
    """Warm the proxy cache under a lock so concurrent searches share one scan.

    The previous code called the probe inside ``_proxy_kwargs`` once per
    ``httpx.AsyncClient``; with 4 sources firing concurrently that meant 4x
    redundant 30s scans on the very first search. This entrypoint runs the
    detection once (serialized), and ``_proxy_kwargs`` then reads the result.
    """
    if _detected_proxy or _proxy_detection_negative or _proxy_detection_done:
        return
    async with _proxy_lock:
        if _detected_proxy or _proxy_detection_negative or _proxy_detection_done:
            return
        await asyncio.to_thread(_scan_for_proxy_once)


def _norm(**kwargs) -> dict:
    return {key: value for key, value in kwargs.items() if value is not None or value == 0}


def _ssl_ctx():
    import ssl

    ctx = ssl.create_default_context()
    ctx.set_ciphers("DEFAULT@SECLEVEL=1")
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


def _client_kwargs(timeout: int | float) -> dict:
    return {"timeout": timeout, "headers": HEADERS, "verify": _ssl_ctx(), **_proxy_kwargs()}


async def search_pubmed(query: str, limit: int = 10) -> Optional[List[dict]]:
    """Search PubMed via NCBI eutils, falling back to Europe PMC on failure.

    NCBI eutils is the canonical source but its TLS endpoint
    (``eutils.ncbi.nlm.nih.gov``) is routinely blocked at the handshake layer
    in some networks (the connection succeeds at TCP, then the TLS handshake is
    severed with ``SSL: UNEXPECTED_EOF_WHILE_READING``). Europe PMC mirrors the
    full PubMed corpus (its ``MED`` source *is* PubMed) and is hosted in Europe
    where it is reliably reachable, so when the primary call fails for any
    reason we transparently retry the same query against Europe PMC. The
    returned items keep ``source="pubmed"`` so downstream dedupe/display logic
    is unchanged.
    """
    result = None
    try:
        result = await _search_pubmed_eutils(query, limit)
    except Exception as exc:
        # The primary path normally swallows its own errors and returns None,
        # but defend against any propagation so a fallback is always attempted.
        logger.warning(f"[literature] eutils wrapper raised ({exc}); falling back")
        result = None
    if result is not None:
        return result
    logger.info("[literature] NCBI eutils unreachable; falling back to Europe PMC for PubMed")
    return await search_europepmc(query, limit)


async def _search_pubmed_eutils(query: str, limit: int = 10) -> Optional[List[dict]]:
    """Primary PubMed path via NCBI eutils. Returns None on connection failure."""
    base = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
    try:
        async with httpx.AsyncClient(**_client_kwargs(30)) as client:
            response = await client.get(f"{base}/esearch.fcgi", params={
                "db": "pubmed",
                "term": query,
                "retmax": limit,
                "retmode": "json",
            })
            response.raise_for_status()
            ids = response.json().get("esearchresult", {}).get("idlist", [])
            if not ids:
                return []
            details = await client.get(f"{base}/efetch.fcgi", params={
                "db": "pubmed",
                "id": ",".join(ids),
                "retmode": "xml",
            })
            details.raise_for_status()
            data = xmltodict.parse(details.text)
        articles = data.get("PubmedArticleSet", {}).get("PubmedArticle", [])
        if isinstance(articles, dict):
            articles = [articles]
        out = []
        for article in articles:
            med = article.get("MedlineCitation", {})
            art = med.get("Article", {})
            title = art.get("ArticleTitle")
            if not title:
                continue

            authors_raw = art.get("AuthorList", {}).get("Author", [])
            if isinstance(authors_raw, dict):
                authors_raw = [authors_raw]
            authors = []
            for author in authors_raw:
                last = author.get("LastName") or ""
                initials = author.get("Initials") or ""
                if last:
                    authors.append(f"{last} {initials}".strip())

            journal = art.get("Journal", {})
            journal_title = journal.get("Title", "")
            try:
                year = int(journal.get("JournalIssue", {}).get("PubDate", {}).get("Year", 0)) or None
            except Exception:
                year = None

            abstract_node = art.get("Abstract", {}).get("AbstractText")
            if isinstance(abstract_node, list):
                abstract = " ".join(
                    (item.get("#text", item) if isinstance(item, dict) else str(item)) for item in abstract_node
                )
            elif isinstance(abstract_node, dict):
                abstract = abstract_node.get("#text", "")
            else:
                abstract = abstract_node or ""

            doi = ""
            for item in article.get("PubmedData", {}).get("ArticleIdList", {}).get("ArticleId", []):
                if isinstance(item, dict) and item.get("@IdType") == "doi":
                    doi = item.get("#text", "")
                    break

            out.append(_norm(
                title=title,
                authors=", ".join(authors[:6]),
                journal=journal_title,
                year=year,
                doi=doi,
                abstract=abstract[:600],
                source="pubmed",
                url=f"https://pubmed.ncbi.nlm.nih.gov/{med.get('PMID', '')}/",
            ))
        return out
    except Exception as exc:
        # Connection-level failures (SSL EOF, timeout, DNS) mean the endpoint is
        # unreachable on this network — return None so the caller can fall back
        # to Europe PMC. Distinguish from a successful empty result (return []),
        # which must NOT trigger the fallback.
        type_name = type(exc).__name__.lower()
        repr_text = repr(exc).lower()
        msg = (str(exc) or repr_text).lower()
        connection_like = (
            any(s in msg for s in (
                "eof", "ssl", "timeout", "timed out", "connect", "connection",
                "name or service not known", "nodename", "no address", "temporarily",
                "unreachable", "reset", "broken pipe", "read error", "write error",
            ))
            or any(s in type_name for s in (
                "connecterror", "connecttimeout", "readtimeout", "remoteprotocolerror",
                "proxerror", "networkerror",
            ))
        )
        if connection_like:
            logger.warning(f"[literature] NCBI eutils unreachable ({type(exc).__name__}: {exc}); will fall back")
        else:
            # A non-connection error (e.g. HTTP 4xx, parse error). We still
            # return None so the caller can try Europe PMC, but log it
            # distinctly so a real bug isn't hidden behind "unreachable".
            logger.warning(f"[literature] PubMed eutils error ({type(exc).__name__}: {exc}); trying fallback")
        return None


async def search_europepmc(query: str, limit: int = 10) -> Optional[List[dict]]:
    """Search Europe PMC, which mirrors the full PubMed corpus (source=MED).

    Used as the automatic fallback when NCBI eutils is blocked. Returns items
    tagged ``source="pubmed"`` so the rest of the app treats them as PubMed
    results. Europe PMC is hosted by EMBL-EBI in Europe and is reliably
    reachable from networks where ncbi.nlm.nih.gov is blocked at TLS.
    """
    try:
        async with httpx.AsyncClient(**_client_kwargs(25)) as client:
            response = await client.get(
                "https://www.ebi.ac.uk/europepmc/webservices/rest/search",
                params={
                    "query": query,
                    "resultType": "core",
                    "pageSize": min(max(limit, 1), 25),
                    "format": "json",
                    "source": "MED",  # restrict to the PubMed subset
                },
            )
            response.raise_for_status()
            data = response.json()
        results = (data.get("resultList") or {}).get("result", []) or []
        out = []
        for article in results:
            title = (article.get("title") or "").strip()
            if not title:
                continue
            pmid = article.get("pmid") or ""
            doi = article.get("doi") or ""
            # authorString is "Smith J, Doe A, ..."; keep up to 6 verbatim.
            authors = (article.get("authorString") or "").strip()
            if authors:
                authors = ", ".join(a.strip() for a in authors.split(",")[:6])
            # abstractText may contain light HTML; strip tags for the card.
            abstract = article.get("abstractText") or ""
            abstract = _strip_html(abstract)
            try:
                year = int(article.get("pubYear") or 0) or None
            except Exception:
                year = None
            out.append(_norm(
                title=title,
                authors=authors,
                journal=article.get("journalTitle") or "",
                year=year,
                doi=doi,
                abstract=abstract[:600],
                source="pubmed",
                url=f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/" if pmid else (f"https://doi.org/{doi}" if doi else ""),
            ))
        return out
    except Exception as exc:
        logger.warning(f"[literature] Europe PMC fallback failed: {exc}")
        return None


def _strip_html(text: str) -> str:
    """Remove simple HTML tags from Europe PMC abstract text."""
    import re as _re
    return _re.sub(r"<[^>]+>", "", text or "")


async def search_arxiv(query: str, limit: int = 10) -> Optional[List[dict]]:
    try:
        async with httpx.AsyncClient(**_client_kwargs(25)) as client:
            response = await client.get("http://export.arxiv.org/api/query", params={
                "search_query": f"all:{query}",
                "max_results": limit,
            })
            response.raise_for_status()
            data = xmltodict.parse(response.text)
        entries = data.get("feed", {}).get("entry", [])
        if isinstance(entries, dict):
            entries = [entries]
        out = []
        for entry in entries:
            authors_raw = entry.get("author", [])
            if isinstance(authors_raw, dict):
                authors_raw = [authors_raw]
            authors = ", ".join(author.get("name", "") for author in authors_raw if isinstance(author, dict))
            raw_id = entry.get("id", "")
            out.append(_norm(
                title=entry.get("title", "").strip().replace("\n", " "),
                authors=authors,
                journal="arXiv",
                year=int(entry.get("published", "")[:4]),
                doi="",
                abstract=(entry.get("summary", "") or "")[:600],
                source="arxiv",
                url=raw_id,
            ))
        return out
    except Exception as exc:
        logger.warning(f"arXiv search failed: {exc}")
        return None


async def search_crossref(query: str, limit: int = 10) -> Optional[List[dict]]:
    try:
        async with httpx.AsyncClient(**_client_kwargs(25)) as client:
            response = await client.get("https://api.crossref.org/works", params={
                "query": query,
                "rows": limit,
                "select": "DOI,title,author,container-title,published,abstract,is-referenced-by-count",
            })
            response.raise_for_status()
            items = response.json().get("message", {}).get("items", [])
        out = []
        for item in items:
            title = (item.get("title") or [""])[0]
            if not title:
                continue
            authors = ", ".join(
                f"{author.get('family', '')} {author.get('given', '')}".strip()
                for author in (item.get("author") or [])[:6]
            )
            journal = (item.get("container-title") or [""])[0]
            year = None
            date_parts = item.get("published", {}).get("date-parts", [[None]])
            if date_parts and date_parts[0]:
                year = date_parts[0][0]
            doi = item.get("DOI", "")
            out.append(_norm(
                title=title,
                authors=authors,
                journal=journal,
                year=year,
                doi=doi,
                citation_count=item.get("is-referenced-by-count", 0),
                abstract=(item.get("abstract") or "").replace("<jats:p>", "").replace("</jats:p>", "")[:600],
                source="crossref",
                url=f"https://doi.org/{doi}",
            ))
        return out
    except Exception as exc:
        logger.warning(f"CrossRef search failed: {exc}")
        return None


async def search_semantic_scholar(query: str, limit: int = 10) -> Optional[List[dict]]:
    try:
        async with httpx.AsyncClient(**_client_kwargs(25)) as client:
            response = await client.get("https://api.semanticscholar.org/graph/v1/paper/search", params={
                "query": query,
                "limit": limit,
                "fields": "title,authors,year,abstract,journal,citationCount,externalIds,url",
            })
            response.raise_for_status()
            data = response.json().get("data", [])
        out = []
        for paper in data:
            title = paper.get("title")
            if not title:
                continue
            authors = ", ".join(author.get("name", "") for author in (paper.get("authors") or [])[:6])
            journal = (paper.get("journal") or {}).get("name", "")
            out.append(_norm(
                title=title,
                authors=authors,
                journal=journal,
                year=paper.get("year"),
                doi=(paper.get("externalIds") or {}).get("DOI", ""),
                citation_count=paper.get("citationCount", 0),
                abstract=(paper.get("abstract") or "")[:600],
                source="semantic_scholar",
                url=paper.get("url", ""),
            ))
        return out
    except Exception as exc:
        logger.warning(f"Semantic Scholar search failed: {exc}")
        return None


SearchFn = Callable[[str, int], Awaitable[Optional[List[dict]]]]


_SOURCES: Dict[str, SearchFn] = {
    "pubmed": search_pubmed,
    "arxiv": search_arxiv,
    "crossref": search_crossref,
    "semantic_scholar": search_semantic_scholar,
}


async def search_all(query: str, sources: Optional[List[str]] = None, limit: int = 8) -> dict:
    # Warm the proxy cache exactly once before fanning out 4 concurrent
    # clients, otherwise each client re-runs the slow scan.
    await ensure_proxy_detected()

    if sources:
        requested = set(sources)
        funcs = {key: value for key, value in _SOURCES.items() if key in requested}
    else:
        funcs = dict(_SOURCES)

    tasks = {name: fn(query, limit) for name, fn in funcs.items()}
    gathered = await asyncio.gather(*tasks.values(), return_exceptions=True)
    results = dict(zip(tasks.keys(), gathered))

    failed = []
    ok_results = []
    for name, result in results.items():
        if isinstance(result, Exception) or result is None:
            failed.append(name)
        if isinstance(result, list) and result:
            ok_results.append(result)

    if not ok_results and failed:
        logger.info(f"[literature] requested sources failed {failed}; falling back to CrossRef and Semantic Scholar")
        fallback_tasks = {
            name: fn(query, limit)
            for name, fn in {
                "crossref": search_crossref,
                "semantic_scholar": search_semantic_scholar,
            }.items()
            if name not in funcs
        }
        if fallback_tasks:
            fallback = await asyncio.gather(*fallback_tasks.values(), return_exceptions=True)
            for name, result in zip(fallback_tasks.keys(), fallback):
                if isinstance(result, list) and result:
                    ok_results.append(result)
                elif (isinstance(result, Exception) or result is None) and name not in failed:
                    failed.append(name)

    merged: List[dict] = []
    seen_doi = set()
    for result in ok_results:
        for paper in result:
            doi = (paper.get("doi") or "").lower().strip()
            if doi and doi in seen_doi:
                continue
            if doi:
                seen_doi.add(doi)
            merged.append(paper)

    merged.sort(key=lambda item: item.get("citation_count", 0) or 0, reverse=True)
    papers = merged[:limit * 2]
    return {"papers": papers, "count": len(papers), "failed": failed}
